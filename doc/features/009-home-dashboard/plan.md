# Home Dashboard — Implementation Plan

**Status:** Complete
**Source:** `doc/spec/009.home-dashboard.md`
**Goal:** Replace `app/page.tsx`'s placeholder with the real home dashboard: trip summary, always-
visible total spend, budget/remaining (unchanged from feature 008), a hand-rolled category pie
chart, and the last five transactions with tap-through to a view-only detail page.

**Architecture:**
Two small pure additions land in existing domain modules — `getCategoryTotals` in `lib/currency.ts`
(mirrors `getConvertedTotals`'s shape, grouping by category instead of currency) and
`getRecentExpenses` in `lib/expenses.ts`. A new `components/CategoryPieChart.tsx` renders a CSS
`conic-gradient` pie chart plus a text legend — no chart library, per REFERENCE.md §2. A new
`components/Dashboard.tsx` absorbs everything currently inlined in `app/page.tsx` (trip summary,
total spend, budget) plus the two new sections (category chart, recent transactions), finally
"folding in" what feature 006/008's own code comments said would happen here. `app/page.tsx` shrinks
to a thin shell mounting `Dashboard`. A new `app/expenses/[id]/page.tsx` — this app's first dynamic
route — shows one expense's full detail, view-only.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage — no backend, no database. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build`. No test runner is installed (verified: `package.json` has no
`test` script; `node_modules/.bin` contains only `eslint`, `next`, `tsc`).

**Negative constraints (from `doc/spec/009.home-dashboard.md` §1.6, §2.5, §2.4):**
- Will NOT add a chart library — the pie chart is CSS `conic-gradient` plus a text legend, zero new
  dependencies, per REFERENCE.md §2's explicit instruction not to silently add one.
- Will NOT change how a trip, expense, exchange rate, or budget is entered or validated — this
  feature only reads and displays what features 001–008 already write.
- Will NOT add edit or delete to the transaction detail view — view-only, per OVERVIEW §3
  Assumption 5.
- Will NOT touch, reference, or build upon the unrelated uncommitted dark-mode theming refactor
  currently sitting in the working tree (`components/DateField.tsx`, `ThemeToggle.tsx`,
  `lib/theme.ts`, and edits to `globals.css`/`layout.tsx`/`BottomNav.tsx`/`TripEditForm.tsx`/
  `TripSetupForm.tsx`/`ExpenseForm.tsx`/`NewTripConfirm.tsx`) — none of this plan's tasks touch any
  of those files or their new tokens/classes.
- Will NOT add filtering, search, date-range controls, or a full expense history beyond the last
  five — not requested by any scenario.
- Will NOT re-test feature 008's `getRemainingBudget`/budget-display logic — reused completely
  unchanged, just relocated into `Dashboard.tsx`.

**Assumptions:**
- Assumed: the category pie chart's slice colors come from a deterministic `hsl(hue, 60%, 50%)`
  rotation, not `design.md`'s single-accent-color rule — that rule governs UI chrome (buttons, nav,
  links), not categorical data visualization, and a fixed small palette would break once a user's
  custom categories (feature 010 allows arbitrary names) exceed it.
- Assumed: an expense's stored `category` string is authoritative for grouping — no live
  `getAllCategories()` lookup is needed, since the string is what every other part of this app
  already treats as the category identity (feature 010's rename/delete semantics already establish
  this).
- Assumed: `PageProps<'/expenses/[id]'>` (the globally-generated type, per REFERENCE.md §5's existing
  rule to never hand-write route prop interfaces) produces `{ params: Promise<{ id: string }> }`
  correctly for a `'use client'` page — the type is generated structurally from the route's folder
  name, independent of the Server/Client boundary; if this assumption is wrong, Task 6's own
  typecheck step will surface a concrete, diagnosable mismatch rather than fail silently.

---

### Task 1: [Domain] — getCategoryTotals groups expense amounts by category in the trip currency

**Files**
- modify: `lib/currency.ts`
- modify: `REFERENCE.md` (refresh the `lib/currency.ts` file-tree entry to mention
  `getCategoryTotals`)
