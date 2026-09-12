# Reset App Data — Implementation Plan

**Status:** Complete
**Source:** `doc/spec/013.reset-app-data.md`
**Goal:** Let a traveller wipe all trip, expense, category, budget, and exchange-rate data from a
confirmation panel on the Settings page, and return to the first-time travel setup screen.

**Architecture:**
Three small pieces, one per layer. `lib/storage.ts` gains `resetAppData()`, removing all four
`STORAGE_KEYS` entries in one call — nothing else in the app needs to change to observe the reset,
since every getter already falls back to `null`/`[]` for a missing key. `components/
ResetAppDataConfirm.tsx` is a new plain (no `'use client'`) warning/confirm panel, structurally
identical to the already-committed `components/NewTripConfirm.tsx`. `app/settings/page.tsx` gets a
small state toggle wiring the two together: a trigger button reveals the confirm panel; confirming
calls `resetAppData()` then navigates home on success or shows an inline error on failure; cancelling
reveals the normal page again with no storage write.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage — no backend, no database. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build`. No test runner is installed (verified: `package.json` has no
`test` script; `node_modules/.bin` contains only `eslint`, `next`, `tsc`).

**Negative constraints (from `doc/spec/013.reset-app-data.md` §1.6, §2.1, §6 Challenge 4):**
- Will NOT add a new route — the reset action lives inside the existing `app/settings/page.tsx`,
  not a new page.
- Will NOT touch, reference, or build upon the unrelated uncommitted dark-mode theming refactor
  currently sitting in the working tree (`lib/theme.ts`, `components/ThemeToggle.tsx`,
  `components/DateField.tsx`, and edits to `globals.css`/`layout.tsx`/several components) — none of
  this plan's tasks touch any of those files or their new tokens/classes.
- Will NOT implement partial reset (e.g. "clear only expenses") or an undo/restore path — this is an
  all-or-nothing, irreversible action once confirmed, matching feature 003's "Create new trip"
  precedent.
- Will NOT re-seed `DEFAULT_CATEGORIES` into storage on reset — default categories are code
  constants, not stored data (`lib/categories.ts:12-23`), and stay available with zero extra logic.
- Will NOT modify `components/ExchangeRateForm.tsx` or its behavior — this plan only adds a new,
  separate action alongside it on the same page.
- Will NOT add a new storage key — `resetAppData()` removes the four keys `lib/storage.ts` already
  defines.

**Assumptions:**
- Assumed: `components/ResetAppDataConfirm.tsx` matches `components/NewTripConfirm.tsx`'s actual
  *committed* styling — `className="text-[var(--danger)]"` on the confirm button, no class on
  cancel — not the `.btn-danger`/`.btn-secondary` classes visible in the current uncommitted working
  tree (verified via `git diff components/NewTripConfirm.tsx`: those classes are introduced by the
  unrelated, not-yet-landed theming refactor, not present at `HEAD`). This repo's own established
  practice across features 005–009 is to build against the committed baseline, not an unlanded,
  unowned refactor sitting in a shared working tree.

---

### Task 1: [Data] — resetAppData clears all trip, expense, category, and exchange-rate data

**Files**
- modify: `lib/storage.ts`
- modify: `REFERENCE.md` (add `resetAppData()` to the `lib/storage.ts` public API list in §6, and
  the `lib/storage.ts` file-tree one-liner in §4)
- create (temporary, deleted within this task): `lib/storage.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/storage.probe.ts` containing exactly:

      ```ts
      import { resetAppData } from "@/lib/storage";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/storage.probe.ts(1,10): error TS2305: Module '"@/lib/storage"' has no exported member 'resetAppData'.`
      (Column 10 via this repo's verified TS2305 formula: `import { <Name> } from ...` always puts
      the named import at column 10, regardless of `<Name>`'s length — confirmed against every prior
      feature's own probe in this codebase.)

- [x] **Step 3 — Implement.** In `lib/storage.ts`, add (uses the file's existing `STORAGE_KEYS`,
      `SaveResult`, `SAVE_ERROR_MESSAGE`, and `isStorageAvailable` — no new imports needed):

      ```ts
      export function resetAppData(): SaveResult {
        if (!isStorageAvailable()) return { ok: false, error: SAVE_ERROR_MESSAGE };
        try {
          // Auxiliary collections first, the trip record last — mirrors
          // submitNewTrip's existing ordering rationale (lib/trip.ts): if a
          // later removeItem in this sequence ever did throw, the trip record
          // itself is the last thing removed, so a reported failure leaves the
          // most-authoritative piece of data still intact rather than already
          // gone.
          window.localStorage.removeItem(STORAGE_KEYS.expenses);
          window.localStorage.removeItem(STORAGE_KEYS.categories);
          window.localStorage.removeItem(STORAGE_KEYS.exchangeRates);
          window.localStorage.removeItem(STORAGE_KEYS.trip);
          return { ok: true };
        } catch {
          return { ok: false, error: SAVE_ERROR_MESSAGE };
        }
      }
      ```

- [x] **Step 4 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 5 — Delete the probe and re-run.** Remove `lib/storage.probe.ts`, then
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Update REFERENCE.md.** Two edits:
      (a) In §6's `lib/storage.ts` public API list (the bullet list starting "`STORAGE_KEYS` —
      ..."), add a bullet: `` `resetAppData(): SaveResult` — removes all four `STORAGE_KEYS` entries;
      after a successful call every getter returns its empty fallback (`null`/`[]`) exactly as it
      does for a never-populated key. `` — placed after the existing `getExchangeRates`/
      `saveExchangeRates` bullet.
      (b) In §4's file-tree entry for `storage.ts` (currently
      `` storage.ts      # localStorage persistence layer (012) — trip/category/expense/exchangeRate accessors ``),
      append `` ; resetAppData() (013) clears all four keys `` before the line ends. Do not touch
      any other REFERENCE.md entry.
      **Note:** `git diff REFERENCE.md` in this working tree may already show an unrelated,
      pre-existing uncommitted change (a `design.md` read-order addition, from separate in-progress
      work this plan's negative constraints say not to touch) — that is expected and not this task's
      concern; only these two new bullets are this task's own edit, and only they should be staged
      for commit (`git add -p` if the diff is entangled, per this repo's established practice for
      exactly this situation — see `doc/spec/009.home-dashboard.log.txt`'s tasks for precedent).

- [x] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same 8-route table feature 009 left it at:
      ```
      Route (app)
      ┌ ○ /
      ├ ○ /_not-found
      ├ ○ /categories
      ├ ƒ /expenses/[id]
      ├ ○ /expenses/new
      ├ ○ /settings
      ├ ○ /trip/edit
      └ ○ /trip/new
      ```

- [x] **Step 8 — Commit.**
      `git add lib/storage.ts REFERENCE.md && git commit`
      Message: `feat(013): add resetAppData to lib/storage`

---

### Task 2: [UI] — ResetAppDataConfirm renders a warning panel with confirm/cancel actions

**Files**
- create: `components/ResetAppDataConfirm.tsx`
- modify: `REFERENCE.md` (add a `components/ResetAppDataConfirm.tsx` entry to the §4 file tree)
- create (temporary, deleted within this task): `components/ResetAppDataConfirm.probe.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

