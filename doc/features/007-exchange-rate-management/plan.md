# Exchange Rate Management — Implementation Plan

**Status:** Complete
**Source:** `doc/spec/007.exchange-rate-management.md`
**Goal:** Turn feature 006's minimal exchange-rate entry form into a real management screen: scope
the currency choices to currencies actually used in recorded expenses, show the trip's own currency
for context, and let a previously-entered rate be seen and edited rather than blindly overwritten.

**Architecture:**
Feature 006 already built `lib/currency.ts`'s `validateExchangeRateInput`/`setExchangeRate` and
`components/ExchangeRateForm.tsx`/`app/settings/page.tsx` — this plan modifies those existing files,
it does not rebuild them. A new pure function, `getCurrenciesNeedingRates(expenses, tripCurrency)`,
replaces `ExchangeRateForm`'s currency source (currently every supported currency except the trip's)
with the actual set of non-trip currencies used in recorded expenses, rendering a short empty-state
message when that set is empty. The rate `<input>`/error/success portion of the form is extracted
into a child component, `RateInput`, mounted as `<RateInput key={currency} .../>` — the `key` forces
a fresh mount (and a fresh lazy-initialized state read) every time the selected currency changes,
which is what lets the field show an existing rate for that currency (or blank, if none) without a
`useEffect`-driven state sync, a pattern this repo's `react-hooks/set-state-in-effect` ESLint rule
would reject. `app/settings/page.tsx` gains one line displaying the trip's currency.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage — no backend, no database. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build`. No test runner is installed (verified: `package.json` has no
`test` script; `node_modules/.bin` contains only `eslint`, `next`, `tsc`).