- create (temporary, deleted within this task): `lib/currency.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/currency.probe.ts` containing exactly:

      ```ts
      import { getCategoryTotals } from "@/lib/currency";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/currency.probe.ts(1,10): error TS2305: Module '"@/lib/currency"' has no exported member 'getCategoryTotals'.`
      (Verified empirically against this exact repo state before writing this plan — plain `TS2305`,
      no "did you mean" suggestion.)

- [x] **Step 3 — Implement.** In `lib/currency.ts`, add (`Expense`/`ExchangeRate` are already
      imported at the top of this file — no new import needed):

      ```ts
      export interface CategoryTotal {
        category: string;
        amount: number;
      }

      export interface CategoryTotalsResult {
        categoryTotals: CategoryTotal[];
        isComplete: boolean;
        missingCurrencies: string[];
      }

      export function getCategoryTotals(
        expenses: Expense[],
        tripCurrency: string,
        rates: ExchangeRate[]
      ): CategoryTotalsResult {
        const totals = new Map<string, number>();
        const missingCurrencies = new Set<string>();

        for (const expense of expenses) {
          let convertedAmount: number;
          if (expense.currency === tripCurrency) {
            convertedAmount = expense.amount;
          } else {
            const rate = rates.find((r) => r.currency === expense.currency);
            if (rate === undefined) {
              missingCurrencies.add(expense.currency);
              continue;
            }
            convertedAmount = expense.amount * rate.rate;
          }
          totals.set(expense.category, (totals.get(expense.category) ?? 0) + convertedAmount);
        }

        const categoryTotals = Array.from(totals.entries())
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount);

        return {
          categoryTotals,
          isComplete: missingCurrencies.size === 0,
          missingCurrencies: Array.from(missingCurrencies).sort(),
        };
      }
      ```

- [x] **Step 4 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 5 — Delete the probe and re-run.** Remove `lib/currency.probe.ts`, then
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Update REFERENCE.md.** Read the current `lib/currency.ts` file-tree entry in
      REFERENCE.md §4 (it documents each exported function in one long line). Add
      `getCategoryTotals(expenses, tripCurrency, rates)` to that same entry, in the same style,
      describing what it returns (category totals converted to the trip currency, excluding
      expenses whose currency has no saved rate, mirroring `getConvertedTotals`'s own
      missing-rate handling). Do not touch any other REFERENCE.md entry.

- [x] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the route table unchanged from the end of
      feature 008:
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

- [x] **Step 8 — Commit.**
      `git add lib/currency.ts REFERENCE.md && git commit`
      Message: `feat(009): add getCategoryTotals to lib/currency`

---

### Task 2: [Domain] — getRecentExpenses returns the newest expenses, newest first

**Files**
- modify: `lib/expenses.ts`
- modify: `REFERENCE.md` (refresh the `lib/expenses.ts` file-tree entry to mention
  `getRecentExpenses`)
- create (temporary, deleted within this task): `lib/expenses.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/expenses.probe.ts` containing exactly:

      ```ts
      import { getRecentExpenses } from "@/lib/expenses";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/expenses.probe.ts(1,10): error TS2305: Module '"@/lib/expenses"' has no exported member 'getRecentExpenses'.`
      (Verified empirically against this exact repo state before writing this plan — plain `TS2305`,
      no "did you mean" suggestion.)

- [x] **Step 3 — Implement.** In `lib/expenses.ts`, add (`Expense` is already imported at the top of
      this file):

      ```ts
      export const RECENT_EXPENSE_LIMIT = 5;

      export function getRecentExpenses(
        expenses: Expense[],
        limit: number = RECENT_EXPENSE_LIMIT
      ): Expense[] {
        return [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
      }
      ```

      (`Array.prototype.sort` is stable per the ES2019 spec, so two expenses sharing the same `date`
      keep the relative order they were recorded in — no extra tie-break logic needed.)

- [x] **Step 4 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 5 — Delete the probe and re-run.** Remove `lib/expenses.probe.ts`, then
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Update REFERENCE.md.** Read the current `lib/expenses.ts` file-tree entry in
      REFERENCE.md §4. Add `getRecentExpenses(expenses, limit?)` (and `RECENT_EXPENSE_LIMIT`) to
      that same entry, in the same style, describing that it returns the newest expenses by date,
      newest first, defaulting to the last 5. Do not touch any other REFERENCE.md entry.

- [x] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same route table as Task 1.