> This task creates the panel as a standalone component, verified only by the compiler/lint/build —
> it is not wired into `app/settings/page.tsx` until Task 3, the same "build the component, wire the
> route next" split already used for `TripEditForm`/`NewTripConfirm`/`CategoryPieChart` in earlier
> features.

- [x] **Step 1 — Write the failing check.** Create `components/ResetAppDataConfirm.probe.tsx`
      containing exactly one line:

      ```tsx
      import ResetAppDataConfirm from "@/components/ResetAppDataConfirm";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `components/ResetAppDataConfirm.probe.tsx(1,33): error TS2307: Cannot find module '@/components/ResetAppDataConfirm' or its corresponding type declarations.`
      (Column 33 via this repo's verified formula: `import <Name> from "<path>";` puts the opening
      quote at column `14 + length(<Name>)`; `"ResetAppDataConfirm"` is 19 characters, so
      `14 + 19 = 33`.)

- [x] **Step 3 — Implement the component.** Create `components/ResetAppDataConfirm.tsx`. No `'use
      client'` directive — this component has no hooks or event handlers, matching
      `components/NewTripConfirm.tsx`'s precedent of a plain component when nothing client-only is
      needed. Structurally identical to that component (same props shape, same layout), styled to
      match its actual *committed* classes, not the working-tree-only `.btn-*` ones (see this plan's
      header Assumption):

      ```tsx
      export default function ResetAppDataConfirm({
        onConfirm,
        onCancel,
      }: {
        onConfirm: () => void;
        onCancel: () => void;
      }) {
        return (
          <div className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">Reset app data?</h1>
            <p role="alert">
              Resetting deletes your trip, expenses, categories, and exchange
              rates. This cannot be undone.
            </p>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={onConfirm} className="text-[var(--danger)]">
                Delete all app data
              </button>
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </div>
        );
      }
      ```