**Negative constraints (from `doc/spec/007.exchange-rate-management.md` §1.6, §2.6, §7):**
- Will NOT touch `lib/expenses.ts`, `components/ExpenseForm.tsx`, or any record-expense behavior.
- Will NOT change how the dashboard computes or displays converted totals
  (`getConvertedTotals`/`app/page.tsx`'s "Spending by currency" section, feature 006) — it already
  reads `getExchangeRates()` fresh on every render, so a saved/updated rate reaches it with no new
  wiring from this plan.
- Will NOT add a way to delete a saved exchange rate — no scenario asks for this.
- Will NOT add automatic or looked-up exchange rates — rates stay fixed and manually entered.
- Will NOT add a rates list independent of current expense usage — the shown currency set is scoped
  to what's actually in use now (BR-007-02), not a historical ledger of every rate ever set.
- Will NOT change `lib/types.ts` — `ExchangeRate { currency; rate }` (feature 012) already has
  everything this feature needs; no new storage key.
- Will NOT change `validateExchangeRateInput` or `setExchangeRate` (feature 006) — both already
  satisfy this feature's validation (BR-007-08) and replace-not-duplicate (BR-007-06) requirements
  unmodified.

**Assumptions (from spec §1.3, §2.1, §6, §7 — carried forward, cheap to reverse if wrong):**
- Assumed: showing the existing rate when a currency is selected (BR-007-05) is a derived
  requirement, not literal spec text — the only reading that makes "update" meaningfully distinct
  from "add" (spec §6, Challenge 3).
- Assumed: the empty-state copy ("No other currencies recorded yet.") and the trip-currency label
  ("Trip currency: {code}") are SA-authored strings, cheap to change if different wording is wanted
  (spec §7 item 2).
- Assumed: `RateInput`'s `key={currency}`-remount is the correct way to reset its local state on a
  currency change in this repo, verified empirically while drafting this plan (see Task 3) — not a
  `useEffect`, which this repo's ESLint config rejects for this exact pattern.

---

### Task 1: [Domain] — getCurrenciesNeedingRates derives the non-trip currencies in use

**Files**
- modify: `lib/currency.ts`
- create (temporary, deleted within this task): `lib/currency.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/currency.probe.ts` containing exactly:

      ```ts
      import { getCurrenciesNeedingRates } from "@/lib/currency";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/currency.probe.ts(1,10): error TS2305: Module '"@/lib/currency"' has no exported member 'getCurrenciesNeedingRates'.`
      (Verified empirically against this exact repo state before writing this plan.)

- [x] **Step 3 — Implement.** Append to `lib/currency.ts`:

      ```ts
      // Despite the name, this returns every non-trip currency in use, including ones that
      // already have a saved rate — the currency selector needs the full in-use set so an
      // existing rate can still be found and edited (BR-007-05/06), not just currencies that
      // are still missing one. Named for its primary purpose (surfacing what needs attention),
      // not as a promise to exclude already-rated currencies.
      export function getCurrenciesNeedingRates(expenses: Expense[], tripCurrency: string): string[] {
        const currencies = new Set(expenses.map((e) => e.currency));
        currencies.delete(tripCurrency);
        return Array.from(currencies).sort();
      }
      ```

      (`Expense` is already imported at the top of `lib/currency.ts` from `@/lib/types` — no new
      import needed. Mirrors `getExpenseTotalsByCurrency`'s existing dedup approach in the same file
      without duplicating its amount-summing work, which this function doesn't need. The comment
      above was added during plan review — an adversarial reviewer noted the function's name could
      mislead a future maintainer into filtering out already-rated currencies, which would silently
      break the update path.)

- [x] **Step 4 — Delete the probe.** Remove `lib/currency.probe.ts`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as before this task
      (no new route added):
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
      Message: `feat(007): add getCurrenciesNeedingRates to lib/currency`

---

### Task 2: [UI] — ExchangeRateForm scopes currency choices to currencies in use

**Depends on Task 1** (`getCurrenciesNeedingRates`).

**Files**
- modify: `components/ExchangeRateForm.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Implement.** In `components/ExchangeRateForm.tsx`:
      1. Change the import line from
         `import { getSupportedCurrencies } from "@/lib/countries";` to
         `import { getExpenses } from "@/lib/storage";` added alongside the existing
         `getExchangeRates, saveExchangeRates` import from the same module (merge into one import
         line), and change
         `import { validateExchangeRateInput, setExchangeRate } from "@/lib/currency";` to also
         import `getCurrenciesNeedingRates`. Remove the now-unused `getSupportedCurrencies` import
         entirely.
      2. Change the `currencyOptions` line from
         `const currencyOptions = getSupportedCurrencies().filter((c) => c !== trip.currency);` to
         `const currencyOptions = getCurrenciesNeedingRates(getExpenses(), trip.currency);`.
      3. Immediately after the four `useState` declarations (do **not** place this before them —
         see the note below), add:

      ```tsx
      if (currencyOptions.length === 0) {
        return (
          <div className="flex flex-col gap-4 p-4">
            <h2 className="text-xl font-semibold">Exchange rate</h2>
            <p>No other currencies recorded yet.</p>
          </div>
        );
      }
      ```

      **This must go after all four `useState` calls, never before them.** An earlier draft of this
      task placed the early return before the `useState` declarations, which fails
      `npm run lint` with `react-hooks/rules-of-hooks` ("React Hook 'useState' is called
      conditionally... Did you accidentally call a React Hook after an early return?") — verified
      empirically while drafting this plan. Hooks must run unconditionally in the same order every
      render; an early return placed *after* every hook call in the render is fine (nothing after it
      runs conditionally that matters to hook ordering), but *before* any hook call is not.

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output. (Confirms the early-return placement above doesn't trip
      `react-hooks/rules-of-hooks` — verified empirically at this exact placement while drafting
      this plan.)

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with the same seven-route table as Task 1.

- [x] **Step 5 — Commit.**
      `git add components/ExchangeRateForm.tsx && git commit`
      Message: `feat(007): scope exchange-rate currency choices to currencies in use`

---

### Task 3: [UI] — RateInput shows and edits an existing rate per currency

**Depends on Task 2.**

**Files**
- modify: `components/ExchangeRateForm.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Implement.** Replace the entire contents of `components/ExchangeRateForm.tsx` with:

      ```tsx
      "use client";

      import { useState, type FormEvent } from "react";
      import type { Trip } from "@/lib/types";
      import { getExpenses, getExchangeRates, saveExchangeRates } from "@/lib/storage";
      import { validateExchangeRateInput, setExchangeRate, getCurrenciesNeedingRates } from "@/lib/currency";

      function RateInput({ currency, tripCurrency }: { currency: string; tripCurrency: string }) {
        const [rateInput, setRateInput] = useState(() => {
          const existing = getExchangeRates().find((r) => r.currency === currency);
          return existing ? String(existing.rate) : "";
        });
        const [error, setError] = useState<string | null>(null);
        const [saved, setSaved] = useState(false);

        function handleSubmit(e: FormEvent) {
          e.preventDefault();
          const { error: validationError } = validateExchangeRateInput(currency, rateInput, tripCurrency);
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
          setSaved(true);
        }

        return (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="rateValue">
                Rate (1 {currency} = ? {tripCurrency})
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

      export default function ExchangeRateForm({ trip }: { trip: Trip }) {
        const currencyOptions = getCurrenciesNeedingRates(getExpenses(), trip.currency);
        const [currency, setCurrency] = useState(currencyOptions[0] ?? "");

        if (currencyOptions.length === 0) {
          return (
            <div className="flex flex-col gap-4 p-4">
              <h2 className="text-xl font-semibold">Exchange rate</h2>
              <p>No other currencies recorded yet.</p>
            </div>
          );
        }

        return (
          <div className="flex flex-col gap-4 p-4">
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

            <RateInput key={currency} currency={currency} tripCurrency={trip.currency} />
          </div>
        );
      }
      ```

      Design notes (for review): `RateInput`'s `rateInput` state is initialized via a lazy `useState`
      callback that reads `getExchangeRates()` and looks up the entry for `currency` — this callback
      runs exactly once, on mount, per the standard React `useState` lazy-initializer contract.
      `RateInput` is mounted as `<RateInput key={currency} .../>` (in `ExchangeRateForm`'s return);
      changing `currency` (a different `<option>` selected) changes the `key`, which makes React
      unmount the old `RateInput` instance and mount a brand-new one — a fresh mount means the lazy
      initializer runs again, now reading the *new* `currency`'s existing rate (or blank, if none) →
      BR-007-05. This needs no `useEffect` at all, avoiding the
      `react-hooks/set-state-in-effect` failure a naive "sync local state to a changed prop via
      effect" approach would hit in this repo (verified empirically while planning features 005 and
      011 in this same session). `validateExchangeRateInput`/`setExchangeRate` (feature 006,
      unchanged) still do all the validation/replace-not-duplicate work → BR-007-03, 06, 07, 08. A
      `storage-error` result never resets `rateInput`, so the user's entered value remains visible →
      the §1.5 storage-error edge case, AC-007-08.

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output.

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with the same seven-route table as Task 1.

- [ ] **Step 5 — NOT PERFORMED (no browser automation tool available in this environment).**
      Manual check: switching currencies shows the right rate (AC-007-05, 06). With an active trip
      (currency "SGD") and at least two recorded expenses in different non-trip currencies (e.g.
      "JPY" and "USD"), open `http://localhost:3000/settings` via `npm run dev`. Enter a rate for
      "JPY" (e.g. `0.0091`) and save.
      Expected: a "Exchange rate saved." message appears.
      Switch the currency dropdown to "USD".
      Expected: the rate field is blank (no rate saved for USD yet).
      Switch back to "JPY".
      Expected: the rate field shows `0.0091` (the previously-saved value), not blank.
      Change it to `0.0095` and save.
      Expected: the field still shows `0.0095` after saving; in the devtools console,
      `JSON.parse(localStorage.getItem("travel-expense:exchange-rates"))` shows exactly one entry
      for "JPY" with `rate: 0.0095` — not two entries.
      Navigate to the home page (`/`).
      Expected: the "Spending by currency" section's converted total (feature 006,
      `getConvertedTotals`, unchanged by this plan) now uses `0.0095` for the JPY portion of the
      total — confirming BR-007-04/07 (saving/updating a rate here is reflected on the dashboard
      with no additional wiring, since that section already reads `getExchangeRates()` fresh on
      every render).

