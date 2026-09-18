import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Keys and shapes come from lib/storage.ts and lib/types.ts — not guessed.
const STORAGE_KEYS = {
  trip: "travel-expense:trip",
  joinedTrips: "travel-expense:joined-trips",
} as const;

// Fixed TRIP constant for all real trip creation in this spec.
const TRIP = {
  destinationCountry: "Japan",
  currency: "JPY",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
};

// TRIP constant for past dates (for scenario 8).
const PAST_TRIP = {
  destinationCountry: "Japan",
  currency: "JPY",
  startDate: "2020-01-01",
  endDate: "2020-01-10",
};

interface SharedTripLinkSeed {
  tripId: string;
  shareToken: string;
  creatorToken: string;
}

interface JoinedTrip {
  tripId: string;
  shareToken: string;
  participantId: string;
  participantToken: string;
  participantName: string;
  trip: {
    destinationCountry: string;
    currency: string;
    startDate: string;
    endDate: string;
  };
}

// Seed localStorage for tests that need it (scenarios 9 and 10).
// Unlike 016, most tests don't seed anything — /join/[token] doesn't redirect
// on a missing getTrip() solo trip.
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

// Create a real trip with past dates via direct API call.
async function createPastTripLink(request: APIRequestContext): Promise<SharedTripLinkSeed> {
  const response = await request.post("/api/trips", { data: PAST_TRIP });
  const body = (await response.json()) as {
    id: string;
    shareToken: string;
    creatorToken: string;
  };
  return { tripId: body.id, shareToken: body.shareToken, creatorToken: body.creatorToken };
}

// Join via API directly, returning the parsed response body with participantId, participantToken, and trip.
async function joinViaApi(
  request: APIRequestContext,
  shareToken: string,
  name: string
): Promise<{
  participantId: string;
  participantToken: string;
  trip: {
    destinationCountry: string;
    currency: string;
    startDate: string;
    endDate: string;
  };
}> {
  const response = await request.post(`/api/join/${shareToken}`, { data: { name } });
  return response.json();
}

// Locator helper for the join screen's invalid state.
// Contains heading "Join a trip" and text "isn't valid".
function joinScreenInvalid(page: Page) {
  return page
    .getByRole("heading", { name: "Join a trip" })
    .locator("..")
    .filter({ hasText: /isn.t valid/i });
}

// Locator helper for the join screen's offline state.
// Contains heading "Join a trip" and text about internet connection.
function joinScreenOffline(page: Page) {
  return page
    .getByRole("heading", { name: "Join a trip" })
    .locator("..")
    .filter({ hasText: /internet connection/i });
}

// Locator helper for the join screen's ready state.
// Contains heading "Join a trip", intro text "You are joining a trip to", and the form.
function joinScreenReady(page: Page) {
  return page
    .getByRole("heading", { name: "Join a trip" })
    .locator("..")
    .filter({ hasText: /You are joining a trip to/i });
}

// Locator helper for the joined confirmation view.
// The joined state is uniquely identified by the "Back to home" link which only appears there.
function joinedView(page: Page) {
  return page.getByRole("link", { name: "Back to home" });
}

