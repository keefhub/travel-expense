# Optional Trip Budget — Implementation Plan

**Status:** Complete
**Source:** `doc/spec/008.optional-trip-budget.md`
**Goal:** Show a traveller's trip budget and remaining amount on the home screen, computed only when
every currency used in recorded expenses has a saved exchange rate.

**Architecture:**
`lib/currency.ts` gains one small pure function, `getRemainingBudget`, taking the trip's budget and
the `ConvertedTotalsResult` `app/page.tsx` already computes for feature 006's currency-totals
section — returning the remaining amount when the conversion is complete, or `null` when it isn't.
`app/page.tsx` gains one more incremental section (following the same pattern feature 006 already
established there): a budget line, shown whenever `trip.budget` is set, plus either a remaining
figure (danger-styled when negative) or a "can't be calculated yet" note. No new files, no new
routes, no storage writes — budget entry/edit already exists from features 001/002 and is unchanged.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage — no backend, no database. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build`. No test runner is installed (verified: `package.json` has no
`test` script; `node_modules/.bin` contains only `eslint`, `next`, `tsc`).

**Negative constraints (from `doc/spec/008.optional-trip-budget.md` §1.6, §2.5):**
- Will NOT change budget entry, editing, or validation — `lib/trip.ts`, `components/TripSetupForm.tsx`,
  and `components/TripEditForm.tsx` are not touched by this plan; feature 001/002 already implement
  BR-008-01/02/03 (verified by the spec's BA against the current code before this plan was written).
- Will NOT touch exchange-rate entry/editing (feature 007) or expense recording (feature 005) — this
  plan only reads their already-persisted output (`getExpenses`, `getExchangeRates`).
- Will NOT build feature 009's full dashboard layout (trip card, pie chart, last-5-transactions) —
  only extends the existing placeholder section in `app/page.tsx`, the same way feature 006 already
  did for currency totals.
- Will NOT perform a full sweep of every stale "in progress" tag in `REFERENCE.md` left over from the
  recent multi-session coincidence on this repo (see spec §7) — each task below refreshes only the
  entry for the file it actually touches.

**Assumptions:**
- Assumed: a negative remaining budget is displayed, not clamped to zero or hidden, styled with the
  `--danger` token per `design.md` §2's existing "over-budget" reservation for that token.
- Assumed: the budget section renders whenever `trip.budget` is set, independent of whether any
  expenses have been recorded yet — unlike the currency-totals section, which is gated on
  `currencyTotals.length > 0`.

**Known pre-existing limitation (not in scope to fix here):** `app/globals.css` at `HEAD` only
declares `--background`/`--foreground` — `--danger` (and most of `design.md`'s documented palette)
is not actually defined yet. `text-(--danger)` in Task 2 will compile and lint cleanly but may not
visually render red until that token exists. This is a pre-existing gap already present in shipped
code (`components/NewTripConfirm.tsx`, `components/ExchangeRateForm.tsx` reference the same
undefined tokens), not something this feature introduces — likely what the now-stashed multi-session
theming refactor would have fixed. Using the established `text-(--token)` convention here keeps this
feature consistent with the rest of the codebase rather than inventing a one-off workaround; fixing
the token system itself is out of scope for feature 008.

---

### Task 1: [Domain] — getRemainingBudget returns budget minus converted total, or null when incomplete ✅ (203b157)

**Files**
- modify: `lib/currency.ts`
- modify: `REFERENCE.md` (refresh the `lib/currency.ts` file-tree entry to mention
  `getRemainingBudget`, and drop that entry's stale "in progress" tag if it still carries one from
  feature 006/007 — scoped to this one entry, not a wider sweep, per spec §7)
- create (temporary, deleted within this task): `lib/currency.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/currency.probe.ts` containing exactly:

      ```ts
      import { getRemainingBudget } from "@/lib/currency";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/currency.probe.ts(1,10): error TS2305: Module '"@/lib/currency"' has no exported member 'getRemainingBudget'.`
      (Verified empirically against this exact repo state before writing this plan — plain `TS2305`,
      no "did you mean" suggestion.)

- [x] **Step 3 — Implement.** In `lib/currency.ts`, add (after `getConvertedTotals`, before
      `getCurrenciesNeedingRates`, or anywhere else in the file — placement doesn't matter, only that
      it's exported):

      ```ts
      export function getRemainingBudget(
        budget: number,
        convertedTotals: ConvertedTotalsResult
      ): number | null {
        return convertedTotals.isComplete ? budget - convertedTotals.convertedTotal : null;
      }
      ```

- [x] **Step 4 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 5 — Delete the probe.** Remove `lib/currency.probe.ts`.

- [x] **Step 6 — Re-run after deletion.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the route table unchanged from the end of
      feature 007:
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
      `git add lib/currency.ts && git commit`
      Message: `feat(008): add getRemainingBudget to lib/currency`

---

### Task 2: [Route] — app/page.tsx shows budget and remaining budget when a budget is set ✅ (50da475)

**Files**
- modify: `app/page.tsx`
- modify: `REFERENCE.md` (refresh the `app/page.tsx` file-tree entry to describe the new budget
  section, and drop any stale "in progress" tag on that entry left over from feature 005/006 — scoped
  to this one entry, per spec §7)
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Add the budget section.** In `app/page.tsx`:
      1. Add `getRemainingBudget` to the existing import line from `@/lib/currency`:
         ```tsx
         import { getExpenseTotalsByCurrency, getConvertedTotals, getRemainingBudget } from "@/lib/currency";
         ```
      2. Right after the existing `convertedTotals` computation, add:
         ```tsx
         const remainingBudget =
           trip.budget !== undefined ? getRemainingBudget(trip.budget, convertedTotals) : null;
         ```
      3. In the JSX, right after the existing `<Link href="/trip/edit">Edit trip</Link>` line and
         before the `{currencyTotals.length > 0 && (...)}` block, add:
         ```tsx
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
         ```
         (`remainingBudget !== null`, not a truthiness check — a remaining budget of exactly `0` must
         still render the "Remaining: ... 0.00" branch, not fall through to the incomplete-note
         branch. This is the exact bug the spec's contrarian review (§6, Challenge 2) flagged.)

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output.

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with the same seven-route table as Task 1 (no new route added by this
      task).

- [ ] **Step 5 — NOT PERFORMED (no browser automation tool available in this environment).**
      Manual check: re-verify already-implemented budget entry/edit, then the full
      budget-display matrix. No browser-automation tool may be available in this environment — if
      so, state that plainly instead of asserting these passed; do your best effort with whatever
      tooling exists (`npm run dev` + `curl` at minimum confirms the route still serves without a
      server error). This step covers AC-008-01 through AC-008-09 in one continuous session (each
      sub-check builds on the previous one's saved state).

      **5a. Re-verify budget entry, skip, and edit still work (AC-008-01, AC-008-02, AC-008-03).**
      These are already implemented by features 001/002 (`lib/trip.ts`'s `validateTripForm`/
      `submitTripSetup`, unchanged by this plan) — this sub-check confirms they still hold, it is not
      new work. Complete trip setup leaving the budget field blank.
      Expected: the trip is created successfully; devtools
      `JSON.parse(localStorage.getItem("travel-expense:trip"))` shows no `budget` key at all
      (AC-008-02). Then go to `/trip/edit`, enter a budget of `500`, save.
      Expected: the same devtools check now shows `budget: 500` (AC-008-01/03 — trip setup and trip
      edit share the identical `submitTripSetup`/`TripFormValues` path per the spec's module map, so
      exercising the shared function via edit re-verifies both).

      **5b. No budget shows no budget section (AC-008-04).** Before doing 5a, or by clearing the
      budget again via `/trip/edit` first: with no budget set, open `http://localhost:3000/`.
      Expected: no "Budget" heading, no "Budget:"/"Remaining:" text, and no incomplete-calculation
      note anywhere on the page. (Do this check first, then proceed to 5a/5c with a budget set — note
      the ordering flexibility here since both 5a and 5b need a "no budget" starting state.)

      **5c. Budget with zero expenses shows the full amount remaining (AC-008-09).** With the budget
      of `500` from 5a saved and no expenses recorded yet, open `/`.
      Expected: "Budget: <CODE> 500.00" is shown, and "Remaining: <CODE> 500.00" is shown (not the
      incomplete-calculation note — zero expenses means the conversion is trivially complete). This
      also covers AC-008-05's general "shows when every currency is rated" case, trivially, since
      there is nothing to convert yet.

      **5d. An exact-zero remaining budget is shown, not hidden (AC-008-07).** Record an expense in
      the trip's own currency for exactly `500` (via `/expenses/new`; any category/date/payment
      method/location). Reopen `/`.
      Expected: "Remaining: <CODE> 0.00" is shown — not blank, not the incomplete-calculation note,
      not omitted. This is the exact boundary the spec's contrarian review (§6, Challenge 2) flagged:
      a `!==null` check (not truthiness) is required for this to render correctly.

      **5e. Negative remaining budget is shown and danger-styled (AC-008-06).** Record another
      expense in the trip currency for `100` (total spend now 600 against the 500 budget). Reopen
      `/`.
      Expected: "Remaining: <CODE> -100.00" is shown, and the text is rendered in the danger color
      (inspect via devtools: the element's computed `color` matches `--danger`'s value, or simply
      confirm the `text-(--danger)` class is present on that element).

      **5f. A missing exchange rate shows the incomplete note, not a numeric remaining figure
      (AC-008-08).** Record one more expense, this time in a currency that is NOT the trip's currency
      and has no saved exchange rate (e.g. via `/expenses/new`, pick a different currency from the
      dropdown). Do not add a rate for it in `/settings`. Reopen `/`.
      Expected: the "Budget: ..." line still shows; the existing "Spending by currency" list still
      shows every currency including the unrated one; the role="status" text
      "Remaining budget cannot be fully calculated yet." is shown; no "Remaining: ..." numeric line
      is shown anywhere on the page.

