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

// Feature 022 additions. The confirm step is components/ConfirmSettleBalance.tsx's
// modal (`role="dialog"`), which carries the amount input, the inline
// validation alert, and only its own "Settle"/"Cancel" pair — so every
// assertion about it is scoped to the dialog rather than the row's Settle
// button.
function settleDialog(page: Page): Locator {
  return page.getByRole("dialog");
}

async function openSettleDialog(page: Page, row: Locator): Promise<void> {
  await row.getByRole("button", { name: "Settle" }).click();
  await expect(settleDialog(page)).toBeVisible();
}

// Confirms the dialog. Omitting `amount` submits the dialog's own pre-filled
// value (the full outstanding balance), which is the "settle in full" path.
async function confirmSettle(page: Page, amount?: string): Promise<void> {
  if (amount !== undefined) {
    await settleDialog(page).getByLabel("Amount to settle").fill(amount);
  }
  await settleDialog(page).getByRole("button", { name: "Settle" }).click();
}

async function cancelSettle(page: Page): Promise<void> {
  await settleDialog(page).getByRole("button", { name: "Cancel" }).click();
}

// A confirmed settle is a real network write, and dev-mode Next.js compiles
// the route handler on its first request — slower than the default 5s
// assertion timeout, which would make the balance assertions race the write
// rather than the feature. The dialog closes exactly when the response has
// been applied (the component clears `confirmTarget` on success and on failure
// alike), so waiting for it to close is waiting for the write to land. Same
// rationale as `waitForBalancesScreen`'s 30s budget for a cold route.
async function awaitSettleComplete(page: Page): Promise<void> {
  await expect(settleDialog(page)).toBeHidden({ timeout: 30_000 });
}

