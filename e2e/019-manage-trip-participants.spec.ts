import {
  test,
  expect,
  type Page,
  type Locator,
  type APIRequestContext,
} from "@playwright/test";

// Keys and shapes come from lib/storage.ts and lib/types.ts — not guessed.
const STORAGE_KEYS = {
  sharedTripLink: "travel-expense:shared-trip-link",
  joinedTrips: "travel-expense:joined-trips",
} as const;

// Fixed trip body for every real trip created by this spec, so the
// JoinedTrip fixtures below can be built from known values.
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

interface SharedTripSummarySeed {
  id: string;
  destinationCountry: string;
  currency: string;
  startDate: string;
  endDate: string;
}

interface JoinResponse {
  participantId: string;
  participantToken: string;
  trip: SharedTripSummarySeed;
}

interface JoinedTripSeed {
  tripId: string;
  shareToken: string;
  participantId: string;
  participantToken: string;
  participantName: string;
  trip: SharedTripSummarySeed;
}

// Seed localStorage for tests that need it. Must run via addInitScript BEFORE
// the first render: a beforeEach that navigates first is too late.
async function seedStorage(page: Page, storageData: Record<string, unknown>) {
  await page.addInitScript(
    ([keys, data]) => {
      Object.entries(data).forEach(([key, value]) => {
        window.localStorage.setItem(keys[key as keyof typeof keys], JSON.stringify(value));
      });
    },
    [STORAGE_KEYS, storageData] as const
  );
}

// Create a real trip + link via direct API call, bypassing the UI.
// Returns { tripId, shareToken, creatorToken } to seed or use in tests.
async function createRealTripLink(request: APIRequestContext): Promise<SharedTripLinkSeed> {
  const response = await request.post("/api/trips", { data: TRIP });
  const body = (await response.json()) as {
    id: string;
    shareToken: string;
    creatorToken: string;
  };
  return { tripId: body.id, shareToken: body.shareToken, creatorToken: body.creatorToken };
}

// Join via API directly, returning the parsed response body with
// participantId, participantToken, and trip.
async function joinViaApi(
  request: APIRequestContext,
  shareToken: string,
  name: string
): Promise<JoinResponse> {
  const response = await request.post(`/api/join/${shareToken}`, { data: { name } });
  return response.json();
}

// Build the exact JoinedTrip shape lib/storage.ts persists under
// "travel-expense:joined-trips", from a real trip link + real join response.
function buildJoinedTrip(
  link: SharedTripLinkSeed,
  joined: JoinResponse,
  name: string
): JoinedTripSeed {
  return {
    tripId: link.tripId,
    shareToken: link.shareToken,
    participantId: joined.participantId,
    participantToken: joined.participantToken,
    participantName: name,
    trip: {
      id: link.tripId,
      destinationCountry: TRIP.destinationCountry,
      currency: TRIP.currency,
      startDate: TRIP.startDate,
      endDate: TRIP.endDate,
    },
  };
}

// ManageParticipants.tsx's own rendered container (`flex flex-col gap-4 p-4`),
// located via the "Participants" heading it always renders. Scoping alerts and
// rows to this container keeps assertions away from Next.js's own route
// announcer, which is a page-level role="alert" on every route.
function participantsScreen(page: Page): Locator {
  return page.getByRole("heading", { name: "Participants" }).locator("..");
}

// ManageParticipants renders nothing until its role resolves and its list
// request settles, and dev-mode Next.js compiles each dynamic route on first
// request — a cold server can take longer than the default 5s assertion timeout
// to reach the screen. Settle that one wait explicitly and generously so every
// later assertion keeps the default timeout; this only extends how long we wait
// for the screen, it does not relax what any assertion requires.
async function waitForParticipantsScreen(page: Page): Promise<Locator> {
  const view = participantsScreen(page);
  await expect(view).toBeVisible({ timeout: 15_000 });
  return view;
}

// The single row for a participant, by display name.
function participantRow(page: Page, name: string): Locator {
  return participantsScreen(page).getByRole("listitem").filter({ hasText: name });
}