- [x] **Step 8 — Commit.**
      `git add lib/expenses.ts REFERENCE.md && git commit`
      Message: `feat(009): add getRecentExpenses to lib/expenses`

---

### Task 3: [UI] — CategoryPieChart renders a hand-rolled conic-gradient chart with a legend

**Files**
- create: `components/CategoryPieChart.tsx`
- modify: `REFERENCE.md` (add a `components/CategoryPieChart.tsx` entry to the file tree)
- create (temporary, deleted within this task): `components/CategoryPieChart.probe.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `components/CategoryPieChart.probe.tsx`
      containing exactly one line:

      ```tsx
      import CategoryPieChart from "@/components/CategoryPieChart";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `components/CategoryPieChart.probe.tsx(1,30): error TS2307: Cannot find module '@/components/CategoryPieChart' or its corresponding type declarations.`
      (Column 30 follows the same formula empirically confirmed twice in earlier features —
      `import <Name> from "<path>";` puts the opening quote at column `14 + length(<Name>)`;
      `"CategoryPieChart"` is 16 characters, so `14 + 16 = 30`.)

- [x] **Step 3 — Implement the component.** Create `components/CategoryPieChart.tsx`. No `'use
      client'` directive — this component has no hooks or event handlers, matching
      `components/NewTripConfirm.tsx`'s precedent of a plain component when nothing client-only is
      needed:

      ```tsx
      import type { CategoryTotal } from "@/lib/currency";

      function getCategoryColor(index: number, total: number): string {
        const hue = Math.round((index * 360) / Math.max(total, 1));
        return `hsl(${hue}, 60%, 50%)`;
      }

      export default function CategoryPieChart({
        categoryTotals,
      }: {
        categoryTotals: CategoryTotal[];
      }) {
        const total = categoryTotals.reduce((sum, c) => sum + c.amount, 0);
        if (total <= 0) {
          return null;
        }

        const segments = categoryTotals.reduce<
          { category: string; percent: number; start: number; end: number; color: string }[]
        >((acc, c, index) => {
          const percent = (c.amount / total) * 100;
          const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
          acc.push({
            category: c.category,
            percent,
            start,
            end: start + percent,
            color: getCategoryColor(index, categoryTotals.length),
          });
          return acc;
        }, []);
        // (SHIPPED DEVIATION: the plan originally had this reassign an outer `let
        // cumulativePercent` inside .map() — this repo's react-hooks/immutability ESLint rule
        // rejects that during render. Reduce-based accumulation above ships instead; see
        // log.txt Task 3 for detail. Same external behavior/output.)

        const gradient = segments.map((s) => `${s.color} ${s.start}% ${s.end}%`).join(", ");
        const summary = segments.map((s) => `${s.category} ${s.percent.toFixed(0)}%`).join(", ");

        return (
          <div className="flex items-center gap-4">
            <div
              role="img"
              aria-label={`Spending by category: ${summary}`}
              className="h-32 w-32 shrink-0 rounded-full"
              style={{ background: `conic-gradient(${gradient})` }}
            />
            <ul className="flex flex-col gap-1">
              {segments.map((s) => (
                <li key={s.category} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: s.color }}
                  />
                  <span>
                    {s.category}: {s.percent.toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      }
      ```

- [x] **Step 4 — Delete the probe.** Remove `components/CategoryPieChart.probe.tsx`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Update REFERENCE.md.** Add a `components/CategoryPieChart.tsx` entry to REFERENCE.md
      §4's file tree, in the same style as the other `components/` entries (e.g.
      `components/NewTripConfirm.tsx`'s line), noting it takes `categoryTotals` and renders a
      `conic-gradient` chart plus a text legend, and that it is not yet mounted in any route.

- [x] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same route table as Task 1 (this component
      is not yet mounted in any route).

- [x] **Step 8 — Commit.**
      `git add components/CategoryPieChart.tsx REFERENCE.md && git commit`
      Message: `feat(009): add CategoryPieChart, a hand-rolled conic-gradient chart`

---

### Task 4: [UI] — Dashboard assembles the full dashboard body

**Files**
- create: `components/Dashboard.tsx`
- modify: `REFERENCE.md` (add a `components/Dashboard.tsx` entry to the file tree)
- create (temporary, deleted within this task): `components/Dashboard.probe.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

> This task creates `Dashboard.tsx` as a standalone component, verified only by the compiler/lint/
> build — it is not mounted into `app/page.tsx` until Task 5, the same "build the component, wire
> the route next" split already used for `TripEditForm`/`TripSetupForm`/`ExpenseForm` in earlier
> features.

- [x] **Step 1 — Write the failing check.** Create `components/Dashboard.probe.tsx` containing
      exactly one line:

      ```tsx
      import Dashboard from "@/components/Dashboard";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `components/Dashboard.probe.tsx(1,23): error TS2307: Cannot find module '@/components/Dashboard' or its corresponding type declarations.`
      (Column 23 via the same formula: `"Dashboard"` is 9 characters, `14 + 9 = 23`.)

- [x] **Step 3 — Implement the component.** Create `components/Dashboard.tsx`. This absorbs the
      trip-summary, total-spending, and budget sections currently inlined in `app/page.tsx`
      (unchanged in substance — see the negative constraints on not re-testing feature 008's logic),
      with one behavior change per the spec (BR-009-02): total spending is now always shown, even
      when zero, instead of the whole section disappearing when there are no expenses:

      ```tsx
      "use client";

      import Link from "next/link";
      import type { Trip } from "@/lib/types";
      import { getExpenses, getExchangeRates } from "@/lib/storage";
      import { calculateTripDurationDays } from "@/lib/trip";
      import {
        getExpenseTotalsByCurrency,
        getConvertedTotals,
        getRemainingBudget,
        getCategoryTotals,
      } from "@/lib/currency";
      import { getRecentExpenses } from "@/lib/expenses";
      import CategoryPieChart from "@/components/CategoryPieChart";

      export default function Dashboard({
        trip,
        showSavedMessage,
      }: {
        trip: Trip;
        showSavedMessage: boolean;
      }) {
        const durationDays = calculateTripDurationDays(trip.startDate, trip.endDate);

        // Plain synchronous storage reads, not useSyncExternalStore: this component is only ever
        // mounted by app/page.tsx after ITS useSyncExternalStore gate has already resolved past
        // `undefined`/`null`, so there is no server render or hydration pass of Dashboard itself
        // to mismatch. Do not "fix" this with useEffect — that would add a data pop-in flash.
        const expenses = getExpenses();
        const rates = getExchangeRates();
        const currencyTotals = getExpenseTotalsByCurrency(expenses);
        const convertedTotals = getConvertedTotals(currencyTotals, trip.currency, rates);
        const remainingBudget =
          trip.budget !== undefined ? getRemainingBudget(trip.budget, convertedTotals) : null;
        const categoryTotals = getCategoryTotals(expenses, trip.currency, rates).categoryTotals;
        const recentExpenses = getRecentExpenses(expenses);

        return (
          <div className="p-4">
            {showSavedMessage && <p role="status">Expense saved.</p>}
            <h1 className="text-xl font-semibold">Home</h1>
            <p>
              Trip to {trip.destinationCountry} ({trip.startDate} to {trip.endDate},{" "}
              {durationDays} {durationDays === 1 ? "day" : "days"})
            </p>
            <Link href="/trip/edit">Edit trip</Link>

            <div className="flex flex-col gap-1 pt-4">
              <h2 className="text-xl font-semibold">Total spending</h2>
              <p className="font-mono">
                {trip.currency} {convertedTotals.convertedTotal.toFixed(2)}
              </p>
              {currencyTotals.length > 0 && (
                <ul className="flex flex-col divide-y divide-(--border)">
                  {currencyTotals.map((total) => (
                    <li key={total.currency} className="font-mono py-1">
                      {total.currency} {total.amount.toFixed(2)}
                    </li>
                  ))}
                </ul>
              )}
              {!convertedTotals.isComplete && (
                <p role="status">
                  Converted total is incomplete. Missing a rate for{" "}
                  {convertedTotals.missingCurrencies.join(", ")}.
                </p>
              )}
            </div>

            {trip.budget !== undefined && (
              <div className="flex flex-col gap-1 pt-4">
                <h2 className="text-xl font-semibold">Budget</h2>
                <p className="font-mono">
                  Budget: {trip.currency} {trip.budget.toFixed(2)}
                </p>
                {remainingBudget !== null ? (
                  <p className={`font-mono ${remainingBudget < 0 ? "text-(--danger)" : ""}`}>
                    Remaining: {trip.currency} {remainingBudget.toFixed(2)}
                  </p>
                ) : (
                  <p role="status">Remaining budget cannot be fully calculated yet.</p>
                )}
              </div>
            )}

            {categoryTotals.length > 0 && (
              <div className="flex flex-col gap-1 pt-4">
                <h2 className="text-xl font-semibold">Spending by category</h2>
                <CategoryPieChart categoryTotals={categoryTotals} />
              </div>
            )}

            <div className="flex flex-col gap-1 pt-4">
              <h2 className="text-xl font-semibold">Recent transactions</h2>
              {recentExpenses.length === 0 ? (
                <p>No expenses recorded yet.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-(--border)">
                  {recentExpenses.map((expense) => (
                    <li key={expense.id}>
                      <Link
                        href={`/expenses/${expense.id}`}
                        className="flex justify-between gap-2 py-2"
                      >
                        <span>
                          {expense.date} · {expense.category}
                        </span>
                        <span className="font-mono">
                          {expense.currency} {expense.amount.toFixed(2)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      }
      ```

- [x] **Step 4 — Delete the probe.** Remove `components/Dashboard.probe.tsx`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Update REFERENCE.md.** Add a `components/Dashboard.tsx` entry to REFERENCE.md §4's
      file tree, in the same style as the other `components/` entries, describing its
      `{ trip, showSavedMessage }` props and that it renders the trip summary, total spend, budget,
      category chart, and recent transactions — noting it is not yet mounted in any route.

- [x] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same route table as Task 1 (this component
      is not yet mounted in any route).

- [x] **Step 8 — Commit.**
      `git add components/Dashboard.tsx REFERENCE.md && git commit`
      Message: `feat(009): add Dashboard, assembling the full home-screen layout`

---

### Task 5: [Route] — app/page.tsx mounts Dashboard

**Files**
- modify: `app/page.tsx`
- modify: `REFERENCE.md` (rewrite the `app/page.tsx` file-tree entry — it currently describes the
  inlined dashboard body this task removes; also drop the entries' now-stale "in progress" tags for
  005/006/008 sections that moved into `Dashboard.tsx`, since they're `Dashboard.tsx`'s entry to
  describe now, not `app/page.tsx`'s)
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Replace app/page.tsx's dashboard branch with Dashboard.** Read the current file
      first (it has an unrelated pre-existing uncommitted formatting diff from before this feature —
      keep whatever's currently there for the two stores verbatim, only change the import list and
      the final return branch). Replace the whole file with:

      ```tsx
      "use client";

      import { useState, useSyncExternalStore } from "react";
      import type { Trip } from "@/lib/types";
      import { getTrip } from "@/lib/storage";
      import { EXPENSE_SAVED_FLAG_KEY } from "@/lib/expenses";
      import TripSetupForm from "@/components/TripSetupForm";
      import Dashboard from "@/components/Dashboard";

      type TripSnapshot = Trip | null | undefined;

      function createTripStore() {
        let cached: TripSnapshot;
        let hasRead = false;
        const listeners = new Set<() => void>();

        return {
          subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => listeners.delete(listener);
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
          setSnapshot(trip: Trip) {
            cached = trip;
            hasRead = true;
            listeners.forEach((listener) => listener());
          },
        };
      }

      function createSavedMessageStore() {
        let cached = false;
        let hasRead = false;

        return {
          subscribe(): () => void {
            return () => {};
          },
          getSnapshot(): boolean {
            if (!hasRead) {
              try {
                cached = window.sessionStorage.getItem(EXPENSE_SAVED_FLAG_KEY) !== null;
                if (cached) {
                  window.sessionStorage.removeItem(EXPENSE_SAVED_FLAG_KEY);
                }
              } catch {
                cached = false;
              }
              hasRead = true;
            }
            return cached;
          },
          getServerSnapshot(): boolean {
            return false;
          },
        };
      }

      export default function Home() {
        const [store] = useState(createTripStore);
        const trip = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
        const [savedMessageStore] = useState(createSavedMessageStore);
        const showSavedMessage = useSyncExternalStore(
          savedMessageStore.subscribe,
          savedMessageStore.getSnapshot,
          savedMessageStore.getServerSnapshot,
        );

        if (trip === undefined) {
          return null;
        }

        if (trip === null) {
          return <TripSetupForm onSaved={store.setSnapshot} />;
        }

        return <Dashboard trip={trip} showSavedMessage={showSavedMessage} />;
      }
      ```

      (This drops the now-unused `Link`, `calculateTripDurationDays`, `getExpenseTotalsByCurrency`,
      `getConvertedTotals`, `getRemainingBudget`, and `getExchangeRates` imports — all of that logic
      now lives in `Dashboard.tsx`. Keeping any of them unused here would fail lint.)

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output.

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with the same route table as Task 1 (no new route added by this
      task — `app/page.tsx`'s content changed, but `/` itself isn't new).

- [x] **Step 5 — Manual check: the dashboard renders end to end.** No browser-automation tool may be
      available in this environment — if so, state that plainly instead of asserting these passed;
      do your best effort with whatever tooling exists.

      **5a. Zero-expenses dashboard (AC-009-01).** With an active trip and no expenses recorded, open
      `http://localhost:3000/`.
      Expected: destination country, dates, day count, and trip currency are shown; "Total spending"
      shows `<CODE> 0.00`; "Recent transactions" shows "No expenses recorded yet." (not a blank
      area).

      **5b. Total spending and category chart with expenses (AC-009-02, AC-009-03).** Record three
      expenses, all in the trip's own currency, across at least two categories. Reopen `/`.
      Expected: "Total spending" shows the correct nonzero `<CODE> amount`; a "Spending by category"
      section appears with a visible circular chart and a text legend naming each category and a
      percentage.

      **5c. Recent transactions, tap-through, and the five-item ceiling (AC-009-04, 05, 06, 07).**
      Record expenses until at least six exist, each on a different date. Reopen `/`.
      Expected: "Recent transactions" lists exactly five rows, ordered newest date first; each row
      is a link whose `href` is `/expenses/{that expense's id}`. Clicking one navigates there; since
      `app/expenses/[id]/page.tsx` doesn't exist until Task 6, this currently shows Next's default
      not-found page — that is expected here, not a failure. The row's full detail is verified in
      Task 6's own manual check (Step 5a), once that route exists.

- [x] **Step 6 — Update REFERENCE.md.** Rewrite the `app/page.tsx` file-tree entry — it currently
      describes the inlined dashboard body this task removes. Drop the now-stale "in progress" tags
      on the 005/006/008 sections that moved into `Dashboard.tsx`; those are `Dashboard.tsx`'s entry
      to describe now, not `app/page.tsx`'s.
      `git diff REFERENCE.md`
      Expected: the diff shows `app/page.tsx`'s entry reduced to describing a thin shell (trip-gate,
      saved-message flag, mounting `TripSetupForm` or `Dashboard`), with no remaining reference to
      inlined budget/currency/spending sections under that entry.

- [x] **Step 7 — Commit.**
      `git add app/page.tsx REFERENCE.md && git commit`
      Message: `feat(009): mount Dashboard from the home route`

---

### Task 6: [Route] — app/expenses/[id]/page.tsx shows a view-only transaction detail

**Files**
- create: `app/expenses/[id]/page.tsx`
- modify: `REFERENCE.md` (add an `app/expenses/[id]/page.tsx` entry to the file tree)
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Implement the route.** Create `app/expenses/[id]/page.tsx` — this app's first
      dynamic route segment. Mirrors the hydration-safe `useSyncExternalStore`-over-a-per-mount-store
      pattern every other route in this app already uses, reading the route param via the
      globally-generated `PageProps<'/expenses/[id]'>` type (per REFERENCE.md §5 — never hand-write
      route prop interfaces) and React's `use()` (confirmed pattern for unwrapping a `params` Promise
      in a Client Component page — see `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/dynamic-routes.md`,
      "In Client Components" section):

      ```tsx
      "use client";

      import { use, useState, useSyncExternalStore } from "react";
      import Link from "next/link";
      import type { Expense } from "@/lib/types";
      import { getExpenses } from "@/lib/storage";

      type ExpensesSnapshot = Expense[] | undefined;

      function createExpensesStore() {
        let cached: ExpensesSnapshot;
        let hasRead = false;

        return {
          subscribe(): () => void {
            return () => {};
          },
          getSnapshot(): ExpensesSnapshot {
            if (!hasRead) {
              cached = getExpenses();
              hasRead = true;
            }
            return cached;
          },
          getServerSnapshot(): ExpensesSnapshot {
            return undefined;
          },
        };
      }

      export default function ExpenseDetailPage(props: PageProps<"/expenses/[id]">) {
        const { id } = use(props.params);
        const [store] = useState(createExpensesStore);
        const expenses = useSyncExternalStore(
          store.subscribe,
          store.getSnapshot,
          store.getServerSnapshot,
        );

        if (expenses === undefined) {
          return null;
        }

        const expense = expenses.find((e) => e.id === id);

        if (!expense) {
          return (
            <div className="p-4 flex flex-col gap-2">
              <p>Expense not found.</p>
              <Link href="/">Back to home</Link>
            </div>
          );
        }

        return (
          <div className="p-4 flex flex-col gap-2">
            <h1 className="text-xl font-semibold">Expense details</h1>
            <p className="font-mono">
              {expense.currency} {expense.amount.toFixed(2)}
            </p>
            <p>Category: {expense.category}</p>
            <p className="font-mono">Date: {expense.date}</p>
            <p>Payment method: {expense.paymentMethod}</p>
            <p>Location: {expense.location}</p>
            <p>Description: {expense.description ?? "No description entered."}</p>
            <Link href="/">Back to home</Link>
          </div>
        );
      }
      ```

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.
      If this fails with a type error about `PageProps<'/expenses/[id]'>` or `props.params`'s shape,
      that means this plan's assumption about the generated type (see the plan header's
      "Assumptions") was wrong — stop and report the exact error rather than working around it with
      a hand-written type, per this repo's REFERENCE.md §5 rule against hand-writing route prop
      interfaces; the fix is almost certainly a one-line adjustment to how `id` is destructured, not
      a redesign.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output.

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with a route table that now includes `/expenses/[id]` (eight routes
      total). The exact marker Next assigns to a dynamic segment with no `generateStaticParams`
      (`○` static shell vs. `ƒ` dynamic) isn't asserted here — confirm the row for `/expenses/[id]`
      is present, whatever its marker, and note the actual output in `log.txt` rather than treating
      an unexpected-but-present marker as a failure:
      ```
      Route (app)
      ┌ ○ /
      ├ ○ /_not-found
      ├ ○ /categories
      ├   /expenses/[id]
      ├ ○ /expenses/new
      ├ ○ /settings
      ├ ○ /trip/edit
      └ ○ /trip/new
      ```

- [x] **Step 5 — Manual check: the detail view.** No browser-automation tool may be available in this
      environment — if so, state that plainly instead of asserting these passed.

      **5a. Full detail for a found expense (AC-009-07, 08).** From `/`, click a recent transaction
      that has a description entered.
      Expected: the URL becomes `/expenses/{that expense's id}` and shows its full detail — the
      page displays its date, category, `CODE amount`, payment method, location, and the entered
      description; a "Back to home" link is present. (This is the tap-through behavior Task 5's
      manual check deferred to here, since this route didn't exist yet at that point.)

      **5b. Missing description shows no crash and no literal "undefined" (AC-009-08).** Record (or
      find) an expense with no description entered, and open its detail page directly.
      Expected: the page renders without error; the description line reads
      "Description: No description entered." — the literal string `"undefined"` does not appear
      anywhere on the page.

      **5c. Not-found state for a nonexistent id (AC-009-10).** Navigate directly to
      `http://localhost:3000/expenses/does-not-exist`.
      Expected: the page shows "Expense not found." and a "Back to home" link; the app does not
      crash or show a blank page.

- [x] **Step 6 — Update REFERENCE.md.** Add an `app/expenses/[id]/page.tsx` entry to the file tree,
      describing it as the view-only expense detail route (this app's first dynamic route segment).
      `git diff REFERENCE.md`
      Expected: the diff adds a new file-tree entry for `app/expenses/[id]/page.tsx`; no other line
      changes.

- [x] **Step 7 — Commit.**
      `git add "app/expenses/[id]/page.tsx" REFERENCE.md && git commit`
      Message: `feat(009): add the view-only expense detail route`

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

    feat(005): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: features/005.record-expense.md

Never commit on a failing lint, typecheck, or build.

## Completion Summary

**What was built:**
- `lib/currency.ts`: `getCategoryTotals` (groups expense amounts by category, converted to the
  trip currency, mirroring `getConvertedTotals`'s missing-rate exclusion). Commit `4cda5e1`.
- `lib/expenses.ts`: `getRecentExpenses`/`RECENT_EXPENSE_LIMIT` (newest-first, default last 5).
  Commit `317701b`.
- `components/CategoryPieChart.tsx`: a hand-rolled CSS `conic-gradient` pie chart plus a text
  legend, zero chart-library dependencies. Commit `4430fd2`.
- `components/Dashboard.tsx`: the full home-dashboard body — trip summary, always-visible total
  spending (BR-009-02), budget (unchanged from feature 008), category chart, recent transactions
  with tap-through links. Commit `9766cdf`.
- `app/page.tsx`: shrunk to a thin trip-gate shell mounting `TripSetupForm` or `Dashboard`.
  Commit `de47404`.
- `app/expenses/[id]/page.tsx`: this app's first dynamic route, a view-only expense detail page.
  Commit `e2ce609`.

**Deviations from the plan:**
- Task 3: the plan's literal cumulative-percent code (a `let` reassigned inside `.map()`) failed
  this repo's `react-hooks/immutability` ESLint rule. Rewritten as a `reduce`-based local
  accumulator with identical external behavior; the plan's own code block was updated in place to
  match what shipped. See `log.txt` for the full incident.
- Task 5: the task's own REFERENCE.md instruction (rewrite only the `app/page.tsx` entry) left two
  sibling entries (`Dashboard.tsx`, `CategoryPieChart.tsx`) stale — both still said "not yet mounted
  in any route" after this task mounted them. Fixed in a one-clause-per-entry follow-up fix, caught
  by Gate A's first pass. See `log.txt`.
- Task 6: `.next/types/routes.d.ts` was stale for the newly added dynamic route on the first
  typecheck; `npx next typegen` regenerated it. A one-time generation-order artifact, not a flaw in
  the plan's `PageProps<'/expenses/[id]'>` assumption — confirmed by both review gates.
- Every task's REFERENCE.md diff was entangled with unrelated pre-existing uncommitted edits from
  concurrent work elsewhere in the shared working tree (a `design.md` read-order addition, and — in
  earlier tasks of this same feature, not this plan directly — a dark-mode theming refactor). Every
  commit isolated only this plan's own hunks via `git add -p`, verified line-by-line before staging.

**Follow-ups not in scope:**
- **RESIDUAL GAP** (flagged in `log.txt` for Tasks 5 and 6): no browser-automation tool exists in
  this environment, so every Step 5 manual browser check across both route tasks — the zero-expense
  dashboard, total spending and category chart with real expenses, the five-item recent-transactions
  cap and tap-through, the full detail view, the missing-description fallback, and the not-found
  state — could not be executed. Both review gates independently traced the relevant code by hand as
  the deepest available substitute, and partial curl-based checks confirmed the routes resolve
  without crashing, but a human should exercise all of AC-009-01 through AC-009-10 in an actual
  browser before treating feature 009 as fully verified end-to-end.
- Minor, non-blocking observations from review gates, none acted on (all documented in `log.txt`):
  `getCategoryTotals`'s conversion loop duplicates `getConvertedTotals`'s loop body rather than
  sharing a helper; a negative `limit` argument to `getRecentExpenses` would hit `Array.slice`'s
  negative-index semantics rather than returning an empty array (not currently reachable); the pie
  chart's `aria-label` and its visible text legend both announce the same "category: percent" text
  to screen readers.

**Final verification (all six tasks, cumulative):**
- `npx tsc --noEmit`: exit 0, no output.
- `npm run lint`: exit 0, no output.
- `npm run build`: exit 0, 8-route table (`/`, `/_not-found`, `/categories`, `/expenses/[id]`,
  `/expenses/new`, `/settings`, `/trip/edit`, `/trip/new`).
- All 12 review-gate passes across 6 tasks returned PASS (one task, Task 5, required one
  fix-and-re-review cycle on Gate A before passing).
