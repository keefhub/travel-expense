# Multi-Currency Expense Tracking — Implementation Plan

**Status:** Complete
**Source:** `doc/spec/006.multi-currency-expense-tracking.md`
**Goal:** Let a traveller see spending totals grouped by original currency, enter a fixed exchange
rate for a non-trip currency, and see a converted total in the trip currency that visibly indicates
when it's incomplete because a rate is still missing.

**Architecture:**
A new pure domain module, `lib/currency.ts`, holds three calculation functions: `getExpenseTotalsByCurrency`
(groups and sums expenses by currency code), `validateExchangeRateInput`/`setExchangeRate` (validate
and store a single current rate per currency, replacing any prior value for that currency), and
`getConvertedTotals` (converts each currency's total into the trip currency using the stored rate,
treating the trip's own currency as an implicit rate of 1, and reporting which currencies still lack
a rate). No new storage key is needed — `travel-expense:exchange-rates` and its accessors
(`getExchangeRates`/`saveExchangeRates`) already exist from feature 012 and have had no producer or
consumer until now. Two existing placeholder screens get a minimal, working surface wired to this
module, each explicitly marked for replacement: a new `ExchangeRateForm` client component (mirroring
`ExpenseForm`'s shape) replaces the `app/settings/page.tsx` placeholder, and `app/page.tsx` gains a
"Spending by currency" section reading the same three functions. Recording an expense in the trip
currency or a different currency (feature 006's first two scenarios, BR-006-01/02/03,
AC-006-01/02/03) requires no code change — it is already fully supported by feature 005's
`submitExpense`/`ExpenseForm`, verified by reading `lib/expenses.ts` and `components/ExpenseForm.tsx`
(no exchange-rate field exists on that form, and no rate check gates the save). Since there is no
code to change, these three ACs have no dedicated task; they are instead manually exercised as part
of Task 6's Step 3 test matrix (recording an SGD and a JPY expense and observing both save with their
entered currency and amount), cited there by AC ID.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage — no backend, no database. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build`. No test runner is installed (verified: `package.json` has no
`test` script; `node_modules/.bin` contains only `eslint`, `next`, `tsc`).

**Negative constraints (from `doc/spec/006.multi-currency-expense-tracking.md` §1.6, §2.6, §7):**
- Will NOT build the full Exchange Rate Management page (viewing, editing, and deleting every stored
  rate in one place) — that is feature 007. The rate-entry form built here is intentionally minimal
  and is expected to be *replaced*, not extended, when 007 lands.
- Will NOT build the full Home Dashboard layout (budget vs. remaining, pie chart by category, last 5
  transactions) — that is feature 009. Only the "Spending by currency" section is added here.
- Will NOT add automatic or live exchange-rate lookups — rates are fixed and manually entered.
- Will NOT add rate history or time-varying rates — one current rate per currency, no timestamp.
- Will NOT add editing or deleting an already-recorded expense.
- Will NOT change `lib/expenses.ts`, `lib/storage.ts`, or `lib/types.ts` — all three already provide
  everything this feature needs, verified by reading each file (spec §2.4).

**Assumptions (from spec §1.5, §7 — carried forward, cheap to reverse if wrong):**
- Assumed: converted amounts use plain IEEE-754 float arithmetic with 2-decimal display formatting
  (`toFixed(2)`) — no special rounding of the underlying stored/summed values (spec §7, Open Question 3).
- Assumed: the rate-entry currency `<select>` excludes the trip's own currency as a UX nicety, but
  `validateExchangeRateInput` still independently rejects a same-currency rate — both are kept per
  spec §6, Challenge 4 (the `<select>` exclusion doesn't replace the validator as the enforcement point).
- Assumed: the currency-totals section on the home page (and its converted-total line) render only
  when at least one expense exists; nothing is shown for an empty trip.
- Assumed: `ExchangeRateForm` shows a `role="status"` "Exchange rate saved." confirmation after a
  successful save and keeps the selected currency (clearing only the rate input) — neither is stated
  by the spec, but both mirror `ExpenseForm`'s existing feedback pattern and are cheap to change since
  feature 007 is expected to replace this form entirely.
- Assumed: `/settings` redirects to `/` when no active trip exists, matching the existing
  redirect-if-no-trip guard already used by `/trip/edit` and `/expenses/new` — not stated by the spec,
  but consistent with every other trip-dependent route in this app.

---

### Task 1: [Domain] — getExpenseTotalsByCurrency groups and sums expenses by currency

**Files**
- create: `lib/currency.ts`
- create (temporary, deleted within this task): `lib/currency.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/currency.probe.ts` containing exactly:

      ```ts
      import { getExpenseTotalsByCurrency } from "@/lib/currency";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/currency.probe.ts(1,44): error TS2307: Cannot find module '@/lib/currency' or its corresponding type declarations.`
      (Verified empirically against this exact repo state before writing this plan.)

- [x] **Step 3 — Implement.** Create `lib/currency.ts`. Import only `Expense` in this task —
      `ExchangeRate` is not used until Task 2 adds `setExchangeRate`/`getConvertedTotals`, and
      importing it now would fail `npm run lint`'s unused-import rule at Step 6:

      ```ts
      import type { Expense } from "@/lib/types";

      export interface CurrencyTotal {
        currency: string;
        amount: number;
      }

      export function getExpenseTotalsByCurrency(expenses: Expense[]): CurrencyTotal[] {
        const totals = new Map<string, number>();
        for (const expense of expenses) {
          totals.set(expense.currency, (totals.get(expense.currency) ?? 0) + expense.amount);
        }
        return Array.from(totals.entries())
          .map(([currency, amount]) => ({ currency, amount }))
          .sort((a, b) => a.currency.localeCompare(b.currency));
      }
      ```

      Rule-to-code mapping (for review): one entry per distinct currency present in `expenses`, none
      for a currency with zero expenses → BR-006-04, BR-006-13; alphabetical sort by currency code →
      matches AC-006-04's stable ordering; summing via a `Map` keyed by currency code, not a
      per-category or per-expense breakdown → BR-006-05 (currency-code grouping, not anything else).

- [x] **Step 4 — Delete the probe.** Remove `lib/currency.probe.ts`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as before this task
      (this module is not yet imported by any route):
      ```
      Route (app)
      ┌ ○ /
      ├ ○ /_not-found
      ├ ○ /categories
      ├ ○ /expenses/new
      ├ ○ /settings
      ├ ○ /trip/edit
      └ ○ /trip/new
      ```

- [x] **Step 7 — Commit.**
      `git add lib/currency.ts && git commit`
      Message: `feat(006): add getExpenseTotalsByCurrency to a new currency domain module`

---

### Task 2: [Domain] — validateExchangeRateInput and setExchangeRate manage a single rate per currency

**Depends on Task 1** (`lib/currency.ts` must already exist).

**Files**
- modify: `lib/currency.ts`
- create (temporary, deleted within this task): `lib/currency.validate.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/currency.validate.probe.ts` containing
      exactly:

      ```ts
      import { validateExchangeRateInput } from "@/lib/currency";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/currency.validate.probe.ts(1,10): error TS2305: Module '"@/lib/currency"' has no exported member 'validateExchangeRateInput'.`
      (Verified empirically against this exact repo state before writing this plan — after simulating
      Task 1's output.)

- [x] **Step 3 — Implement.** First, change the top of `lib/currency.ts` from
      `import type { Expense } from "@/lib/types";` to add `ExchangeRate` (now used by this task):

      ```ts
      import type { Expense, ExchangeRate } from "@/lib/types";
      ```

      Then append to `lib/currency.ts`:

      ```ts
      export function validateExchangeRateInput(
        currency: string,
        rateInput: string,
        tripCurrency: string
      ): { error?: string } {
        if (currency === tripCurrency) {
          return { error: "Exchange rate is not needed for the trip's own currency." };
        }

        const trimmed = rateInput.trim();
        if (trimmed === "") {
          return { error: "Enter an exchange rate." };
        }

        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return { error: "Enter an exchange rate greater than 0." };
        }

        return {};
      }

      export function setExchangeRate(
        rates: ExchangeRate[],
        currency: string,
        rate: number
      ): ExchangeRate[] {
        const withoutCurrency = rates.filter((r) => r.currency !== currency);
        return [...withoutCurrency, { currency, rate }];
      }
      ```

      Rule-to-code mapping (for review): same-currency rejection → BR-006-11/AC-006-10; blank,
      non-numeric, zero, or negative rejection → BR-006-06 (a "fixed exchange rate" must be a real
      positive number)/AC-006-09; `setExchangeRate` filters out any existing entry for `currency`
      before appending the new one, so the result always has at most one entry per currency →
      BR-006-12/AC-006-11.

- [x] **Step 4 — Delete the probe.** Remove `lib/currency.validate.probe.ts`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as Task 1.

- [x] **Step 7 — Commit.**
      `git add lib/currency.ts && git commit`
      Message: `feat(006): add exchange-rate validation and single-rate-per-currency storage helper`

---

### Task 3: [Domain] — getConvertedTotals computes a converted total and flags missing rates

**Depends on Task 2** (`lib/currency.ts`'s `CurrencyTotal` type from Task 1, `ExchangeRate` import
already added in Task 2).

**Files**
- modify: `lib/currency.ts`
- create (temporary, deleted within this task): `lib/currency.converted.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/currency.converted.probe.ts` containing
      exactly:

      ```ts
      import { getConvertedTotals } from "@/lib/currency";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/currency.converted.probe.ts(1,10): error TS2305: Module '"@/lib/currency"' has no exported member 'getConvertedTotals'.`
      (Verified empirically against this exact repo state before writing this plan — after simulating
      Tasks 1–2's output.)

- [x] **Step 3 — Implement.** Append to `lib/currency.ts`:

      ```ts
      export interface ConvertedTotalsResult {
        convertedTotal: number;
        isComplete: boolean;
        missingCurrencies: string[];
      }

      export function getConvertedTotals(
        totals: CurrencyTotal[],
        tripCurrency: string,
        rates: ExchangeRate[]
      ): ConvertedTotalsResult {
        let convertedTotal = 0;
        const missingCurrencies: string[] = [];

        for (const total of totals) {
          if (total.currency === tripCurrency) {
            convertedTotal += total.amount;
            continue;
          }

          const rate = rates.find((r) => r.currency === total.currency);
          if (rate === undefined) {
            missingCurrencies.push(total.currency);
            continue;
          }

          convertedTotal += total.amount * rate.rate;
        }

        return { convertedTotal, isComplete: missingCurrencies.length === 0, missingCurrencies };
      }
      ```

      Rule-to-code mapping (for review): the trip's own currency is added to `convertedTotal` at face
      value, never checked against `rates` or added to `missingCurrencies` → BR-006-11; a currency
      with a stored rate contributes `amount * rate.rate` → BR-006-07/BR-006-08/AC-006-06; a currency
      with no stored rate is excluded from `convertedTotal` and named in `missingCurrencies`, rather
      than being silently treated as zero-value-but-summed or blocking the whole calculation →
      BR-006-09/BR-006-10/AC-006-07/AC-006-08 (this is the design choice the spec's Contrarian Review
      Challenge 2 examined and accepted: excluding-and-flagging is visible via `isComplete`/
      `missingCurrencies`, not a silent omission).

- [x] **Step 4 — Delete the probe.** Remove `lib/currency.converted.probe.ts`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as Task 1.

- [x] **Step 7 — Commit.**
      `git add lib/currency.ts && git commit`
      Message: `feat(006): add getConvertedTotals, completing the currency domain module`

---

### Task 4: [UI] — ExchangeRateForm lets the user enter a fixed rate for a non-trip currency

**Depends on Tasks 1–3** (every export of `lib/currency.ts`) and on `lib/countries.ts`'s
`getSupportedCurrencies` (feature 004, already committed) and `lib/storage.ts`'s
`getExchangeRates`/`saveExchangeRates` (feature 012, already committed).

**Files**
- create: `components/ExchangeRateForm.tsx`
- create (temporary, deleted within this task): `components/ExchangeRateForm.probe.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `components/ExchangeRateForm.probe.tsx` containing
      exactly:

      ```tsx
      import ExchangeRateForm from "@/components/ExchangeRateForm";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `components/ExchangeRateForm.probe.tsx(1,30): error TS2307: Cannot find module '@/components/ExchangeRateForm' or its corresponding type declarations.`
      (Verified empirically against this exact repo state before writing this plan — after simulating
      Tasks 1–3's output.)

- [x] **Step 3 — Implement.** Create `components/ExchangeRateForm.tsx`:

      ```tsx
      "use client";

      import { useState, type FormEvent } from "react";
      import type { Trip } from "@/lib/types";
      import { getSupportedCurrencies } from "@/lib/countries";
      import { getExchangeRates, saveExchangeRates } from "@/lib/storage";
      import { validateExchangeRateInput, setExchangeRate } from "@/lib/currency";

      export default function ExchangeRateForm({ trip }: { trip: Trip }) {
        const currencyOptions = getSupportedCurrencies().filter((c) => c !== trip.currency);
        const [currency, setCurrency] = useState(currencyOptions[0] ?? "");
        const [rateInput, setRateInput] = useState("");
        const [error, setError] = useState<string | null>(null);
        const [saved, setSaved] = useState(false);

        function handleSubmit(e: FormEvent) {
          e.preventDefault();
          const { error: validationError } = validateExchangeRateInput(currency, rateInput, trip.currency);
          if (validationError) {
            setError(validationError);
            setSaved(false);
            return;
          }

          const result = saveExchangeRates(
            setExchangeRate(getExchangeRates(), currency, Number(rateInput.trim()))
          );
          if (!result.ok) {
            setError(result.error);
            setSaved(false);
            return;
          }

          setError(null);
          setRateInput("");
          setSaved(true);
        }

        return (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
            <h2 className="text-xl font-semibold">Exchange rate</h2>

            <div className="flex flex-col gap-1">
              <label htmlFor="rateCurrency">Currency</label>
              <select id="rateCurrency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {currencyOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="rateValue">
                Rate (1 {currency} = ? {trip.currency})
              </label>
              <input
                id="rateValue"
                type="text"
                inputMode="decimal"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
              />
            </div>

            {error && <p role="alert">{error}</p>}
            {saved && <p role="status">Exchange rate saved.</p>}

            <button type="submit">Save exchange rate</button>
          </form>
        );
      }
      ```

      Design notes (for review): the currency `<select>` excludes `trip.currency` as a UX nicety, but
      `validateExchangeRateInput` is still called and still independently rejects a same-currency
      submission — kept deliberately per spec §6 Challenge 4, not redundant. A successful save clears
      `rateInput` but keeps `currency` selected (so entering several rates in a row doesn't require
      re-selecting a currency each time) and shows a `role="status"` confirmation; a validation or
      storage error uses `role="alert"` and does not clear `rateInput`, mirroring `ExpenseForm`'s
      existing error-preserves-input pattern. `saveExchangeRates`/`getExchangeRates` are read fresh on
      every submit (not cached in state), matching how `ExpenseForm` reads `getExpenses`/`saveExpenses`
      fresh on every submit rather than holding a stale in-memory copy.

- [x] **Step 4 — Delete the probe.** Remove `components/ExchangeRateForm.probe.tsx`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as Task 1 (this
      component is not yet mounted in any route).

- [x] **Step 7 — Commit.**
      `git add components/ExchangeRateForm.tsx && git commit`
      Message: `feat(006): add ExchangeRateForm for entering a fixed rate on a non-trip currency`

---

### Task 5: [Route] — /settings renders ExchangeRateForm for the active trip

**Depends on Task 4** (`components/ExchangeRateForm.tsx`).

**Files**
- modify: `app/settings/page.tsx` (replaces the feature-007 placeholder)
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Implement the route.** Replace the entire contents of `app/settings/page.tsx`
      (currently the feature-007 placeholder:
      `export default function Page() { return <h1>Settings</h1>; }`) with the same hydration-safe
      `useSyncExternalStore`-over-a-per-mount-store, redirect-if-no-trip pattern feature 002/003/005
      already established for `/trip/edit` and `/expenses/new`:

      ```tsx
      "use client";

      import { useEffect, useState, useSyncExternalStore } from "react";
      import { useRouter } from "next/navigation";
      import type { Trip } from "@/lib/types";
      import { getTrip } from "@/lib/storage";
      import ExchangeRateForm from "@/components/ExchangeRateForm";

      type TripSnapshot = Trip | null | undefined;

      function createTripStore() {
        let cached: TripSnapshot;
        let hasRead = false;

        return {
          subscribe(): () => void {
            return () => {};
          },
          getSnapshot(): TripSnapshot {
            if (!hasRead) {
              cached = getTrip();
              hasRead = true;
            }
            return cached;
          },
          getServerSnapshot(): TripSnapshot {
            return undefined;
          },
        };
      }

      export default function SettingsPage() {
        const router = useRouter();
        const [store] = useState(createTripStore);
        const trip = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

        useEffect(() => {
          if (trip === null) {
            router.replace("/");
          }
        }, [trip, router]);

        if (trip === undefined || trip === null) {
          return null;
        }

        return (
          <div>
            <h1 className="text-xl font-semibold p-4">Settings</h1>
            <ExchangeRateForm trip={trip} />
          </div>
        );
      }
      ```

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output. (The only `useEffect` calls `router.replace`, never a state setter
      — the same shape already confirmed clean of `react-hooks/set-state-in-effect` for
      `app/trip/edit/page.tsx` and `app/expenses/new/page.tsx`.)

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with the same seven-route table as Task 1 (`/settings` already existed
      as the feature-007 placeholder; this task changes its content, not the route list):
      ```
      Route (app)
      ┌ ○ /
      ├ ○ /_not-found
      ├ ○ /categories
      ├ ○ /expenses/new
      ├ ○ /settings
      ├ ○ /trip/edit
      └ ○ /trip/new
      ```

- [x] **Step 5 — NOT PERFORMED unless a browser automation tool is available in this environment.**
      Manual check: no active trip redirects home. Run `npm run dev`. In a browser devtools console on
      `http://localhost:3000`, run `localStorage.clear()`, then navigate directly to
      `http://localhost:3000/settings`.
      Expected: the browser lands on `http://localhost:3000/` and shows the trip setup form; no
      exchange-rate form is shown at any point.