test.describe("feature 022 — settle up a balance", () => {
  // These 10 scenarios share ONE `next dev` server, which compiles every
  // dynamic route on its first request. Run several workers wide, they saturate
  // that compiler and race each other's compiles, so a scenario can spend its
  // whole test budget waiting for the server instead of on anything the feature
  // does. Run them one at a time, with a budget sized for a dev-mode compile.
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("E2E-022-01 — settling the full 20.00 owed clears the line", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    // Alex alone owes the creator 20.00.
    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 20 }],
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);
    await expect(rows.first()).toContainText("Alex owes Trip creator SGD 20.00");

    // No amount argument: the dialog's pre-filled default (20.00) is submitted.
    await openSettleDialog(page, rows.first());
    await confirmSettle(page);
    await awaitSettleComplete(page);

    await expectNoSettlementLines(page);
    await expect(balancesScreen(page).getByRole("status")).toContainText(
      "settled up"
    );
  });

  test("E2E-022-02 — the debtor's own device can settle a line they owe", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    // Alex alone owes the creator 20.00 — Alex is the debtor.
    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 20 }],
    });

    // Alex's own device: the role resolves from `joinedTrips` and the request
    // is authorized with Alex's participantToken, not the creator's.
    await seedStorage(page, {
      joinedTrips: [buildJoinedTrip(link, alex, "Alex")],
    });
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);
    await expect(rows.first()).toContainText("Alex owes Trip creator SGD 20.00");

    await openSettleDialog(page, rows.first());
    await confirmSettle(page);
    await awaitSettleComplete(page);

    await expectNoSettlementLines(page);

    // Re-fetching from the server keeps the line cleared: the settlement was
    // persisted, not just applied to the in-memory response.
    await page.reload();
    await expectNoSettlementLines(page);
  });

  test("E2E-022-03 — the creditor's own device can settle a line owed to them", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    // Same 20.00 expense: the creator is the creditor on this line.
    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 20 }],
    });

    // The creator's device — a different session from E2E-022-02, settling the
    // same line from the other side.
    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);
    await expect(rows.first()).toContainText("Alex owes Trip creator SGD 20.00");

    await openSettleDialog(page, rows.first());
    await confirmSettle(page);
    await awaitSettleComplete(page);

    await expectNoSettlementLines(page);
  });

  test("E2E-022-04 — settling 5.00 of a 20.00 debt leaves a 15.00 line", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 20 }],
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);
    await openSettleDialog(page, rows.first());
    await confirmSettle(page, "5");
    await awaitSettleComplete(page);

    // Re-located after the dialog closes: the same line, now for the remainder
    // only.
    const remaining = await waitForSettlementLines(page, 1);
    await expect(remaining.first()).toContainText("Alex owes Trip creator SGD 15.00");

    // The partial settlement survives a fresh fetch from the server.
    await page.reload();
    const reloaded = await waitForSettlementLines(page, 1);
    await expect(reloaded.first()).toContainText(
      "Alex owes Trip creator SGD 15.00"
    );
  });

  test("E2E-022-05 — 0, -5, and abc are each refused with an inline error and no change", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 20 }],
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);

    for (const value of ["0", "-5", "abc"]) {
      await openSettleDialog(page, rows.first());
      await confirmSettle(page, value);

      // Refused client-side: the inline error shows and the dialog stays open.
      await expect(settleDialog(page).getByRole("alert")).toBeVisible();
      await cancelSettle(page);
    }

    // Nothing was settled by any of the three attempts.
    const unchanged = await waitForSettlementLines(page, 1);
    await expect(unchanged.first()).toContainText("20.00");
  });

  test("E2E-022-06 — entering 25.00 against a 20.00 balance is refused with an inline error", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 20 }],
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);
    await openSettleDialog(page, rows.first());
    await confirmSettle(page, "25");

    await expect(settleDialog(page).getByRole("alert")).toContainText(
      "more than the outstanding balance"
    );

    await cancelSettle(page);

    const unchanged = await waitForSettlementLines(page, 1);
    await expect(unchanged.first()).toContainText("20.00");
  });

  test("E2E-022-07 — a new expense after a 5.00 partial settlement nets against the remaining 15.00", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    // Alex owes the creator 20.00.
    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 20 }],
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);
    await openSettleDialog(page, rows.first());
    await confirmSettle(page, "5");
    await awaitSettleComplete(page);

    const partlySettled = await waitForSettlementLines(page, 1);
    await expect(partlySettled.first()).toContainText(
      "Alex owes Trip creator SGD 15.00"
    );

    // A second expense in the same direction: Alex owes the creator 10.00 more.
    await createExpenseViaApi(request, link, {
      amount: 10,
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 10 }],
    });

    // The settlement is an adjustment on the ledger, not a replacement for it:
    // the remaining 15.00 and the new 10.00 add up to one 25.00 line.
    await page.reload();
    const combined = await waitForSettlementLines(page, 1);
    await expect(combined.first()).toContainText(
      "Alex owes Trip creator SGD 25.00"
    );
  });

  test("E2E-022-08 — a removed participant's balance can be settled and then disappears", async ({
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

    // Blair's own device, viewing as a joined participant.
    await seedStorage(page, {
      joinedTrips: [buildJoinedTrip(link, blair, "Blair")],
    });
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);
    await expect(rows.first()).toContainText("Alex");
    await expect(rows.first()).toContainText("Blair");

    // The departed participant's retained name is still a settleable line.
    await openSettleDialog(page, rows.first());
    await confirmSettle(page);
    await awaitSettleComplete(page);

    await expectNoSettlementLines(page);
  });

  test("E2E-022-09 — clicking Settle without confirming leaves the balance unchanged", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 20 }],
    });

    // A spy on the write endpoint: cancelling must not merely leave the UI
    // unchanged, it must send nothing at all.
    let settleRequests = 0;
    await page.route("**/api/trips/*/settlements", async (route) => {
      settleRequests += 1;
      await route.continue();
    });

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);
    await openSettleDialog(page, rows.first());
    await cancelSettle(page);

    await expect(settleDialog(page)).toBeHidden();

    const unchanged = await waitForSettlementLines(page, 1);
    await expect(unchanged.first()).toContainText("20.00");
    expect(settleRequests).toBe(0);
  });

  test("E2E-022-10 — a friendly connectivity message is shown when the settle request fails, and the balance stays unchanged", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");

    await createExpenseViaApi(request, link, {
      amount: 20,
      payerParticipantId: null,
      shares: [{ participantId: alex.participantId, amount: 20 }],
    });

    // Installed before navigation, so the write fails the way an unreachable
    // server would. The balances GET is a different path and still succeeds.
    await page.route("**/api/trips/*/settlements", (route) => route.abort());

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/balances`);

    const rows = await waitForSettlementLines(page, 1);
    await openSettleDialog(page, rows.first());
    await confirmSettle(page);
    await awaitSettleComplete(page);

    // The failure surfaces on the screen (the dialog closes on error), and the
    // line the user tried to settle is untouched.
    await expect(balancesScreen(page).getByRole("alert")).toContainText(
      "Could not reach the server"
    );

    const unchanged = await waitForSettlementLines(page, 1);
    await expect(unchanged.first()).toContainText("20.00");
  });
});