- [x] **Step 4 — Delete the probe.** Remove `components/ResetAppDataConfirm.probe.tsx`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Update REFERENCE.md.** Add a `components/ResetAppDataConfirm.tsx` entry to
      REFERENCE.md §4's file tree, in the same style as the other `components/` entries (e.g.
      `components/NewTripConfirm.tsx`'s line), noting it takes `onConfirm`/`onCancel` props and
      renders a warning naming what will be deleted, and that it is not yet mounted anywhere.
      **Note:** as in Task 1 Step 6, `git diff REFERENCE.md` may already show an unrelated,
      pre-existing uncommitted change from separate in-progress work — not this task's concern; only
      this one new entry is this task's own edit to stage.

- [x] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same route table as Task 1 (this component
      is not yet mounted in any route).

- [x] **Step 8 — Commit.**
      `git add components/ResetAppDataConfirm.tsx REFERENCE.md && git commit`
      Message: `feat(013): add ResetAppDataConfirm warning panel`

---

### Task 3: [Route] — app/settings/page.tsx wires the reset action end to end

**Files**
- modify: `app/settings/page.tsx`
- modify: `REFERENCE.md` (rewrite the `app/settings/page.tsx` §4 file-tree entry to describe the
  added reset flow)
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Wire the reset flow into the page.** Read the current file first (verified clean
      against `HEAD` — no pre-existing uncommitted diff on this specific file, unlike several other
      components in this working tree; keep the existing trip store and redirect logic verbatim,
      only add the two new pieces of state, the trigger button, and the confirm-panel branch).
      Replace the whole file with:

      ```tsx
      "use client";

      import { useEffect, useState, useSyncExternalStore } from "react";
      import { useRouter } from "next/navigation";
      import type { Trip } from "@/lib/types";
      import { getTrip, resetAppData } from "@/lib/storage";
      import ExchangeRateForm from "@/components/ExchangeRateForm";
      import ResetAppDataConfirm from "@/components/ResetAppDataConfirm";

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
        const [confirmingReset, setConfirmingReset] = useState(false);
        const [resetError, setResetError] = useState<string | null>(null);

        useEffect(() => {
          if (trip === null) {
            router.replace("/");
          }
        }, [trip, router]);

        if (trip === undefined || trip === null) {
          return null;
        }

        if (confirmingReset) {
          return (
            <div className="flex flex-col gap-4">
              <ResetAppDataConfirm
                onConfirm={() => {
                  const result = resetAppData();
                  if (result.ok) {
                    router.push("/");
                    return;
                  }
                  setResetError(result.error);
                }}
                onCancel={() => {
                  setConfirmingReset(false);
                  setResetError(null);
                }}
              />
              {resetError && <p role="alert" className="px-4">{resetError}</p>}
            </div>
          );
        }

        return (
          <div>
            <h1 className="text-xl font-semibold p-4">Settings</h1>
            <p className="px-4 font-mono text-sm text-[var(--muted)]">Trip currency: {trip.currency}</p>
            <ExchangeRateForm trip={trip} />
            <div className="p-4">
              <button type="button" onClick={() => setConfirmingReset(true)}>
                Reset app data
              </button>
            </div>
          </div>
        );
      }
      ```

      (This keeps the existing `createTripStore`/redirect/`undefined`-or-`null` gating verbatim, and
      adds only: the `resetAppData` import, `ResetAppDataConfirm` import, two new `useState`s, the
      `confirmingReset` branch, and the trigger button below `ExchangeRateForm`.)

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output.

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with the same route table as Task 1 (no new route — `/settings`
      already exists).