- [x] **Step 6 — NOT PERFORMED unless a browser automation tool is available in this environment.**
      Manual check: entering a valid rate persists it (AC-006-06 setup, AC-006-11). With an active trip
      saved (e.g. Singapore/SGD) and at least one JPY expense recorded, open
      `http://localhost:3000/settings`.
      Expected: a "Currency" select excluding SGD, and a "Rate" input, are shown.
      Select JPY, enter `0.01`, submit.
      Expected: "Exchange rate saved." (`role="status"`) appears; in the devtools console,
      `JSON.parse(localStorage.getItem("travel-expense:exchange-rates"))` shows exactly one entry
      `{ currency: "JPY", rate: 0.01 }`.
      Enter `0.0095` for JPY again, submit.
      Expected: the same storage key now shows exactly one entry for JPY, with `rate: 0.0095` (not two
      entries).

- [x] **Step 7 — NOT PERFORMED unless a browser automation tool is available in this environment.**
      Manual check: invalid and same-currency input is rejected (AC-006-09, AC-006-10). On the same
      page, for each of rate values `0`, `-1`, `abc`, and an empty input, with currency JPY selected,
      submit.
      Expected, for each: a `role="alert"` error appears; `localStorage.getItem("travel-expense:exchange-rates")`
      is unchanged from before that attempt.
      Then, using the browser devtools console (bypassing the `<select>`'s exclusion, since SGD is not
      offered as an option), confirm the validator itself rejects the trip's own currency:
      `JSON.parse` is not needed — this check instead confirms via code review that
      `validateExchangeRateInput("SGD", "1.2", "SGD")` returns a non-empty `error`, matching Task 2's
      implementation already verified by `npx tsc --noEmit`/`npm run lint` passing on that code.