- [x] **Step 6 — Commit.**
      `git add components/ExchangeRateForm.tsx && git commit`
      Message: `feat(007): show and edit an existing rate per currency`
      (If Step 5 could not be performed because no browser automation tool is available in this
      environment, say so explicitly in the commit body and in `log.txt`, matching the disclosure
      precedent set in features 003, 005, and 011's plans.)

---

### Task 4: [Route] — Settings page displays the trip currency

**Files**
- modify: `app/settings/page.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Implement.** In `app/settings/page.tsx`, change the returned JSX from:

      ```tsx
      return (
        <div>
          <h1 className="text-xl font-semibold p-4">Settings</h1>
          <ExchangeRateForm trip={trip} />
        </div>
      );
      ```

      to:

      ```tsx
      return (
        <div>
          <h1 className="text-xl font-semibold p-4">Settings</h1>
          <p className="px-4 font-mono text-sm text-[var(--muted)]">Trip currency: {trip.currency}</p>
          <ExchangeRateForm trip={trip} />
        </div>
      );
      ```

      **Deviation applied during `/sdd` execution:** Gate B (code-quality review) found that the
      plan's originally-specified `className="px-4"` was a genuine, sourced inconsistency —
      `components/TripEditForm.tsx` renders the identical "Trip currency: ..." label with
      `className="font-mono text-sm text-[var(--muted)]"`, matching `design.md` §3's documented rule
      that currency/numeric values render in `font-mono` and helper/meta text uses
      `text-sm text-[var(--muted)]`. The controller applied the fix directly (a one-line className
      change, re-verified clean) rather than dispatching a full fix-and-re-review subagent cycle for
      something this small.

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output.

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with the same seven-route table as Task 1.

- [ ] **Step 5 — NOT PERFORMED (no browser automation tool available in this environment).**
      Manual check: the trip currency is visible (AC-007-01). Open `http://localhost:3000/settings`
      with an active trip whose currency is, e.g., "SGD".
      Expected: the text "Trip currency: SGD" is visible on the page, above the exchange-rate form.

- [x] **Step 6 — Commit.**
      `git add app/settings/page.tsx && git commit`
      Message: `feat(007): show the trip currency on the settings page`
      (If Step 5 could not be performed because no browser automation tool is available in this
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

    feat(007): scope exchange-rate currency choices to currencies in use

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: doc/spec/007.exchange-rate-management.md

Never commit on a failing lint, typecheck, or build.

## Completion Summary

**Completed:** 2026-09-11
**Tasks:** 4 of 4

**What was built:**
`getCurrenciesNeedingRates` (lib/currency.ts) derives the non-trip currencies actually used in
recorded expenses. `components/ExchangeRateForm.tsx` was restructured around it: the currency
selector is now scoped to that set (with a plain empty-state message when it's empty), and a new
`RateInput` child component — remounted via `key={currency}` whenever the selection changes — shows
an existing saved rate for that currency (or blank, if none), letting a traveller actually see and
edit a previously-entered rate instead of guessing whether one exists. `app/settings/page.tsx` now
displays the trip's own currency for context. Feature 006's `validateExchangeRateInput`/
`setExchangeRate`/`getConvertedTotals` were reused unchanged throughout.

**Deviations from the plan:**
- Task 4: Gate B found the plan's specified `className="px-4"` didn't match the identical
  "Trip currency: ..." label's existing styling in `TripEditForm.tsx` (`font-mono text-sm
  text-[var(--muted)]`, per `design.md`'s documented typography rules). Fixed directly by the
  controller (log.txt, Task 4).
- Task 4's Step 5 (manual browser check) was **NOT PERFORMED** — no browser automation tool is
  available in this environment, matching established precedent from features 003/005/011.
- **A significant, unplanned delay occurred between Task 3 and Task 4**, caused entirely by shared
  working-tree state outside this plan's own scope: this repo's working directory turned out to be
  shared, unisolated, across (at least) four concurrent Claude Code sessions (this one, and peers
  `travel-expense-d3`, `-1b`, `-2c`), each independently running CLAUDE.md's "implement the
  remaining features" loop. An unowned, broken dark-mode/theming refactor
  (`components/DateField.tsx`, `ThemeToggle.tsx`, `lib/theme.ts`, and edits spread across most of
  the UI layer) left `npx tsc --noEmit`/`npm run build` failing repo-wide when Task 4's implementer
  reached its own regression step. The controller declined to commit through that failure (per this
  plan's own "never commit on a failing build" rule, and CLAUDE.md's "never let a failing build
  reach git history"), coordinated with the three peer sessions to identify the owner (none claimed
  it), stopped this session's own further feature work pending user guidance, and held until
  `travel-expense-2c` — authorized directly by its own user, after two rounds of factual corrections
  on this session's part (a misattributed file scope and a false claim about which session owned a
  separate, unrelated `design.md`/`REFERENCE.md` diff) — reversibly set the unowned files aside via
  `git stash push -u` with an explicit pathspec (not a blanket stash), restoring a green build. This
  session independently re-verified the build and its own diff's isolation before resuming, rather
  than trusting the peer's report at face value. Full back-and-forth is preserved in this
  conversation's transcript, not duplicated here.

**Follow-ups not in scope here:**
- **The multi-session coordination problem itself is unresolved** — four sessions running the same
  feature-implementation loop against one shared, unisolated working directory is a structural risk
  (this plan's own delay is direct evidence of it), not something any single feature's plan can fix.
  The user has been asked, via this session, whether they want a "one session per feature, chained"
  model going forward (as another session's user reportedly ruled) and how future concurrent
  sessions should be isolated (separate worktrees, explicit hand-off, etc.) — unresolved as of this
  plan's completion.
- The stashed theming refactor (`git stash list` shows one entry) still needs a real owner to either
  finish or abandon it — this plan did not touch it beyond independently verifying the stash left a
  green build, and takes no position on its eventual fate.
- Feature 008 (optional-trip-budget), next in build order, was deliberately **not started** in this
  session — per the "start a new session per feature" guidance received mid-session.

**Final verification:**
npx tsc --noEmit   exit 0, no output
npm run lint       exit 0, no output
npm run build      exit 0, seven-route table unchanged (/, /_not-found, /categories, /expenses/new,
                    /settings, /trip/edit, /trip/new)