- [x] **Step 6 — Commit.**
      `git add app/page.tsx && git commit`
      Message: `feat(008): show trip budget and remaining budget on the home screen`
      (Committed with Step 5's manual browser checks NOT performed — no browser automation tool
      available in this environment. Both review gates independently traced every AC by reading the
      real code (including the exact-zero `!== null` boundary and the empty-expenses trivial-complete
      case) as the deepest available substitute; not a replacement for a human running through the
      app. See log.txt, Task 2.)

---

## Completion Summary

**Completed:** 2026-09-11
**Tasks:** 2 of 2

**What was built:**
`getRemainingBudget` in `lib/currency.ts` (returns the amount left after spending when every used
currency has an exchange rate, or `null` when it can't be computed) and a "Budget" section on
`app/page.tsx`'s home placeholder, shown whenever `trip.budget` is set: the budget amount, plus
either the remaining amount (danger-styled when negative, correctly showing an exact `0.00` rather
than hiding it) or a note that it can't be fully calculated yet. Budget entry/edit itself needed no
changes — it already existed from features 001/002 and was only re-verified, not rebuilt.

**Deviations from the plan:**
- Task 1: the implementer's probe step reported `tsc` exit code `1` instead of the expected `2`,
  though the error text matched exactly; the controller independently reproduced the same error
  class and confirmed `2` is correct — an artifact of the implementer's own shell, not a real
  discrepancy (log.txt, Task 1).
- Task 2: Gate B raised one non-blocking observation — no `--success` styling for a non-negative
  remaining budget, per `design.md`'s documented pairing with `--danger`. Left as-is since it goes
  beyond what `doc/spec/008.optional-trip-budget.md`'s own contrarian review actually gated
  (log.txt, Task 2).
- Both tasks: no browser-automation tool exists in this environment, so every manual browser check
  in both tasks' Step 5 was marked "NOT PERFORMED" rather than falsely ticked. Both review gates
  independently traced every acceptance criterion by hand against the real committed code as the
  deepest available substitute — not an executed test.
- **Mid-plan incident, unrelated to this feature's own scope:** between Task 1 and Task 2, the
  controller discovered an unrelated, previously-stashed dark-mode theming refactor had partially
  reappeared in the shared working tree in a broken state, as a side effect of a live human editing
  session that had since stopped. Per the repo user's explicit instruction, the controller restored
  the complete stashed snapshot (`git stash apply`), fixed the one root-cause bug that had originally
  broken it (a missing `import DateField` in `components/TripEditForm.tsx`), verified the full build
  green, and dropped the stash. That restored-and-fixed refactor remains **uncommitted** — fixing the
  break was necessary to unblock this plan's own work on a clean foundation; committing someone
  else's unrelated feature is not this plan's job. See log.txt (Task 1's header note, and Task 2's
  "MID-TASK INCIDENT" entry) for the full account.

**Follow-ups not in scope here:**
- Whether the remaining-budget display should also apply `--success` styling for non-negative values
  — flagged for feature 009's fuller dashboard to reconsider (design.md documents the token pairing;
  this feature's own spec never asked for the positive half of it).
- **A human should run both tasks' Step 5 manual browser checks** before treating feature 008 as
  fully verified end-to-end.
- The restored dark-mode theming refactor sitting uncommitted in the working tree (7 modified + 3
  new files) — it now builds cleanly, but committing it, finishing it further, or discarding it is a
  decision for whoever owns that work, not this plan.

**Final verification:**
npx tsc --noEmit   exit 0, no output
npm run lint       exit 0, no output
npm run build      exit 0, seven-route table (/, /_not-found, /categories, /expenses/new, /settings,
                    /trip/edit, /trip/new)

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