- [x] **Step 8 — Commit.**
      `git add app/settings/page.tsx && git commit`
      Message: `feat(006): add the exchange-rate entry route`
      (If Steps 5-7 could not be performed because no browser automation tool is available in this
      environment, say so explicitly in the commit body and in `log.txt`, matching the disclosure
      precedent set in feature 005's plan, Task 6.)

---

### Task 6: [Route] — Home page shows spending by currency and a converted total

**Depends on Tasks 1–3** (every export of `lib/currency.ts`).

**Files**
- modify: `app/page.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Implement.** In `app/page.tsx`:

      1. Change the storage import line from
         `import { getTrip } from "@/lib/storage";` to also import `getExpenses` and
         `getExchangeRates` (both already exported by `lib/storage.ts` since feature 012/005 — no
         change to that file):

      ```tsx
      import { getExpenses, getExchangeRates, getTrip } from "@/lib/storage";
      ```

      2. Add a new import line, directly after the existing
         `import { EXPENSE_SAVED_FLAG_KEY } from "@/lib/expenses";` line:

      ```tsx
      import { getExpenseTotalsByCurrency, getConvertedTotals } from "@/lib/currency";
      ```

      3. Inside `Home()`, immediately after the existing
         `const durationDays = calculateTripDurationDays(trip.startDate, trip.endDate);` line, add:

      ```tsx
      // Currency totals below — minimal surface for feature 006, will be folded
      // into feature 009's full dashboard layout.
      const currencyTotals = getExpenseTotalsByCurrency(getExpenses());
      const convertedTotals = getConvertedTotals(currencyTotals, trip.currency, getExchangeRates());
      ```

      4. Inside the returned JSX, immediately after the existing `<Link href="/trip/edit">Edit trip</Link>`
         line and before the closing `</div>`, add:

      ```tsx
      {currencyTotals.length > 0 && (
        <div className="flex flex-col gap-1 pt-4">
          <h2 className="text-xl font-semibold">Spending by currency</h2>
          <ul className="flex flex-col divide-y divide-(--border)">
            {currencyTotals.map((total) => (
              <li key={total.currency} className="font-mono py-1">
                {total.currency} {total.amount.toFixed(2)}
              </li>
            ))}
          </ul>
          <p className="font-mono">
            {trip.currency} {convertedTotals.convertedTotal.toFixed(2)}
          </p>
          {!convertedTotals.isComplete && (
            <p role="status">
              Converted total is incomplete. Missing a rate for{" "}
              {convertedTotals.missingCurrencies.join(", ")}.
            </p>
          )}
        </div>
      )}
      ```

      Copy note: the incomplete-conversion message uses a period, not an em dash, between its two
      clauses — design.md §8 bans the em dash in UI copy ("No em-dash (—) or en-dash-as-separator
      anywhere in UI copy — use a period, comma, or hyphen").

      Rule-to-code mapping (for review): the whole section is gated on `currencyTotals.length > 0` →
      the §1.5 "no expenses recorded yet" edge case/AC-006-12; each row shows `"{code} {amount}"` →
      BR-006-05/AC-006-04; the converted-total line always renders whenever the section is visible
      (whether or not every currency has a rate) → BR-006-08; the incomplete note is `role="status"`
      (informational, non-blocking) and names every currency in `missingCurrencies`, joined with
      `", "` → BR-006-10/AC-006-08.

- [x] **Step 2 — Regression run.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as Task 1.

- [x] **Step 3 — NOT PERFORMED unless a browser automation tool is available in this environment.**
      Manual check: totals, conversion, and incompleteness render correctly end-to-end (AC-006-04
      through AC-006-08, AC-006-12). With an active trip saved (Singapore/SGD):

      **3a. No expenses yet (AC-006-12).** With no expenses recorded, open `http://localhost:3000/`.
      Expected: no "Spending by currency" heading appears anywhere on the page.

      **3b. Single-currency totals (AC-006-05), and AC-006-01 exercised in passing.** Record one SGD
      expense of `12.50` via `/expenses/new` (SGD is the trip currency).
      Expected (AC-006-01): the expense saves and redirects home with no exchange-rate field or
      prompt shown anywhere on `/expenses/new`.
      Return to `http://localhost:3000/`.
      Expected: "Spending by currency" shows exactly one row, `SGD 12.50`; the converted total line
      shows `SGD 12.50`; no incomplete-conversion note appears.

      **3c. Multi-currency totals without a rate (AC-006-04, AC-006-07, AC-006-08), and AC-006-02/03
      exercised in passing.** Record one JPY expense of `1500` via `/expenses/new` (no exchange rate
      entered for JPY yet).
      Expected (AC-006-02, AC-006-03): the expense saves and redirects home with no exchange-rate
      field or prompt shown; in the devtools console,
      `JSON.parse(localStorage.getItem("travel-expense:expenses"))` shows this expense with
      `currency: "JPY"` and `amount: 1500` — unconverted, not translated into SGD.
      Return to `http://localhost:3000/`.
      Expected: "Spending by currency" shows two rows, `JPY 1500.00` and `SGD 12.50`; a `role="status"`
      note reads "Converted total is incomplete. Missing a rate for JPY."; the converted total line
      still shows a number (`SGD 12.50` — only the SGD portion, since JPY has no rate yet).

      **3d. Converted total appears once a rate is entered (AC-006-06).** On `/settings`, enter
      exchange rate `0.01` for JPY and save. Return to `http://localhost:3000/`.
      Expected: no incomplete-conversion note appears; the converted total line shows `SGD 27.50`
      (`12.50 + 1500 * 0.01`).

- [x] **Step 4 — Commit.**
      `git add app/page.tsx && git commit`
      Message: `feat(006): show spending by currency and a converted total on the home page`
      (If Step 3 could not be performed because no browser automation tool is available in this
      environment, say so explicitly in the commit body and in `log.txt`.)

---

## Execution

Work **one task at a time, in order.** Do not read ahead and batch tasks.

For each task:

1. Read the task's **Files** manifest before touching anything.
2. Run each step's verification command and compare the real output against the
   step's stated `Expected:` line. A mismatch means stop and diagnose — never
   edit the plan's expected output to match what you got.
3. Finish with the regression run: `npm run lint`, `npx tsc --noEmit`,
   `npm run build` — all three must exit 0.
4. Commit the task.
5. Update `plan.md` and the adjacent `log.txt` before starting the next task:
   tick the task's checkboxes, set `**Status:** In Progress` on the first
   completion, and append a log entry with Completed / Summary / Key Decisions /
   Deviations / Files Changed. Those two files are the resumption state for
   whoever picks this up cold.

Commit message format — Conventional Commits, scope is the feature number:

    feat(006): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: features/006.multi-currency-expense-tracking.md

Never commit on a failing lint, typecheck, or build.

## Completion Summary

**Completed:** 2026-09-11
**Tasks:** 6 of 6

**What was built:**
`lib/currency.ts` (a new pure domain module: `CurrencyTotal`/`getExpenseTotalsByCurrency` for
grouping and summing expenses by currency code; `validateExchangeRateInput`/`setExchangeRate` for
entering and storing a single current rate per non-trip currency; `ConvertedTotalsResult`/
`getConvertedTotals` for converting totals into the trip currency and reporting which currencies
still lack a rate), `components/ExchangeRateForm.tsx` (a minimal client form for entering a fixed
rate), the `/settings` route (replacing its feature-007 placeholder, mounting `ExchangeRateForm`),
and a "Spending by currency" section on the home page (per-currency totals, a converted total, and
an incomplete-conversion note naming any missing currencies). Recording an expense in the trip
currency or a different currency required no code change — feature 005's `submitExpense`/
`ExpenseForm` already supported it; this was verified and manually exercised as part of Task 6's
disclosed-as-skipped browser checks (not independently re-tested via automation).

**Deviations from the plan:**
- Task 4: Gate B found `validateExchangeRateInput` had no guard against an empty `currency` string
  (unreachable today since `getSupportedCurrencies()` always leaves 30+ options, but a real gap in a
  shared validator). Fixed by adding an empty-currency check before the same-currency check. Required
  a second review round on both gates.
- Task 5: the implementer's REFERENCE.md edit correctly updated the `settings/page.tsx` entry but
  left `ExchangeRateForm.tsx`'s own entry saying "not yet wired to a route" (now false). Controller
  fixed this one-line staleness directly before committing.
- Task 6: both gates independently caught a regression where the implementer's REFERENCE.md edit
  reverted `ExchangeRateForm.tsx`'s "mounted at /settings" note back to "not yet wired to a route".
  Fixed by restoring that line to match HEAD exactly. Required a second review round on both gates.
- Task 3's implementer subagent hit a session-level API error on its first dispatch, before writing
  any files (confirmed via a clean `git status`/`git diff`); treated as an infrastructure failure,
  not a failed implementation attempt, and retried as a fresh first attempt.
- All manual browser-check steps (Tasks 5 and 6) were **NOT PERFORMED** — no browser automation tool
  is available in this environment, matching the disclosed precedent in feature 005's plan. Static
  review (both gates traced every AC by hand against the real committed code) stands in, but is not a
  substitute for an actual browser run.
- A repo context packet (`memories/repo/travel-expense-context.md`) did not exist before this run —
  generated it from `REFERENCE.md` §2/§4/§6, `OVERVIEW.md` §1–3, and `design.md`, per CLAUDE.md's
  cost-optimization rules, and used it for every implementer/reviewer subagent this run.

**Follow-ups not in scope here:**
- **A human should run this plan's Tasks 5 and 6 manual browser checks** (redirect-when-no-trip,
  rate save/overwrite, invalid-input rejection, all four home-page rendering scenarios) before
  treating feature 006 as fully verified end-to-end.
- The full Exchange Rate Management page (viewing/editing/deleting every stored rate) — feature 007,
  which is expected to replace (not extend) `ExchangeRateForm.tsx`/`/settings` built here.
- The full Home Dashboard layout (budget, pie chart, last 5 transactions) — feature 009, which is
  expected to fold in (not replace) the "Spending by currency" section built here.
- Rate history / time-varying rates, and rounding-precision policy for converted amounts — both
  flagged as open questions in `doc/spec/006.multi-currency-expense-tracking.md` §7.

**Final verification:**
npx tsc --noEmit   exit 0, no output
npm run lint       exit 0, no output
npm run build      exit 0, seven-route table unchanged (/, /_not-found, /categories, /expenses/new,
                   /settings, /trip/edit, /trip/new)