- [x] **Step 5 — Manual check: the reset flow end to end.** No browser-automation tool may be
      available in this environment — if so, state that plainly instead of asserting these passed;
      do your best effort with whatever tooling exists.

      **5a. Trigger and warning, no premature deletion (AC-013-01, AC-013-02).** With an active
      trip, at least one saved expense, at least one custom category, and at least one saved
      exchange rate, open `http://localhost:3000/settings`.
      Expected: a "Reset app data" button is visible below the exchange-rate form. Clicking it shows
      a warning naming trip/expenses/categories/exchange rates and that the action cannot be undone,
      with "Delete all app data" and "Cancel" actions. Before clicking either, inspect
      localStorage (devtools Application tab): all four `travel-expense:*` keys are still present,
      unchanged.

      **5b. Confirm deletes everything and returns to setup (AC-013-03, AC-013-04, AC-013-07).**
      From the warning shown in 5a, click "Delete all app data".
      Expected: the URL becomes `/`; the first-time travel setup form is shown (not the dashboard);
      inspecting localStorage shows none of the four `travel-expense:*` keys present. Then complete
      setup for a new trip and open the category selector on the record-expense page: the six
      default categories (Food, Transport, Accommodation, Shopping, Activities, Others) are present,
      and no custom category from before the reset appears.

      **5c. Cancel leaves everything unchanged, and can be reopened freely (AC-013-05, and the
      `[derived]` "reopen after cancel" edge case in `doc/spec/013.reset-app-data.md` §1.5).**
      Repeat the setup from 5a (a trip with an expense, a custom category, and a saved exchange
      rate). Open the warning, then click "Cancel".
      Expected: the normal Settings page reappears (exchange-rate form and "Reset app data" button
      visible again); localStorage still holds all four `travel-expense:*` keys with their original
      values; the previously-saved exchange rate is still shown in the exchange-rate form. Then open
      the warning a second time and cancel again.
      Expected: the same behavior repeats identically — no error, no stuck state, no storage change
      — confirming cancel has no side effect regardless of how many times it's repeated.

      **5d. Resetting when categories and exchange rates are already empty (the `[in spec, implied]`
      edge case in `doc/spec/013.reset-app-data.md` §1.5).** Start a fresh trip with no custom
      categories added and no exchange rates saved (an expense in the trip's own currency is enough
      to satisfy the Gherkin's "trip or expense data" precondition). Open Settings and confirm the
      reset.
      Expected: the reset succeeds exactly as in 5b — URL becomes `/`, first-time setup form is
      shown, no `travel-expense:*` keys remain — with no error and no different behavior just
      because two of the four data types had nothing to clear.

      **5e. Storage failure shows an error, not a false success (AC-013-06).** If this environment
      offers a way to simulate a storage failure (e.g. disabling `localStorage` via browser devtools
      before confirming), open the warning and confirm.
      Expected: a `role="alert"` error message appears; the app stays on the warning view; the URL
      does not become `/`. If no reliable simulation is available in this environment, state that
      plainly and note that both `/sdd` review gates should trace this path by reading the code
      instead (`resetAppData()`'s `isStorageAvailable()`/try-catch guard, and this task's
      `result.ok` branch in the confirm handler).

- [x] **Step 6 — Update REFERENCE.md.** Rewrite the `app/settings/page.tsx` §4 file-tree entry
      (currently describing only the exchange-rate mount) to also mention the reset flow: the
      `confirmingReset` toggle, `ResetAppDataConfirm` mount, `resetAppData()` call on confirm
      (navigating home on success, showing a `role="alert"` error on failure), and that cancel does
      no storage write.
      `git diff REFERENCE.md`
      Expected: the diff includes a change to the `app/settings/page.tsx` entry, and no line this
      task itself didn't intend to touch. **Note:** this working tree may already carry an unrelated,
      pre-existing uncommitted change to REFERENCE.md (a `design.md` read-order addition, from
      separate in-progress work this plan's negative constraints say not to touch) — if so, that
      diff will also appear here and is not a mismatch; only this task's own `app/settings/page.tsx`
      hunk is what to verify and stage (`git add -p` if entangled).

- [x] **Step 7 — Commit.**
      `git add app/settings/page.tsx REFERENCE.md && git commit`
      Message: `feat(013): wire the reset app data flow into Settings`

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
- `lib/storage.ts`: `resetAppData()`, removing all four `STORAGE_KEYS` entries (expenses,
  categories, exchangeRates, then trip last), guarded the same way every other storage write in
  this file is. Commit `c908ad0`.
- `components/ResetAppDataConfirm.tsx`: a plain warning/confirm panel mirroring
  `NewTripConfirm.tsx`'s committed shape and styling. Commit `d177d05`.
- `app/settings/page.tsx`: a "Reset app data" trigger button, a `confirmingReset` toggle, and
  confirm/cancel handlers wiring `resetAppData()` to navigation or an inline error. Commit `087f879`.

**Deviations from the plan:**
- The draft plan's route-table code block had a stale marker (missing the `ƒ` dynamic-route symbol
  for `/expenses/[id]`) and Task 3's Step 1 wrongly claimed `app/settings/page.tsx` carried an
  unrelated pre-existing uncommitted diff — both caught by Pass B's adversarial review and fixed
  before execution began; see the plan's own diff history for the corrected text.
- `resetAppData()`'s deletion order (auxiliary collections first, trip record last) was added during
  Pass B's review, not present in the original draft — it mirrors `lib/trip.ts`'s `submitNewTrip`
  ordering rationale.
- Two edge-case manual checks (5c's "reopen after cancel," and 5d, "resetting when some data types
  are already empty") were added by Pass A.5's independent coverage check; the original draft only
  covered the three literal Gherkin scenarios and the storage-failure case.
- Every task's REFERENCE.md diff was entangled with an unrelated, pre-existing uncommitted
  `design.md` read-order addition from separate in-progress work elsewhere in the shared working
  tree. Every commit isolated only this plan's own hunks via `git add -p`, verified line-by-line
  before staging.

**Follow-ups not in scope:**
- **RESIDUAL GAP**: no browser-automation tool exists in this environment, so Task 3's Step 5 manual
  checks (5a–5e — trigger/warning, confirm-deletes-everything-and-returns-to-setup,
  cancel-is-repeatable-with-no-side-effect, resetting-with-some-types-already-empty, and a simulated
  storage failure) could not be executed. Both review gates traced every scenario against the real
  code by hand as the deepest available substitute, and a partial curl-based check confirmed the
  route resolves without crashing, but a human should exercise all of AC-013-01 through AC-013-07 in
  an actual browser before treating feature 013 as fully verified end-to-end.
- Pass B also noted (not acted on, correctly out of scope): no feature in this app reacts to storage
  changes made in another browser tab — a pre-existing, app-wide gap, not something this feature
  introduced or is responsible for fixing.

**Final verification (all three tasks, cumulative):**
- `npx tsc --noEmit`: exit 0, no output.
- `npm run lint`: exit 0, no output.
- `npm run build`: exit 0, unchanged 8-route table (`/`, `/_not-found`, `/categories`,
  `/expenses/[id]` marked `ƒ`, `/expenses/new`, `/settings`, `/trip/edit`, `/trip/new`).
- All 6 review-gate passes across 3 tasks returned PASS on the first attempt.
