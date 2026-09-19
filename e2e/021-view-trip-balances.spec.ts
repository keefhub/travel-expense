import {
  test,
  expect,
  type Page,
  type Locator,
  type APIRequestContext,
} from "@playwright/test";

// Keys and shapes come from lib/storage.ts and lib/types.ts — not guessed.
const STORAGE_KEYS = {
  trip: "travel-expense:trip",
  sharedTripLink: "travel-expense:shared-trip-link",
  joinedTrips: "travel-expense:joined-trips",
} as const;

// Fixed trip body for every real trip created by this spec, so the JoinedTrip
// fixtures below can be built from known values. The currency is the trip
// currency every assertion is expressed in.
const TRIP = {
  destinationCountry: "Singapore",
  currency: "SGD",
  startDate: "2026-01-01",
  endDate: "2026-01-10",
} as const;

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

interface ExpenseFixtureInput {
  amount: number;
  currency?: string;
  payerParticipantId: string | null;
  shares: Array<{ participantId: string | null; amount: number }>;
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

// Build the exact JoinedTrip shape lib/types.ts declares, from a real trip link
// + real join response. This is what a participant's own device holds, and what
// components/TripBalances.tsx's findJoinedTrip role resolution reads.
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

// What components/TripBalances.tsx's creator branch needs: the shared-trip
// pointer whose shareToken matches the route token. The local trip is included
// for parity with the rest of the shared-trip screens and is harmless here.
function creatorSession(link: SharedTripLinkSeed) {
  return {
    trip: { ...TRIP },
    sharedTripLink: {
      tripId: link.tripId,
      shareToken: link.shareToken,
      creatorToken: link.creatorToken,
    },
  };
}

// Create a real expense through the API, bypassing the UI (which cannot produce
// an arbitrary payer/split, an arbitrary currency, or a departed payer), so the
// balances computation has exact input. Currency defaults to the trip currency.
async function createExpenseViaApi(
  request: APIRequestContext,
  link: SharedTripLinkSeed,
  input: ExpenseFixtureInput
): Promise<{ id: string }> {
  const response = await request.post(`/api/trips/${link.tripId}/expenses`, {
    headers: { "x-creator-token": link.creatorToken },
    data: {
      amount: input.amount,
      currency: input.currency ?? TRIP.currency,
      category: "Food",
      date: "2026-01-05",
      paymentMethod: "Cash",
      location: "Singapore",
      payerParticipantId: input.payerParticipantId,
      shares: input.shares,
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { expense: { id: string } };
  return body.expense;
}

// Set a trip's exchange rate through the API — the write path exists on the
// server (PUT /api/trips/[id]/exchange-rates) even though feature 021 ships no
// entry UI for it, so a test can put a rate on file the same way a future
// screen would.
async function setExchangeRateViaApi(
  request: APIRequestContext,
  link: SharedTripLinkSeed,
  currency: string,
  rate: number
): Promise<void> {
  const response = await request.put(`/api/trips/${link.tripId}/exchange-rates`, {
    headers: { "x-creator-token": link.creatorToken },
    data: { currency, rate },
  });
  expect(response.status()).toBe(200);
}

// Remove a participant through the API, as the creator.
async function removeViaApi(
  request: APIRequestContext,
  link: SharedTripLinkSeed,
  participantId: string
): Promise<void> {
  const response = await request.delete(
    `/api/trips/${link.tripId}/participants/${participantId}`,
    { headers: { "x-creator-token": link.creatorToken } }
  );
  expect(response.status()).toBe(200);
}

// components/TripBalances.tsx's own rendered container (`flex flex-col gap-4
// p-4`), in both its ready and its load-error branch. Located via the
// "Balances" heading it renders in both. Scoping alerts, statuses and list
// assertions to this container keeps them away from Next.js's own route
// announcer, which is a page-level role="alert" on every route.
function balancesScreen(page: Page): Locator {
  return page.getByRole("heading", { name: "Balances" }).locator("..");
}

// The settlement list itself. It only exists once the component has resolved a
// role and a successful fetch, so every test that asserts on rendered lines
// waits for the screen first — otherwise a "0 items" assertion on a
// still-loading page (the component renders null until then) would pass
// vacuously.
async function waitForBalancesScreen(page: Page): Promise<Locator> {
  // This app is entirely client-rendered and dev-mode Next.js compiles each
  // dynamic route on first request, so a cold server can take longer than the
  // default 5s assertion timeout to reach a screen.
  const screen = balancesScreen(page);
  await expect(screen.getByRole("heading", { name: "Balances" })).toBeVisible({
    timeout: 30_000,
  });
  return screen;
}

// Waits for the screen and then for an expected number of settlement lines,
// returning the rows so a test can assert on their text.
async function waitForSettlementLines(page: Page, count: number): Promise<Locator> {
  const screen = await waitForBalancesScreen(page);
  const rows = screen.getByRole("listitem");
  await expect(rows).toHaveCount(count);
  return rows;
}

// Waits for the screen and returns with the guarantee that no settlement lines
// are rendered — the loading state is gone by then, so "0 items" is a real
// result rather than a page that has not rendered yet.
async function expectNoSettlementLines(page: Page): Promise<void> {
  const screen = await waitForBalancesScreen(page);
  await expect(screen.getByRole("listitem")).toHaveCount(0);
  await expect(balancesScreen(page).locator("ul")).toHaveCount(0);
}

test.describe("feature 021 — view trip balances", () => {
  // These 10 scenarios share ONE `next dev` server, which compiles every
  // dynamic route on its first request. Run several workers wide, they saturate
  // that compiler and race each other's compiles, so a scenario can spend its
  // whole test budget waiting for the server instead of on anything the feature
  // does. Run them one at a time, with a budget sized for a dev-mode compile.
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("a SGD 30.00 expense split evenly among 3 shows 2 lines owing the creator 10.00 each", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    const blair = await joinViaApi(request, link.shareToken, "Blair");

    // The creator pays the whole 30.00; each of the three members owes 10.00.
    await createExpenseViaApi(request, link, {
      amount: 30,
      payerParticipantId: null,
      shares: [
        { participantId: null, amount: 10 },
        { participantId: alex.participantId, amount: 10 },
        { participantId: blair.participantId, amount: 10 },
      ],
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 2);
    await expect(rows.filter({ hasText: "Alex" })).toContainText(
      "Alex owes Trip creator SGD 10.00"
    );
    await expect(rows.filter({ hasText: "Blair" })).toContainText(
      "Blair owes Trip creator SGD 10.00"
    );

    // Read-only view: no settlement line carries an action control.
    for (let i = 0; i < 2; i += 1) {
      const row = rows.nth(i);
      await expect(row.getByRole("button")).toHaveCount(0);
      await expect(row.getByRole("link")).toHaveCount(0);
    }
  });

  test("a USD expense on an SGD trip is shown converted once a rate exists", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    await setExchangeRateViaApi(request, link, "USD", 1.5);

    // USD 20.00 paid by the creator, split evenly: each side owes/holds
    // USD 10.00, i.e. SGD 15.00 once converted at the rate on file.
    await createExpenseViaApi(request, link, {
      amount: 20,
      currency: "USD",
      payerParticipantId: null,
      shares: [
        { participantId: null, amount: 10 },
        { participantId: alex.participantId, amount: 10 },
      ],
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    // The amount and the currency code together prove the conversion happened,
    // rather than a raw "USD 10.00" figure being echoed back.
    const rows = await waitForSettlementLines(page, 1);
    await expect(rows.first()).toContainText("Alex owes Trip creator SGD 15.00");
  });

  test("A owes B and B owes C the same amount simplifies to one line, A owes C", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    const blair = await joinViaApi(request, link.shareToken, "Blair");

    // Expense 1: the creator alone owes Blair 10.00.
    await createExpenseViaApi(request, link, {
      amount: 10,
      payerParticipantId: blair.participantId,
      shares: [{ participantId: null, amount: 10 }],
    });

    // Expense 2: Blair alone owes Alex 10.00 — which cancels Blair's credit.
    await createExpenseViaApi(request, link, {
      amount: 10,
      payerParticipantId: alex.participantId,
      shares: [{ participantId: blair.participantId, amount: 10 }],
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);
    await expect(rows.first()).toContainText("Trip creator owes Alex SGD 10.00");

    // The chain must not be shown as two lines: the middle person (Blair), now
    // netted to zero, must not appear anywhere on the page.
    await expect(page.locator("body")).not.toContainText("Blair");
  });

  test("a trip with no expenses shows everyone settled up", async ({ page, request }) => {
    const link = await createRealTripLink(request);

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const screen = await waitForBalancesScreen(page);
    await expect(screen.getByRole("status")).toContainText("settled up");
    await expectNoSettlementLines(page);
  });

  test("two expenses that exactly cancel between a pair produce no line for that pair", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    // Alex owes the creator 20.00…
    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 20 }],
    });

    // …and the creator owes Alex 20.00: the pair nets to exactly zero.
    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: alex.participantId,
      shares: [{ participantId: null, amount: 20 }],
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const screen = await waitForBalancesScreen(page);
    await expect(screen.getByRole("status")).toContainText("settled up");
    await expectNoSettlementLines(page);
  });

  test("an expense in a currency with no rate on file shows balances as incomplete", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    // EUR is used but no EUR rate is ever put on file for this trip.
    await createExpenseViaApi(request, link, {
      amount: 10,
      currency: "EUR",
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 10 }],
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const screen = await waitForBalancesScreen(page);
    const status = screen.getByRole("status");
    await expect(status).toContainText("incomplete");
    await expect(status).toContainText("EUR");
    // All-or-nothing: no line is computed from a missing rate.
    await expectNoSettlementLines(page);
  });