test.describe("feature 017 — join a shared trip via link", () => {
  test("joining via a valid link shows a confirming trip view", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await page.goto(`/join/${link.shareToken}`);

    // Wait for ready state to appear
    await expect(joinScreenReady(page)).toBeVisible();

    // Fill name and submit, waiting for the POST response
    await page.getByLabel("Your name").fill("Sam");
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/join/${link.shareToken}`) && res.request().method() === "POST"
      ),
      joinScreenReady(page).getByRole("button", { name: "Join" }).click(),
    ]);

    // Wait for joined view to appear by checking for "Back to home" link
    await expect(joinedView(page)).toBeVisible();

    // Verify trip details
    await expect(page.getByRole("heading", { name: "Japan" })).toBeVisible();
    await expect(page.getByText("Joined as Sam.")).toBeVisible();
  });

  test("joining with a name not yet used succeeds", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    // Pre-seed a participant "Alex" via API
    await joinViaApi(request, link.shareToken, "Alex");

    await page.goto(`/join/${link.shareToken}`);
    await expect(joinScreenReady(page)).toBeVisible();

    // Join as a different name
    await page.getByLabel("Your name").fill("Jordan");
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/join/${link.shareToken}`) && res.request().method() === "POST"
      ),
      joinScreenReady(page).getByRole("button", { name: "Join" }).click(),
    ]);

    // Wait for joined view
    await expect(joinedView(page)).toBeVisible();
    await expect(page.getByText("Joined as Jordan.")).toBeVisible();
  });

  test("joining with a name already used by another participant still succeeds", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    // Pre-seed a participant "Alex" via API
    await joinViaApi(request, link.shareToken, "Alex");

    await page.goto(`/join/${link.shareToken}`);
    await expect(joinScreenReady(page)).toBeVisible();

    // Join with the same name
    await page.getByLabel("Your name").fill("Alex");
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/join/${link.shareToken}`) && res.request().method() === "POST"
      ),
      joinScreenReady(page).getByRole("button", { name: "Join" }).click(),
    ]);

    // Wait for joined view
    await expect(joinedView(page)).toBeVisible();
    await expect(page.getByText("Joined as Alex.")).toBeVisible();
  });

  test("a name longer than 50 characters is capped while typing", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await page.goto(`/join/${link.shareToken}`);
    await expect(joinScreenReady(page)).toBeVisible();

    // Fill with a 60-character string
    const longName = "A".repeat(60);
    await page.getByLabel("Your name").fill(longName);

    // Read the input's actual value
    const inputValue = await page.getByLabel("Your name").inputValue();
    expect(inputValue.length).toBe(50);
    expect(inputValue).toBe(longName.substring(0, 50));
  });

  test("a regenerated link's old token shows the invalid-link message", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const originalToken = link.shareToken;

    // Regenerate the link, which rotates the shareToken
    await request.post(`/api/trips/${link.tripId}/regenerate`, {
      headers: { "x-creator-token": link.creatorToken },
    });

    // Navigate to the old token
    await page.goto(`/join/${originalToken}`);

    // Expect invalid message
    const invalid = joinScreenInvalid(page);
    await expect(invalid).toBeVisible();
    // Confirm no form or joined view appears
    await expect(joinScreenReady(page)).toHaveCount(0);
    await expect(joinedView(page)).toHaveCount(0);
  });

  test("a deleted trip's link shows the invalid-link message", async ({ page, request }) => {
    const link = await createRealTripLink(request);

    // Delete the trip
    await request.delete(`/api/trips/${link.tripId}`, {
      headers: { "x-creator-token": link.creatorToken },
    });

    // Navigate to the link
    await page.goto(`/join/${link.shareToken}`);

    // Expect invalid message
    const invalid = joinScreenInvalid(page);
    await expect(invalid).toBeVisible();
    await expect(joinScreenReady(page)).toHaveCount(0);
    await expect(joinedView(page)).toHaveCount(0);
  });

  test("a malformed token shows the invalid-link message", async ({ page }) => {
    await page.goto("/join/not-a-real-token-xyz");

    const invalid = joinScreenInvalid(page);
    await expect(invalid).toBeVisible();
    await expect(joinScreenReady(page)).toHaveCount(0);
    await expect(joinedView(page)).toHaveCount(0);
  });

  test("joining succeeds when the trip's end date is in the past", async ({ page, request }) => {
    const link = await createPastTripLink(request);
    await page.goto(`/join/${link.shareToken}`);

    await expect(joinScreenReady(page)).toBeVisible();

    // Fill name and submit
    await page.getByLabel("Your name").fill("Sam");
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/join/${link.shareToken}`) && res.request().method() === "POST"
      ),
      joinScreenReady(page).getByRole("button", { name: "Join" }).click(),
    ]);

    // Wait for joined view
    await expect(joinedView(page)).toBeVisible();
    await expect(page.getByText("Joined as Sam.")).toBeVisible();
  });

  test("joining a shared trip leaves the local solo trip untouched", async ({
    page,
    request,
  }) => {
    // Seed a known solo trip via addInitScript BEFORE navigation
    const soloTrip = { destinationCountry: "France", currency: "EUR", startDate: "2026-02-01", endDate: "2026-02-10" };
    await seedStorage(page, { trip: soloTrip });

    // Create a separate shared trip+link
    const link = await createRealTripLink(request);
    await page.goto(`/join/${link.shareToken}`);
    await expect(joinScreenReady(page)).toBeVisible();

    // Join
    await page.getByLabel("Your name").fill("Sam");
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/join/${link.shareToken}`) && res.request().method() === "POST"
      ),
      joinScreenReady(page).getByRole("button", { name: "Join" }).click(),
    ]);

    // Wait for joined view
    await expect(joinedView(page)).toBeVisible();

    // Read the solo trip from localStorage and verify it hasn't changed
    const storedTrip = await page.evaluate(() => {
      const item = window.localStorage.getItem("travel-expense:trip");
      return item ? JSON.parse(item) : null;
    });

    expect(storedTrip).toEqual(soloTrip);
    expect(storedTrip.destinationCountry).toBe("France");
  });

  test("reopening the same link after already joining skips the name prompt", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);

    // Join via API to get a real participant record
    const joined = await joinViaApi(request, link.shareToken, "Sam");

    // Build a JoinedTrip object and seed it
    const joinedTrip: JoinedTrip = {
      tripId: link.tripId,
      shareToken: link.shareToken,
      participantId: joined.participantId,
      participantToken: joined.participantToken,
      participantName: "Sam",
      trip: joined.trip,
    };

    // Seed via addInitScript BEFORE navigation
    await seedStorage(page, { joinedTrips: [joinedTrip] });

    // Navigate to the link
    await page.goto(`/join/${link.shareToken}`);

    // Expect joined view to appear immediately with no name input
    await expect(joinedView(page)).toBeVisible();
    await expect(page.getByLabel("Your name")).toHaveCount(0);
    await expect(page.getByText("Joined as Sam.")).toBeVisible();
  });

  test("submitting a blank name shows an inline error and makes no request", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    await page.goto(`/join/${link.shareToken}`);
    await expect(joinScreenReady(page)).toBeVisible();

    // Set up request counter for POST to /api/join/**
    let postCount = 0;
    await page.route("**/api/join/**", async (route) => {
      if (route.request().method() === "POST") {
        postCount += 1;
      }
      await route.continue();
    });

    // Try to submit with empty name
    await joinScreenReady(page).getByRole("button", { name: "Join" }).click();

    // Expect error alert and no request made
    const readySection = joinScreenReady(page);
    await expect(readySection.getByRole("alert")).toBeVisible();
    expect(postCount).toBe(0);

    // Joined view should not be shown
    await expect(joinedView(page)).toHaveCount(0);
  });

  test("a join attempt shows a friendly error when the server is unreachable", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    await page.goto(`/join/${link.shareToken}`);
    await expect(joinScreenReady(page)).toBeVisible();

    // Allow GET to succeed, but abort POST
    await page.route("**/api/join/**", async (route) => {
      if (route.request().method() === "POST") {
        route.abort();
      } else {
        await route.continue();
      }
    });

    // Fill name and submit
    await page.getByLabel("Your name").fill("Sam");
    await joinScreenReady(page).getByRole("button", { name: "Join" }).click();

    // Expect error alert
    const readySection = joinScreenReady(page);
    await expect(readySection.getByRole("alert")).toBeVisible();

    // Joined view should not appear
    await expect(joinedView(page)).toHaveCount(0);
  });

  test("opening the link while offline shows a connectivity-specific message", async ({
    page,
  }) => {
    // Abort all requests to /api/join/** before navigating
    await page.route("**/api/join/**", (route) => route.abort());

    // Navigate to a link (real or fake token)
    await page.goto("/join/some-token");

    // Expect offline state with "internet connection" text
    const offline = joinScreenOffline(page);
    await expect(offline).toBeVisible();

    // Verify this is different from the invalid-link message
    const offlineText = await offline.textContent();
    expect(offlineText).toContain("internet connection");

    // The invalid message should not appear
    await expect(joinScreenInvalid(page)).toHaveCount(0);
  });

  test("double-tapping Join issues exactly one join request", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await page.goto(`/join/${link.shareToken}`);
    await expect(joinScreenReady(page)).toBeVisible();

    // Set up request counter
    let postCount = 0;
    await page.route("**/api/join/**", async (route) => {
      if (route.request().method() === "POST") {
        postCount += 1;
      }
      await route.continue();
    });

    // Fill name
    await page.getByLabel("Your name").fill("Sam");

    // Double-tap using dispatchEvent, not .click(), to match genuine rapid taps
    const button = joinScreenReady(page).getByRole("button", { name: "Join" });
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/join/${link.shareToken}`) && res.request().method() === "POST"
      ),
      button.evaluate((el) => {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }),
    ]);

    // Wait for joined view to appear
    await expect(joinedView(page)).toBeVisible();

    // Exactly one POST should have been issued
    expect(postCount).toBe(1);
  });

  test("two friends joining at the same time both succeed as distinct participants", async ({
    request,
  }) => {
    const link = await createRealTripLink(request);

    // Fire two join requests concurrently
    const [response1, response2] = await Promise.all([
      request.post(`/api/join/${link.shareToken}`, { data: { name: "Alex" } }),
      request.post(`/api/join/${link.shareToken}`, { data: { name: "Jordan" } }),
    ]);

    // Both should succeed (201)
    expect(response1.status()).toBe(201);
    expect(response2.status()).toBe(201);

    // Parse bodies
    const body1 = (await response1.json()) as { participantId: string };
    const body2 = (await response2.json()) as { participantId: string };

    // Participant IDs should differ
    expect(body1.participantId).not.toBe(body2.participantId);
  });

  test("a name of exactly 50 characters is accepted", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await page.goto(`/join/${link.shareToken}`);
    await expect(joinScreenReady(page)).toBeVisible();

    // Fill with exactly 50 characters
    const exactName = "A".repeat(50);
    await page.getByLabel("Your name").fill(exactName);

    // Submit
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/join/${link.shareToken}`) && res.request().method() === "POST"
      ),
      joinScreenReady(page).getByRole("button", { name: "Join" }).click(),
    ]);

    // Wait for joined view
    await expect(joinedView(page)).toBeVisible();
    await expect(page.getByText(`Joined as ${exactName}.`)).toBeVisible();
  });

  test("whitespace around a name is trimmed before joining", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await page.goto(`/join/${link.shareToken}`);
    await expect(joinScreenReady(page)).toBeVisible();

    // Fill with leading/trailing spaces
    await page.getByLabel("Your name").fill("  Sam  ");

    // Submit
    await Promise.all([
      page.waitForResponse(
        (res) =>
          res.url().includes(`/api/join/${link.shareToken}`) && res.request().method() === "POST"
      ),
      joinScreenReady(page).getByRole("button", { name: "Join" }).click(),
    ]);

    // Wait for joined view
    await expect(joinedView(page)).toBeVisible();
    await expect(page.getByText("Joined as Sam.")).toBeVisible();
  });
});
