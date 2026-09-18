import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Keys and shapes come from lib/storage.ts and lib/types.ts — not guessed.
const STORAGE_KEYS = {
  trip: "travel-expense:trip",
  sharedTripLink: "travel-expense:shared-trip-link",
} as const;

const TRIP = {
  destinationCountry: "Japan",
  currency: "JPY",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
};

interface SharedTripLinkSeed {
  tripId: string;
  shareToken: string;
  creatorToken: string;
}

// /settings redirects to / when getTrip() returns null, so every test needs
// an active trip seeded before the page's first render. A sharedTripLink is
// only seeded when the scenario needs to start from the "link already
// exists" state.
async function seed(page: Page, sharedTripLink: SharedTripLinkSeed | null = null) {
  await page.addInitScript(
    ([keys, trip, link]) => {
      window.localStorage.setItem(keys.trip, JSON.stringify(trip));
      if (link) {
        window.localStorage.setItem(keys.sharedTripLink, JSON.stringify(link));
      }
    },
    [STORAGE_KEYS, TRIP, sharedTripLink] as const
  );
}

// There is no mock/test-double layer in this stack (spec.md Open Question #1,
// Contrarian Review #3): the regenerate and teardown routes look the trip up
// for real in Neon by id + creatorToken. A sharedTripLink seeded with
// made-up values would 404 the moment a test regenerates or edits it, so
// scenarios that exercise those calls first create a *real* trip row via a
// direct API call (bypassing the UI, since generating through the UI is
// itself covered by scenario 1), then seed that real id/tokens into
// localStorage. This still satisfies "seed via page.addInitScript" — it just
// sources the seeded values from a real row instead of literals.
async function createRealTripLink(request: APIRequestContext): Promise<SharedTripLinkSeed> {
  const response = await request.post("/api/trips", { data: TRIP });
  const body = (await response.json()) as {
    id: string;
    shareToken: string;
    creatorToken: string;
  };
  return { tripId: body.id, shareToken: body.shareToken, creatorToken: body.creatorToken };
}

// Scopes assertions to ShareTripLink's own section: Next.js renders its own
// role="alert" route announcer on every page, and /settings has other
// role="alert"/role="status" elements of its own (ExchangeRateForm's saved
// message, the export/reset messages), so an unscoped getByRole("alert") or
// getByRole("status") is ambiguous. The <h2> is always a direct child of
// ShareTripLink's wrapping div in both its render branches.
function shareSection(page: Page) {
  return page.getByRole("heading", { name: "Invite friends" }).locator("..");
}

function linkParagraph(page: Page) {
  return shareSection(page).locator("p").filter({ hasText: "/join/" });
}

