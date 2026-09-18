import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

// Keys and shapes come from lib/storage.ts and lib/types.ts — not guessed.
const STORAGE_KEYS = {
  trip: "travel-expense:trip",
  sharedTripLink: "travel-expense:shared-trip-link",
  joinedTrips: "travel-expense:joined-trips",
} as const;

// The shared trip every "joined" entry in this spec is built from.
const TRIP = {
  destinationCountry: "Japan",
  currency: "JPY",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
};

// The device's own local trip, distinct from TRIP so labels never collide.
const OWN_TRIP = {
  destinationCountry: "France",
  currency: "EUR",
  startDate: "2026-02-01",
  endDate: "2026-02-10",
};

interface SharedTripLinkSeed {
  tripId: string;
  shareToken: string;
  creatorToken: string;
}

interface SharedTripSummarySeed {
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
// the first render, or the app's redirects fire before the storage exists.
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

// Join via API directly, returning the parsed response body with participantId, participantToken, and trip.
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
    trip: joined.trip,
  };
}

test.describe("feature 018 — switch between multiple trips", () => {
  test("selecting a joined trip in the switcher shows its own summary", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");

    // Both keys in one addInitScript call, before the first render.
    await seedStorage(page, {
      trip: OWN_TRIP,
      joinedTrips: [buildJoinedTrip(link, joined, "Sam")],
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Switch trip" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Japan — Joined" }).click();

    await expect(page).toHaveURL(`/trips/${link.shareToken}`);
    await expect(page.getByRole("heading", { name: "Japan" })).toBeVisible();
    await expect(page.getByText("Joined as Sam.")).toBeVisible();
  });

  test("selecting my own trip from the switcher returns to my dashboard", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");
    await seedStorage(page, {
      trip: OWN_TRIP,
      joinedTrips: [buildJoinedTrip(link, joined, "Sam")],
    });

    await page.goto(`/trips/${link.shareToken}`);
    await expect(page.getByText("Joined as Sam.")).toBeVisible();

    await page.getByRole("button", { name: "Switch trip" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "France — Own trip" }).click();

    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByText(/Trip to France/)).toBeVisible();
  });

  test("the trip switched away from is still listed after switching", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");
    await seedStorage(page, {
      trip: OWN_TRIP,
      joinedTrips: [buildJoinedTrip(link, joined, "Sam")],
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Switch trip" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Japan — Joined" }).click();
    await expect(page.getByText("Joined as Sam.")).toBeVisible();

    await page.getByRole("button", { name: "Switch trip" }).click();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "France — Own trip" })
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Japan — Joined" })
    ).toBeVisible();
  });

  test("the switcher trigger is not shown with only one trip", async ({ page }) => {
    await seedStorage(page, { trip: OWN_TRIP });
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Switch trip" })).toHaveCount(0);
  });

  test("the switcher trigger is not shown before any trip exists", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Switch trip" })).toHaveCount(0);
  });

  test("a deleted shared trip is removed from the switcher after being selected", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");
    await seedStorage(page, {
      trip: OWN_TRIP,
      joinedTrips: [buildJoinedTrip(link, joined, "Sam")],
    });

    // Delete the trip server-side before the device ever opens the switcher.
    await request.delete(`/api/trips/${link.tripId}`, {
      headers: { "x-creator-token": link.creatorToken },
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Switch trip" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Japan — Joined" }).click();

    await expect(page.getByText("This trip is no longer available.")).toBeVisible();

    // The stale entry is pruned from storage once the trip is confirmed gone.
    const storedJoined = await page.evaluate(() => {
      const item = window.localStorage.getItem("travel-expense:joined-trips");
      return item === null ? null : (JSON.parse(item) as unknown[]);
    });
    expect(storedJoined).toHaveLength(0);

    // Back on "/" the device belongs to only one trip again, so the trigger hides itself.
    await page.getByRole("link", { name: "Back to home" }).click();
    await expect(page.getByRole("button", { name: "Switch trip" })).toHaveCount(0);
  });

  test("switching trips from a dirty expense form shows the unsaved-changes warning first", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");
    await seedStorage(page, {
      trip: OWN_TRIP,
      joinedTrips: [buildJoinedTrip(link, joined, "Sam")],
    });

    await page.goto("/expenses/new");
    await page.getByLabel("Location").fill("Cafe");

    // Register the native confirm handler before the click that should trigger it.
    let dialogSeen = false;
    page.once("dialog", async (dialog) => {
      dialogSeen = true;
      await dialog.dismiss();
    });

    await page.getByRole("button", { name: "Switch trip" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Japan — Joined" }).click();

    // Dismissing the warning leaves the user where they were, input intact.
    await expect.poll(() => dialogSeen).toBe(true);
    await expect(page).toHaveURL("/expenses/new");
    await expect(page.getByLabel("Location")).toHaveValue("Cafe");
  });

  test("switching to a joined trip while offline shows a connectivity message", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");
    await seedStorage(page, {
      trip: OWN_TRIP,
      joinedTrips: [buildJoinedTrip(link, joined, "Sam")],
    });

    await page.goto("/");
    await page.route("**/api/join/**", (route) => route.abort());

    await page.getByRole("button", { name: "Switch trip" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Japan — Joined" }).click();

    await expect(page.getByText(/internet connection/)).toBeVisible();
    // No stale or fabricated summary of the joined trip is shown.
    await expect(page.getByText("Japan", { exact: true })).toHaveCount(0);
  });

  test("my own trip survives a refresh", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");
    await seedStorage(page, {
      trip: OWN_TRIP,
      joinedTrips: [buildJoinedTrip(link, joined, "Sam")],
    });

    await page.goto("/");
    await page.reload();

    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByText(/Trip to France/)).toBeVisible();
  });

  test("a joined trip survives a refresh while online", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");
    await seedStorage(page, {
      trip: OWN_TRIP,
      joinedTrips: [buildJoinedTrip(link, joined, "Sam")],
    });

    await page.goto(`/trips/${link.shareToken}`);
    await expect(page.getByText("Joined as Sam.")).toBeVisible();

    await page.reload();

    await expect(page.getByRole("heading", { name: "Japan" })).toBeVisible();
    await expect(page.getByText("Joined as Sam.")).toBeVisible();
  });

  test("the switcher labels an unshared local trip Own trip", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");
    // No sharedTripLink key at all: the local trip has never been shared.
    await seedStorage(page, {
      trip: OWN_TRIP,
      joinedTrips: [buildJoinedTrip(link, joined, "Sam")],
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Switch trip" }).click();

    await expect(
      page.getByRole("dialog").getByRole("link", { name: "France — Own trip" })
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Japan — Joined" })
    ).toBeVisible();
  });

  test("the switcher labels a shared local trip Created", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");
    await seedStorage(page, {
      trip: OWN_TRIP,
      sharedTripLink: {
        tripId: "any-id",
        shareToken: "any-token",
        creatorToken: "any-creator-token",
      },
      joinedTrips: [buildJoinedTrip(link, joined, "Sam")],
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Switch trip" }).click();

    await expect(
      page.getByRole("dialog").getByRole("link", { name: "France — Created" })
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByRole("link", { name: "Japan — Joined" })
    ).toBeVisible();
  });

  test("a device with only joined trips is shown one of them instead of trip setup", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");
    // No "trip" key at all: this device has never had a local trip of its own.
    await seedStorage(page, { joinedTrips: [buildJoinedTrip(link, joined, "Sam")] });

    await page.goto("/");

    await expect(page).toHaveURL(`/trips/${link.shareToken}`);
    await expect(page.getByRole("heading", { name: "Japan" })).toBeVisible();
    await expect(page.getByText("Joined as Sam.")).toBeVisible();
    // The trip-setup form is never shown to this device.
    await expect(page.getByLabel("Destination country")).toHaveCount(0);
  });

  test("switching to my own trip never shows a connectivity message, even offline", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const joined = await joinViaApi(request, link.shareToken, "Sam");
    await seedStorage(page, {
      trip: OWN_TRIP,
      joinedTrips: [buildJoinedTrip(link, joined, "Sam")],
    });

    // Resolve the joined trip once while online, so it is a genuinely
    // already-viewed trip rather than one that never reached the network.
    await page.goto(`/trips/${link.shareToken}`);
    await expect(page.getByText("Joined as Sam.")).toBeVisible();

    // Every API call now fails, including the joined trip's revalidation.
    await page.route("**/api/**", (route) => route.abort());

    await page.getByRole("button", { name: "Switch trip" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "France — Own trip" }).click();

    // The local trip is pure local data: no connectivity gate, no message.
    await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
    await expect(page.getByText(/internet connection/)).toHaveCount(0);
  });
});