// The confirm panel's button. Scoping to the dialog matters: the row button and
// the dialog's confirm button share the same accessible name ("Remove"/"Leave"),
// so an unscoped getByRole would fail Playwright's strict mode.
function dialogButton(page: Page, name: "Remove" | "Leave" | "Cancel"): Locator {
  return page.getByRole("dialog").getByRole("button", { name });
}

test.describe("feature 019 — manage trip participants", () => {
  test("the participants screen lists everyone including a labeled creator", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    await joinViaApi(request, link.shareToken, "Blair");

    await seedStorage(page, { joinedTrips: [buildJoinedTrip(link, alex, "Alex")] });

    await page.goto(`/trips/${link.shareToken}/participants`);

    const view = await waitForParticipantsScreen(page);
    await expect(view.getByText("Trip creator")).toBeVisible();
    await expect(view.getByText("Alex")).toBeVisible();
    await expect(view.getByText("Blair")).toBeVisible();
  });

  test("the creator can remove a participant, who then disappears from the list", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    await joinViaApi(request, link.shareToken, "Alex");
    await joinViaApi(request, link.shareToken, "Blair");

    await seedStorage(page, {
      sharedTripLink: {
        tripId: link.tripId,
        shareToken: link.shareToken,
        creatorToken: link.creatorToken,
      },
    });

    await page.goto(`/trips/${link.shareToken}/participants`);

    const view = await waitForParticipantsScreen(page);
    await participantRow(page, "Blair").getByRole("button", { name: "Remove" }).click();
    await dialogButton(page, "Remove").click();

    await expect(view.getByText("Blair")).toHaveCount(0);
    await expect(view.getByText("Alex")).toBeVisible();
  });

  test("a participant sees no remove control on another participant's row", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    await joinViaApi(request, link.shareToken, "Blair");

    await seedStorage(page, { joinedTrips: [buildJoinedTrip(link, alex, "Alex")] });

    await page.goto(`/trips/${link.shareToken}/participants`);

    // The list itself loaded (so the absence assertion below is not vacuous).
    const view = await waitForParticipantsScreen(page);
    await expect(view.getByText("Blair")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
  });

  test("a participant can leave, and is redirected home", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    await seedStorage(page, { joinedTrips: [buildJoinedTrip(link, alex, "Alex")] });

    await page.goto(`/trips/${link.shareToken}/participants`);

    await waitForParticipantsScreen(page);

    await participantRow(page, "Alex").getByRole("button", { name: "Leave" }).click();
    await dialogButton(page, "Leave").click();

    await expect(page).toHaveURL("/");

    // The leaving device no longer offers this trip at all.
    const storedJoined = await page.evaluate(() => {
      const item = window.localStorage.getItem("travel-expense:joined-trips");
      return item === null ? null : (JSON.parse(item) as Array<{ shareToken: string }>);
    });
    expect(Array.isArray(storedJoined)).toBe(true);
    expect(storedJoined).toHaveLength(0);
  });

  test("the creator's own row offers no leave action", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await joinViaApi(request, link.shareToken, "Alex");

    await seedStorage(page, {
      sharedTripLink: {
        tripId: link.tripId,
        shareToken: link.shareToken,
        creatorToken: link.creatorToken,
      },
    });

    await page.goto(`/trips/${link.shareToken}/participants`);

    const view = await waitForParticipantsScreen(page);
    await expect(view.getByText("Trip creator")).toBeVisible();
    await expect(page.getByRole("button", { name: "Leave" })).toHaveCount(0);
  });

  test("removing one participant leaves an unrelated participant's row unaffected", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    await joinViaApi(request, link.shareToken, "Alex");
    await joinViaApi(request, link.shareToken, "Blair");
    await joinViaApi(request, link.shareToken, "Cass");

    await seedStorage(page, {
      sharedTripLink: {
        tripId: link.tripId,
        shareToken: link.shareToken,
        creatorToken: link.creatorToken,
      },
    });

    await page.goto(`/trips/${link.shareToken}/participants`);

    const view = await waitForParticipantsScreen(page);
    await participantRow(page, "Blair").getByRole("button", { name: "Remove" }).click();
    await dialogButton(page, "Remove").click();

    await expect(view.getByText("Blair")).toHaveCount(0);
    for (const name of ["Alex", "Cass"]) {
      const row = participantRow(page, name);
      await expect(row.getByText(name, { exact: true })).toBeVisible();
      await expect(row.getByRole("button", { name: "Remove" })).toBeVisible();
    }
  });

  test("removing one of two same-named participants leaves the other intact", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const first = await joinViaApi(request, link.shareToken, "Alex");
    const second = await joinViaApi(request, link.shareToken, "Alex");

    await seedStorage(page, {
      sharedTripLink: {
        tripId: link.tripId,
        shareToken: link.shareToken,
        creatorToken: link.creatorToken,
      },
    });

    await page.goto(`/trips/${link.shareToken}/participants`);

    const view = await waitForParticipantsScreen(page);
    const alexRows = view.getByRole("listitem").filter({ hasText: "Alex" });
    await expect(alexRows).toHaveCount(2);

    // Remove the SECOND "Alex" specifically — its own row, not the first one.
    await alexRows.nth(1).getByRole("button", { name: "Remove" }).click();
    await dialogButton(page, "Remove").click();

    await expect(alexRows).toHaveCount(1);

    // The remaining row is the first join, confirmed against the server itself.
    const response = await request.get(`/api/trips/${link.tripId}/participants`, {
      headers: { "x-creator-token": link.creatorToken },
    });
    const body = (await response.json()) as {
      participants: Array<{ id: string; name: string }>;
    };
    expect(body.participants.some((p) => p.id === first.participantId)).toBe(true);
    expect(body.participants.some((p) => p.id === second.participantId)).toBe(false);
  });

  test("cancelling the confirmation leaves the list unchanged", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await joinViaApi(request, link.shareToken, "Alex");

    await seedStorage(page, {
      sharedTripLink: {
        tripId: link.tripId,
        shareToken: link.shareToken,
        creatorToken: link.creatorToken,
      },
    });

    await page.goto(`/trips/${link.shareToken}/participants`);
    await waitForParticipantsScreen(page);

    // Count DELETE requests actually issued to the participants endpoints.
    let deleteCount = 0;
    await page.route("**/api/trips/*/participants/**", async (route) => {
      if (route.request().method() === "DELETE") {
        deleteCount += 1;
      }
      await route.continue();
    });

    await participantRow(page, "Alex").getByRole("button", { name: "Remove" }).click();
    await dialogButton(page, "Cancel").click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(participantsScreen(page).getByText("Alex")).toBeVisible();
    expect(deleteCount).toBe(0);
  });

  test("confirming leave or remove while the request cannot complete shows one friendly error and leaves the list unchanged", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    await joinViaApi(request, link.shareToken, "Alex");

    await seedStorage(page, {
      sharedTripLink: {
        tripId: link.tripId,
        shareToken: link.shareToken,
        creatorToken: link.creatorToken,
      },
    });

    // Installed BEFORE navigating so the initial GET that loads the list still
    // succeeds; only the DELETE that acts on the list is aborted.
    await page.route("**/api/trips/*/participants/**", async (route) => {
      if (route.request().method() === "DELETE") {
        await route.abort();
      } else {
        await route.continue();
      }
    });

    await page.goto(`/trips/${link.shareToken}/participants`);

    const view = await waitForParticipantsScreen(page);

    await participantRow(page, "Alex").getByRole("button", { name: "Remove" }).click();
    await dialogButton(page, "Remove").click();

    await expect(view.getByRole("alert")).toContainText("Could not reach the server");
    await expect(view.getByText("Alex")).toBeVisible();
  });

  test("visiting the participants screen for a trip I don't belong to redirects home", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    // Nothing seeded: this device is neither the creator nor a participant.

    await page.goto(`/trips/${link.shareToken}/participants`);

    await expect(page).toHaveURL("/");
    // No participant row and no "Trip creator" label ever rendered.
    await expect(page.getByRole("heading", { name: "Participants" })).toHaveCount(0);
    await expect(page.getByText("Trip creator")).toHaveCount(0);
  });
});