test.describe("feature 016 — generate a shareable trip link", () => {
  test("generates a link the first time you invite friends", async ({ page }) => {
    await seed(page);
    await page.goto("/settings");

    const section = shareSection(page);
    // Wait for the real POST /api/trips round trip explicitly rather than
    // relying on the link paragraph appearing within the default 5s expect
    // timeout — this is the one scenario that creates a brand-new Neon row
    // via the UI (every other scenario's createRealTripLink already has a
    // warm connection by the time it runs), and a cold serverless connect
    // can exceed 5s.
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().endsWith("/api/trips") && res.request().method() === "POST"
      ),
      section.getByRole("button", { name: "Invite friends" }).click(),
    ]);

    const paragraph = linkParagraph(page);
    await expect(paragraph).toBeVisible();
    const text = await paragraph.textContent();
    expect(text).toContain("/join/");
    expect(text?.startsWith(new URL(page.url()).origin)).toBe(true);
    await expect(section.getByRole("button", { name: "Copy link" })).toBeVisible();
  });

  test("reopening the invite action shows the same link", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await seed(page, link);
    await page.goto("/settings");

    const originalText = await linkParagraph(page).textContent();

    // Navigate away and back rather than reload, to exercise re-display via
    // a fresh mount rather than the same mounted component surviving.
    await page.goto("/");
    await page.goto("/settings");

    await expect(linkParagraph(page)).toHaveText(originalText ?? "");
  });

  test("regenerating shows a new link", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await seed(page, link);
    await page.goto("/settings");

    const originalText = await linkParagraph(page).textContent();
    const section = shareSection(page);

    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/regenerate")),
      section.getByRole("button", { name: "Generate new link" }).click(),
    ]);
    expect(response.ok()).toBe(true);

    await expect(linkParagraph(page)).not.toHaveText(originalText ?? "");
  });

  test("the previous link's token is genuinely replaced after regeneration", async ({
    page,
    request,
  }) => {
    // Not literally "replay the old x-creator-token against regenerate and
    // expect 403/404": creatorToken is never rotated by design (TS-016-04 —
    // only shareToken rotates), so that specific check can never fail even
    // against a broken implementation and would be a false-positive test.
    // There is also no by-shareToken lookup endpoint yet (that's feature
    // 017's job), so "the old link no longer works" cannot be verified at
    // the API level within 016 alone. The honest, achievable check here is
    // the user-observable proxy: the old shareToken string is genuinely gone
    // from what the UI now shows, not merely hidden alongside a new one.
    const link = await createRealTripLink(request);
    const originalToken = link.shareToken;
    await seed(page, link);
    await page.goto("/settings");

    const section = shareSection(page);
    await Promise.all([
      page.waitForResponse((res) => res.url().includes("/regenerate")),
      section.getByRole("button", { name: "Generate new link" }).click(),
    ]);

    const newText = await linkParagraph(page).textContent();
    expect(newText).not.toBeNull();
    expect(newText).not.toContain(originalToken);

    // The two tokens' lifecycles genuinely differ, confirmed directly against
    // the API rather than inferred from the UI: creatorToken still authorizes
    // a further call after shareToken has rotated away.
    const stillAuthorized = await request.post(`/api/trips/${link.tripId}/regenerate`, {
      headers: { "x-creator-token": link.creatorToken },
    });
    expect(stillAuthorized.status()).toBe(200);
  });

  test("starting a new trip invalidates the old link and the new trip has no link of its own", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    await seed(page, link);
    await page.goto("/trip/new");

    await page.getByRole("button", { name: "Delete and start new trip" }).click();
    await page.getByLabel("Destination country").selectOption("France");
    await page.getByLabel("Start date").fill("2026-03-01");
    await page.getByLabel("End date").fill("2026-03-10");

    // submitNewTrip fires the teardown DELETE without awaiting it (fire-and-
    // forget by design, so a slow/failed delete never blocks new-trip
    // creation — see lib/trip.ts). Wait for that response directly rather
    // than assuming enough time has passed by the time later assertions run,
    // or the DELETE-replay check below could race the original request.
    await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes(`/api/trips/${link.tripId}`) && res.request().method() === "DELETE"
      ),
      page.getByRole("button", { name: "Start tracking" }).click(),
    ]);

    await expect(page).toHaveURL("/");

    // A client-side nav.Link click, not page.goto("/settings") — page.goto is
    // a full navigation, which re-fires this test's page.addInitScript and
    // would re-seed the ORIGINAL (pre-teardown) trip/link values right back
    // into localStorage, masking the very teardown this test exists to check.
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(
      shareSection(page).getByRole("button", { name: "Invite friends" })
    ).toBeVisible();

    // Direct server-side confirmation, not just the UI's absence of a link:
    // the outgoing trip's row is actually gone, so a second DELETE against it
    // 404s rather than succeeding again.
    const replay = await request.delete(`/api/trips/${link.tripId}`, {
      headers: { "x-creator-token": link.creatorToken },
    });
    expect(replay.status()).toBe(404);
  });

  test("editing trip details keeps the same link", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await seed(page, link);
    await page.goto("/settings");

    const originalText = await linkParagraph(page).textContent();

    await page.goto("/trip/edit");
    await page.getByLabel("Budget (optional)").fill("500");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL("/");

    // In-app link, not page.goto: page.goto is a full navigation, which
    // re-fires this test's page.addInitScript and would re-seed the
    // ORIGINAL, pre-edit sharedTripLink value right back into localStorage —
    // masking a real regression the same way the new-trip test's page.goto
    // did before that was fixed (see the comment there).
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL("/settings");
    await expect(linkParagraph(page)).toHaveText(originalText ?? "");
  });

  test("shows a friendly error when generation fails offline", async ({ page }) => {
    await seed(page);
    await page.route("**/api/trips", (route) => route.abort());
    await page.goto("/settings");

    const section = shareSection(page);
    await section.getByRole("button", { name: "Invite friends" }).click();

    await expect(section.getByRole("alert")).toBeVisible();
    await expect(linkParagraph(page)).toHaveCount(0);
  });

  test("shows a friendly error when regeneration fails, keeping the old link", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    await seed(page, link);
    await page.goto("/settings");

    const originalText = await linkParagraph(page).textContent();

    // Scoped only to the regenerate path — generation and teardown must
    // keep working normally in this and every other test.
    await page.route("**/api/trips/**/regenerate", (route) => route.abort());

    const section = shareSection(page);
    await section.getByRole("button", { name: "Generate new link" }).click();

    await expect(section.getByRole("alert")).toBeVisible();
    await expect(linkParagraph(page)).toHaveText(originalText ?? "");
  });

  test("double-clicking generate issues exactly one request", async ({ page }) => {
    await seed(page);
    let requestCount = 0;
    await page.route("**/api/trips", async (route) => {
      requestCount += 1;
      await route.continue();
    });
    await page.goto("/settings");

    const button = shareSection(page).getByRole("button", { name: "Invite friends" });
    // Two raw DOM click events dispatched back-to-back, not two Playwright
    // .click() calls. Playwright's .click() waits for the element to be
    // "enabled" before it acts, but this component disables the button
    // synchronously on the very first click (isPending flips before any
    // await, per components/ShareTripLink.tsx) — a second .click() then
    // deadlocks waiting for "enabled," which never happens again before the
    // button unmounts into the link-exists view on success. That would fail
    // on element-detached flakiness without ever exercising the guard.
    // dispatchEvent bypasses the actionability wait and fires both events in
    // the same synchronous tick, matching what a genuine rapid double-tap
    // looks like at the DOM level — exactly what the in-flight ref guard
    // (set synchronously at the top of the handler, before any await) exists
    // to survive.
    await button.evaluate((el) => {
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await expect(linkParagraph(page)).toBeVisible();
    expect(requestCount).toBe(1);
  });

  test("the link survives a refresh", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await seed(page, link);
    await page.goto("/settings");

    const originalText = await linkParagraph(page).textContent();
    await page.reload();

    await expect(linkParagraph(page)).toHaveText(originalText ?? "");
  });

  test("copying the link shows a confirmation and puts it on the clipboard", async ({
    page,
    context,
    request,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "http://localhost:3000",
    });
    const link = await createRealTripLink(request);
    await seed(page, link);
    await page.goto("/settings");

    const displayedText = await linkParagraph(page).textContent();

    await shareSection(page).getByRole("button", { name: "Copy link" }).click();

    await expect(shareSection(page).getByRole("status")).toBeVisible();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(displayedText);
  });
});