  test("a removed participant's balance still appears under their retained name", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    const blair = await joinViaApi(request, link.shareToken, "Blair");

    // Alex alone owes Blair 20.00, then Alex is removed from the trip.
    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: blair.participantId,
      shares: [{ participantId: alex.participantId, amount: 20 }],
    });
    await removeViaApi(request, link, alex.participantId);

    // Blair's own device, viewing as a joined participant — the branch that
    // resolves the role from `joinedTrips` rather than the creator's pointer.
    await seedStorage(page, {
      joinedTrips: [buildJoinedTrip(link, blair, "Blair")],
    });
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);
    await expect(rows.first()).toContainText("Alex owes Blair SGD 20.00");
  });

  test("a friendly connectivity message is shown when the balances request fails", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);

    // Installed before navigation, so the screen's first (and StrictMode's
    // second) load attempt fails the way an unreachable server would.
    await page.route("**/api/trips/*/balances", (route) => route.abort());

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const screen = await waitForBalancesScreen(page);
    await expect(screen.getByRole("alert")).toContainText("Could not reach the server");
    // The error branch renders no list at all.
    await expectNoSettlementLines(page);
  });

  test("a SGD 10.00 expense split 3 ways rounds to 2dp and the group total reconciles", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    const blair = await joinViaApi(request, link.shareToken, "Blair");

    // 3.33 + 3.33 + 3.34 = 10.00 exactly; the creator's net credit is 6.67,
    // split across the two debtors.
    await createExpenseViaApi(request, link, {
      amount: 10,
      payerParticipantId: null,
      shares: [
        { participantId: null, amount: 3.33 },
        { participantId: alex.participantId, amount: 3.33 },
        { participantId: blair.participantId, amount: 3.34 },
      ],
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 2);

    const amounts: number[] = [];
    for (const text of await rows.allTextContents()) {
      // Every rendered amount sits at the end of its line, rounded to 2dp.
      expect(text).toMatch(/\d+\.\d{2}$/);
      const match = /(\d+\.\d{2})$/.exec(text);
      amounts.push(match === null ? Number.NaN : Number(match[1]));
    }

    // The debtors' lines sum to the creator's net credit exactly — no cent lost
    // to rounding.
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(6.67);
  });

  test("a stray device is redirected home from the balances view", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);

    // Nothing seeded: this device is neither the trip's creator nor one of its
    // joined participants.
    await page.goto(`/trips/${link.shareToken}/balances`);

    await expect(page).toHaveURL("/", { timeout: 30_000 });
  });
});
