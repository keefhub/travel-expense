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

// lib/sharedExpenses.ts's sentinel for the trip creator, who has no Participant
// row and whose id is serialized as `null` by the API.
const TRIP_CREATOR_ID = "__creator__";

// Fixed trip body for every real trip created by this spec, so the JoinedTrip
// fixtures below can be built from known values.
const TRIP = {
  destinationCountry: "Japan",
  currency: "JPY",
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
// + real join response.
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

// What components/SharedExpenseForm.tsx's creator branch needs: BOTH the
// pointer to the shared trip AND the device's own local trip (it reads
// getSharedTripLink() and getTrip() together, and redirects home if the local
// trip is missing).
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

// components/SharedExpenseDetail.tsx resolves a creator from the shared-trip
// pointer alone — no local trip required.
function creatorLinkOnly(link: SharedTripLinkSeed) {
  return {
    sharedTripLink: {
      tripId: link.tripId,
      shareToken: link.shareToken,
      creatorToken: link.creatorToken,
    },
  };
}

// Create a real expense through the API, bypassing the UI, so a test can start
// from a state the record form cannot produce on its own — e.g. a payer who has
// since been removed from the trip.
async function createExpenseViaApi(
  request: APIRequestContext,
  link: SharedTripLinkSeed,
  input: ExpenseFixtureInput
): Promise<{ id: string }> {
  const response = await request.post(`/api/trips/${link.tripId}/expenses`, {
    headers: { "x-creator-token": link.creatorToken },
    data: {
      amount: input.amount,
      currency: TRIP.currency,
      category: "Food",
      date: "2026-01-05",
      paymentMethod: "Cash",
      location: "Tokyo",
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

// components/SharedExpenseForm.tsx's own rendered container (`flex flex-col
// gap-4 p-4`, or its load-error twin). Located via the "Record an expense"
// heading it renders in both branches. Scoping alerts and field assertions to
// this container keeps them away from Next.js's own route announcer, which is a
// page-level role="alert" on every route.
function expenseForm(page: Page): Locator {
  return page.getByRole("heading", { name: "Record an expense" }).locator("..");
}

// A URL pattern for a SAVED expense's detail page. "new" has to be excluded
// explicitly: it is itself a valid `[^/]+`, so the record form's own URL would
// otherwise satisfy the pattern and the assertion would pass without any save
// having happened.
function expenseDetailUrl(link: SharedTripLinkSeed): RegExp {
  return new RegExp(`/trips/${link.shareToken}/expenses/(?!new$)[^/]+$`);
}

// components/SharedExpenseDetail.tsx's rendered container. Unlike the form, the
// heading sits in an inner wrapper (`flex flex-col gap-1`) holding just the
// heading and the amount, so the container that holds the field list, the split
// list and the "Edit split" button is TWO levels up.
function expenseDetail(page: Page): Locator {
  return page
    .getByRole("heading", { name: "Expense details" })
    .locator("..")
    .locator("..");
}

// The detail page's split list — the <ul> sibling of the exact-text "Split"
// label (not "Split method"/"Split among", which only exist in edit mode).
function splitList(page: Page): Locator {
  return expenseDetail(page)
    .getByText("Split", { exact: true })
    .locator("..")
    .locator("ul");
}

// One member's row under "Split among" in AttributionFields: checkbox -> label
// -> row.
function splitAmongRow(form: Locator, name: string): Locator {
  return form
    .getByRole("checkbox", { name, exact: true })
    .locator("..")
    .locator("..");
}

// The expense routes these components load from: the roster read, the expense
// write, and the single-expense read.
function isExpenseApiRequest(url: string): boolean {
  return (
    /\/api\/trips\/[^/]+\/participants$/.test(url) ||
    /\/api\/trips\/[^/]+\/expenses$/.test(url) ||
    /\/api\/trips\/[^/]+\/expenses\/[^/]+$/.test(url)
  );
}

// Counts the expense-API requests currently in flight on each page.
const inFlightApiRequests = new WeakMap<Page, { count: number }>();

// Registered in a beforeEach, i.e. before any test navigates, so every request
// the page makes from its first render onwards is counted.
test.beforeEach(async ({ page }) => {
  const tracker = { count: 0 };
  inFlightApiRequests.set(page, tracker);
  page.on("request", (request) => {
    if (isExpenseApiRequest(request.url())) tracker.count += 1;
  });
  page.on("requestfinished", (request) => {
    if (isExpenseApiRequest(request.url())) tracker.count -= 1;
  });
  page.on("requestfailed", (request) => {
    if (isExpenseApiRequest(request.url())) tracker.count -= 1;
  });
});

// The dev server renders every client component inside React StrictMode, whose
// effects are invoked twice per mount. Both load-from-the-API components here
// (SharedExpenseForm and SharedExpenseDetail) therefore issue TWO load passes
// on mount, and the second one resolves later than the first and re-seeds the
// component's state from the server. A test that starts interacting as soon as
// the first pass renders can have its edits silently reverted a moment later —
// an auto-defaulted payer comes back, an unchecked member is checked again.
//
// Waiting for the page's own API reads to be idle before driving the UI removes
// that race. It changes nothing about what is asserted: it only stops the test
// from racing the app's own load.
async function waitForApiIdle(page: Page): Promise<void> {
  const tracker = inFlightApiRequests.get(page);
  if (tracker === undefined) return;
  await expect.poll(() => tracker.count, { timeout: 30_000 }).toBe(0);
}

// This app is entirely client-rendered and dev-mode Next.js compiles each
// dynamic route on first request, so a cold server can take longer than the
// default 5s assertion timeout to reach a screen. Settle that one wait
// explicitly and generously so every later assertion keeps the default
// timeout; this only extends how long we wait for the screen, it does not
// relax what any assertion requires.
async function waitForExpenseForm(page: Page): Promise<Locator> {
  const form = expenseForm(page);
  await expect(form.locator("#amount")).toBeVisible({ timeout: 15_000 });
  await waitForApiIdle(page);
  return form;
}

// The form's own route is warmed up by every test that starts there, but the
// detail route is only reached after a save, and in dev it is compiled on that
// first navigation — under Playwright's parallel workers that cold compile can
// outlast a generous-looking wait, which is why this one is longer than the
// form's.
async function waitForExpenseDetail(page: Page): Promise<Locator> {
  const detail = expenseDetail(page);
  await expect(detail.getByRole("heading", { name: "Expense details" })).toBeVisible({
    timeout: 30_000,
  });
  await waitForApiIdle(page);
  return detail;
}

// Every remaining mandatory field of the record form, with the currency left at
// the trip currency the component hydrates on mount.
async function fillBaseExpenseFields(form: Locator, amount: string): Promise<void> {
  await form.locator("#amount").fill(amount);
  // Index 1 is the first real category; index 0 is the "Select a category" placeholder.
  await form.locator("#category").selectOption({ index: 1 });
  await form.locator("#paymentMethod").selectOption("Cash");
  await form.locator("#location").fill("Tokyo");
}

// The Payer field row of the detail page's field list.
function payerRow(detail: Locator): Locator {
  return detail.getByRole("listitem").filter({ hasText: "Payer" });
}

test.describe("feature 020 — attribute an expense to payer and split", () => {
  // These 17 scenarios share ONE `next dev` server, which compiles every
  // dynamic route on its first request. Run several workers wide, they
  // saturate that compiler and race each other's compiles, so a scenario can
  // spend its whole test budget waiting for the server instead of on anything
  // the feature does. Run them one at a time, with a budget sized for a
  // dev-mode compile, so no scenario depends on the machine being idle.
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("an even split among 3 members saves SGD 10.00 each", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await joinViaApi(request, link.shareToken, "Alex");
    await joinViaApi(request, link.shareToken, "Blair");

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/expenses/new`);

    const form = await waitForExpenseForm(page);
    await fillBaseExpenseFields(form, "30.00");

    // Defaults: the creator pays, and every member is in the split.
    await expect(form.locator("#payer")).toHaveValue(TRIP_CREATOR_ID);
    await expect(form.getByRole("radio", { name: "Even" })).toBeChecked();
    for (const name of ["Trip creator", "Alex", "Blair"]) {
      await expect(form.getByRole("checkbox", { name, exact: true })).toBeChecked();
    }

    await form.getByRole("button", { name: "Save expense" }).click();

    await expect(page).toHaveURL(expenseDetailUrl(link), { timeout: 15_000 });
    await waitForExpenseDetail(page);

    const rows = splitList(page).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      await expect(rows.nth(i)).toContainText("10.00");
    }
  });

  test("the form pre-selects me as payer and everyone in the split", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    await joinViaApi(request, link.shareToken, "Blair");

    await seedStorage(page, { joinedTrips: [buildJoinedTrip(link, alex, "Alex")] });
    await page.goto(`/trips/${link.shareToken}/expenses/new`);

    const form = await waitForExpenseForm(page);
    await expect(form.locator("#payer")).toHaveValue(alex.participantId);
    for (const name of ["Trip creator", "Alex", "Blair"]) {
      await expect(form.getByRole("checkbox", { name, exact: true })).toBeChecked();
    }
  });

  test("an exact split saves each entered share", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await joinViaApi(request, link.shareToken, "Alex");

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/expenses/new`);

    const form = await waitForExpenseForm(page);
    await fillBaseExpenseFields(form, "30.00");
    await form.getByRole("radio", { name: "Exact amount" }).check();
    await form.getByLabel("Trip creator share").fill("20.00");
    await form.getByLabel("Alex share").fill("10.00");
    await form.getByRole("button", { name: "Save expense" }).click();

    await expect(page).toHaveURL(expenseDetailUrl(link), { timeout: 15_000 });
    await waitForExpenseDetail(page);

    const rows = splitList(page).getByRole("listitem");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: "Trip creator" })).toContainText("20.00");
    await expect(rows.filter({ hasText: "Alex" })).toContainText("10.00");
  });

  test("SGD 10.00 split 3 ways rounds to 2dp and sums exactly", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await joinViaApi(request, link.shareToken, "Alex");
    await joinViaApi(request, link.shareToken, "Blair");

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/expenses/new`);

    const form = await waitForExpenseForm(page);
    await fillBaseExpenseFields(form, "10.00");
    await form.getByRole("button", { name: "Save expense" }).click();

    await expect(page).toHaveURL(expenseDetailUrl(link), { timeout: 15_000 });
    await waitForExpenseDetail(page);

    const rows = splitList(page).getByRole("listitem");
    await expect(rows).toHaveCount(3);

    const amounts = await rows.locator("span:last-child").allTextContents();
    for (const amount of amounts) {
      expect(amount).toMatch(/^\d+\.\d{2}$/);
    }
    const sum = amounts.map(Number).reduce((total, amount) => total + amount, 0);
    expect(sum).toBe(10);
  });

  test("exact amounts under the total are refused", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    await joinViaApi(request, link.shareToken, "Alex");

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/expenses/new`);

    const form = await waitForExpenseForm(page);
    await fillBaseExpenseFields(form, "30.00");
    await form.getByRole("radio", { name: "Exact amount" }).check();
    await form.getByLabel("Trip creator share").fill("15.00");
    await form.getByLabel("Alex share").fill("10.00");
    await form.getByRole("button", { name: "Save expense" }).click();

    await expect(form.getByRole("alert")).toContainText("add up to the total");
    await expect(page).toHaveURL(
      new RegExp(`/trips/${link.shareToken}/expenses/new$`)
    );
  });

  test("deselecting everyone including the payer is refused", async ({ page, request }) => {
    const link = await createRealTripLink(request);

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/expenses/new`);

    const form = await waitForExpenseForm(page);
    await fillBaseExpenseFields(form, "30.00");
    await form.getByRole("checkbox", { name: "Trip creator", exact: true }).uncheck();
    await form.getByRole("button", { name: "Save expense" }).click();

    await expect(form.getByRole("alert")).toContainText("at least one participant");
    await expect(page).toHaveURL(
      new RegExp(`/trips/${link.shareToken}/expenses/new$`)
    );
  });

  test("switching exact to even recalculates the shares", async ({ page, request }) => {
    const link = await createRealTripLink(request);

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/expenses/new`);

    const form = await waitForExpenseForm(page);
    await fillBaseExpenseFields(form, "30.00");
    await form.getByRole("radio", { name: "Exact amount" }).check();
    await form.getByLabel("Trip creator share").fill("12.00");
    await expect(form.getByLabel("Trip creator share")).toHaveValue("12.00");

    await form.getByRole("radio", { name: "Even" }).check();

    // The stale exact entry is gone: the row shows the recomputed even amount,
    // and there is no share input left to hold "12.00".
    await expect(form.getByLabel("Trip creator share")).toHaveCount(0);
    await expect(splitAmongRow(form, "Trip creator").getByText("30.00")).toBeVisible();
  });

  test("switching even to exact clears the computed shares", async ({ page, request }) => {
    const link = await createRealTripLink(request);

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/expenses/new`);

    const form = await waitForExpenseForm(page);
    await fillBaseExpenseFields(form, "30.00");
    await expect(form.getByRole("radio", { name: "Even" })).toBeChecked();
    await expect(form.getByLabel("Trip creator share")).toHaveCount(0);

    await form.getByRole("radio", { name: "Exact amount" }).check();

    const shareInput = form.getByLabel("Trip creator share");
    await expect(shareInput).toBeVisible();
    await expect(shareInput).toHaveValue("");
  });

  test("a departed payer's name still shows on their past expense", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    const expense = await createExpenseViaApi(request, link, {
      amount: 30,
      payerParticipantId: alex.participantId,
      shares: [
        { participantId: alex.participantId, amount: 15 },
        { participantId: null, amount: 15 },
      ],
    });
    await removeViaApi(request, link, alex.participantId);

    await seedStorage(page, creatorLinkOnly(link));
    await page.goto(`/trips/${link.shareToken}/expenses/${expense.id}`);

    const detail = await waitForExpenseDetail(page);
    await expect(payerRow(detail)).toContainText("Alex");
    // The share snapshot survives the removal too.
    await expect(splitList(page)).toContainText("Alex");
  });

  test("editing payer and split saves the update", async ({ page, request }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    const blair = await joinViaApi(request, link.shareToken, "Blair");
    const expense = await createExpenseViaApi(request, link, {
      amount: 30,
      payerParticipantId: alex.participantId,
      shares: [
        { participantId: alex.participantId, amount: 15 },
        { participantId: blair.participantId, amount: 15 },
      ],
    });

    await seedStorage(page, creatorLinkOnly(link));
    await page.goto(`/trips/${link.shareToken}/expenses/${expense.id}`);

    const detail = await waitForExpenseDetail(page);
    await expect(payerRow(detail)).toContainText("Alex");
    await detail.getByRole("button", { name: "Edit split" }).click();

    await detail.locator("#payer").selectOption(blair.participantId);
    await detail.getByRole("checkbox", { name: "Alex", exact: true }).uncheck();
    // Only Blair is left selected, so the one remaining exact share has to carry
    // the whole amount for the cent-sum check to accept the split.
    await detail.getByLabel("Blair share").fill("30.00");
    await detail.getByRole("button", { name: "Save split" }).click();

    // Leaving edit mode is this component's own success signal. Waiting for it
    // matters: the click resolves as soon as it is dispatched, so reloading
    // straight after would abort the still-in-flight PATCH.
    await expect(detail.getByRole("button", { name: "Edit split" })).toBeVisible();
    await expect(detail.getByRole("alert")).toHaveCount(0);

    await page.reload();
    const reloaded = await waitForExpenseDetail(page);
    await expect(payerRow(reloaded)).toContainText("Blair");

    const rows = splitList(page).getByRole("listitem");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Blair");
    await expect(rows.first()).toContainText("30.00");
  });

  test("a solo trip's expense form has no payer or split fields", async ({ page }) => {
    // A solo trip with no share link at all: the local 005 form, not the shared one.
    await seedStorage(page, { trip: { ...TRIP } });
    await page.goto("/expenses/new");

    await expect(page.getByRole("button", { name: "Save expense" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel("Payer")).toHaveCount(0);
    await expect(page.getByText("Split among")).toHaveCount(0);
  });

  test("saving fails with a friendly error when the server is unreachable", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);

    await seedStorage(page, creatorSession(link));

    // Installed BEFORE navigating so the GET that loads the roster still
    // succeeds; only the POST that saves the expense is aborted.
    await page.route("**/api/trips/*/expenses", async (route) => {
      if (route.request().method() === "POST") {
        await route.abort();
      } else {
        await route.continue();
      }
    });

    await page.goto(`/trips/${link.shareToken}/expenses/new`);

    const form = await waitForExpenseForm(page);
    await fillBaseExpenseFields(form, "50.00");
    await form.getByRole("button", { name: "Save expense" }).click();

    await expect(form.getByRole("alert")).toContainText("Could not reach the server");
    await expect(page).toHaveURL(
      new RegExp(`/trips/${link.shareToken}/expenses/new$`)
    );
  });

  test("loading the form fails with a friendly error when the server is unreachable", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);

    await seedStorage(page, creatorSession(link));
    await page.route("**/api/trips/*/participants", (route) => route.abort());

    await page.goto(`/trips/${link.shareToken}/expenses/new`);

    // The heading's container renders a friendly error instead of a broken or
    // empty form. The exact copy is deliberately not asserted here.
    const form = expenseForm(page);
    await expect(form.getByRole("alert")).toBeVisible({ timeout: 15_000 });
    await expect(form.locator("#amount")).toHaveCount(0);
  });

  test("a creator-only trip defaults to and saves a full self-split", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);

    await seedStorage(page, creatorSession(link));
    await page.goto(`/trips/${link.shareToken}/expenses/new`);

    const form = await waitForExpenseForm(page);
    await expect(form.locator("#payer")).toHaveValue(TRIP_CREATOR_ID);

    const creatorCheckbox = form.getByRole("checkbox", {
      name: "Trip creator",
      exact: true,
    });
    await expect(form.getByRole("checkbox")).toHaveCount(1);
    await expect(creatorCheckbox).toBeChecked();

    await fillBaseExpenseFields(form, "50.00");
    await form.getByRole("button", { name: "Save expense" }).click();

    await expect(page).toHaveURL(expenseDetailUrl(link), { timeout: 15_000 });
    await waitForExpenseDetail(page);

    const rows = splitList(page).getByRole("listitem");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Trip creator");
    await expect(rows.first()).toContainText("50.00");
  });

  test("a departed member is not offered as a selectable option while editing", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    const expense = await createExpenseViaApi(request, link, {
      amount: 30,
      payerParticipantId: alex.participantId,
      shares: [
        { participantId: alex.participantId, amount: 30 },
        { participantId: null, amount: 0 },
      ],
    });
    await removeViaApi(request, link, alex.participantId);

    await seedStorage(page, creatorLinkOnly(link));
    await page.goto(`/trips/${link.shareToken}/expenses/${expense.id}`);

    const detail = await waitForExpenseDetail(page);
    await expect(splitList(page)).toContainText("Alex");

    await detail.getByRole("button", { name: "Edit split" }).click();

    // The departed member keeps their name in the split list above, but is never
    // an option in the payer select — not even the auto-defaulted one.
    await expect(detail.getByRole("option", { name: "Alex" })).toHaveCount(0);
    await expect(detail.locator("#payer")).toHaveValue(TRIP_CREATOR_ID);
  });

  test("a stray device is redirected home from both expense screens", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    const expense = await createExpenseViaApi(request, link, {
      amount: 30,
      payerParticipantId: alex.participantId,
      shares: [{ participantId: alex.participantId, amount: 30 }],
    });
    // Nothing seeded: this device is neither the creator nor a participant.

    await page.goto(`/trips/${link.shareToken}/expenses/new`);
    await expect(page).toHaveURL("/");

    await page.goto(`/trips/${link.shareToken}/expenses/${expense.id}`);
    await expect(page).toHaveURL("/");
  });

  test("saving a departed payer's expense split is blocked until a new payer is chosen", async ({
    page,
    request,
  }) => {
    const link = await createRealTripLink(request);
    const alex = await joinViaApi(request, link.shareToken, "Alex");
    const blair = await joinViaApi(request, link.shareToken, "Blair");
    const expense = await createExpenseViaApi(request, link, {
      amount: 30,
      payerParticipantId: alex.participantId,
      shares: [
        { participantId: alex.participantId, amount: 15 },
        { participantId: blair.participantId, amount: 15 },
      ],
    });
    await removeViaApi(request, link, alex.participantId);

    // Counts the PATCHes actually issued, so "the update was never sent" is
    // proven mechanically as well as by the reload below.
    let patchCount = 0;
    await page.route("**/api/trips/*/expenses/*", async (route) => {
      if (route.request().method() === "PATCH") {
        patchCount += 1;
      }
      await route.continue();
    });

    await seedStorage(page, creatorLinkOnly(link));
    await page.goto(`/trips/${link.shareToken}/expenses/${expense.id}`);

    const detail = await waitForExpenseDetail(page);
    await expect(payerRow(detail)).toContainText("Alex");
    await detail.getByRole("button", { name: "Edit split" }).click();

    // Change only the split, leaving "Trip creator" (the auto-defaulted payer
    // value) untouched; Blair stays selected, so the split itself is non-empty.
    await splitAmongRow(detail, "Trip creator")
      .getByRole("checkbox", { name: "Trip creator", exact: true })
      .check();
    await expect(detail.getByRole("checkbox", { name: "Blair", exact: true })).toBeChecked();

    await detail.getByRole("button", { name: "Save split" }).click();

    await expect(detail.getByRole("alert")).toContainText("Choose who paid");
    await expect(detail.getByRole("button", { name: "Save split" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/expenses/${expense.id}$`));
    expect(patchCount).toBe(0);

    // The stored expense is untouched.
    await page.reload();
    const reloaded = await waitForExpenseDetail(page);
    await expect(payerRow(reloaded)).toContainText("Alex");

    // An explicit payer choice clears the requirement and lets the save through.
    await reloaded.getByRole("button", { name: "Edit split" }).click();
    await reloaded.locator("#payer").selectOption(blair.participantId);
    // One selected member, even split: the whole amount lands on Blair.
    await reloaded.getByRole("radio", { name: "Even" }).check();
    await reloaded.getByRole("button", { name: "Save split" }).click();

    await expect(reloaded.getByRole("button", { name: "Edit split" })).toBeVisible();
    await expect(reloaded.getByRole("alert")).toHaveCount(0);
    expect(patchCount).toBe(1);

    await page.reload();
    const final = await waitForExpenseDetail(page);
    await expect(payerRow(final)).toContainText("Blair");
    await expect(payerRow(final)).not.toContainText("Alex");
  });
});
