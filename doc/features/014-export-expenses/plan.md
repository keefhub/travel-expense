# Export Expenses — Implementation Plan

**Status:** Complete
**Source:** `doc/spec/014.export-expenses.md`
**Goal:** Let a traveller export every recorded expense as a downloaded CSV file from the Settings
page, or see a message that there's nothing to export when no expenses are recorded.

**Architecture:**
Two small pieces. `lib/export.ts` gains a pure `formatExpensesAsCsv(expenses)` function that builds
a complete CSV string (header row + one RFC-4180-escaped row per expense) — no DOM, no storage, no
clock. `app/settings/page.tsx` (already the home for this app's other data-management actions —
exchange rates, and feature 013's reset) gets a new "Export expenses" button: on click it reads
`getExpenses()`; if empty, shows a `role="status"` message; otherwise it builds the CSV and triggers
a standard browser file download via `Blob` + a temporary `<a download>` element.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage — no backend, no database. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build`. No test runner is installed (verified: `package.json` has no
`test` script; `node_modules/.bin` contains only `eslint`, `next`, `tsc`).

**Negative constraints (from `doc/spec/014.export-expenses.md` §1.6, §2.5, §6 Challenge 3):**
- Will NOT add import — export-only, per OVERVIEW's confirmed "Import is not supported."
- Will NOT filter, sort, date-range-limit, or let the user choose which fields to export — every
  field of every recorded expense, always, in the order the Gherkin states.
- Will NOT support any export format other than CSV.
- Will NOT add a UTF-8 byte-order mark or any other spreadsheet-application-specific compatibility
  shim — not requested by any scenario (see the spec's Contrarian Challenge 3).
- Will NOT change how a trip, expense, exchange rate, or budget is entered, validated, or displayed
  — this feature only reads what features 005/006 already write.
- Will NOT touch, reference, or build upon the unrelated uncommitted dark-mode theming refactor
  currently sitting in the working tree — none of this plan's tasks touch any of those files or
  their new tokens/classes.
- Will NOT modify `components/ExchangeRateForm.tsx`, `components/ResetAppDataConfirm.tsx`, or
  feature 013's reset flow/state — Task 2 only adds a new sibling block to `app/settings/page.tsx`,
  leaving the existing reset button's markup and handlers byte-for-byte unchanged.

**Assumptions:**
- Assumed: the exported filename is the fixed string `expenses.csv` — not requested by either
  scenario, and simpler than deriving a name from the trip (which would need its own rule for
  filesystem-unsafe characters in a country name or date).
- Assumed: the "Export expenses" trigger lives on `app/settings/page.tsx`, alongside the exchange
  rate form and feature 013's reset button — not sourced from the Gherkin (which doesn't specify
  where the action lives), but consistent with this app's own precedent of grouping data-management
  actions there.

---

### Task 1: [Domain] — formatExpensesAsCsv builds a CSV string with header and escaped rows

**Files**
- create: `lib/export.ts`
- modify: `REFERENCE.md` (add a `lib/export.ts` entry to the §4 file tree)
- create (temporary, deleted within this task): `lib/export.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/export.probe.ts` containing exactly:

      ```ts
      import { formatExpensesAsCsv } from "@/lib/export";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/export.probe.ts(1,37): error TS2307: Cannot find module '@/lib/export' or its corresponding type declarations.`
      (Unlike feature 009's Task 1/2, this file does not exist yet at all — so the failure is
      `TS2307` (module not found), not `TS2305` (module exists, export missing). Column 37 computed
      directly: `import { formatExpensesAsCsv } from "` is 36 characters, so the opening quote sits
      at column 37.)

- [x] **Step 3 — Implement.** Create `lib/export.ts`:

      ```ts
      import type { Expense } from "@/lib/types";

      function escapeCsvField(value: string): string {
        if (/[",\r\n]/.test(value)) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }

      export function formatExpensesAsCsv(expenses: Expense[]): string {
        const header = "Date,Category,Currency,Amount,Payment Method,Location,Description";
        const rows = expenses.map((expense) =>
          [
            expense.date,
            expense.category,
            expense.currency,
            expense.amount.toFixed(2),
            expense.paymentMethod,
            expense.location,
            expense.description ?? "",
          ]
            .map(escapeCsvField)
            .join(",")
        );
        return [header, ...rows].join("\r\n");
      }
      ```

- [x] **Step 4 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 5 — Delete the probe and re-run.** Remove `lib/export.probe.ts`, then
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Update REFERENCE.md.** Add a `lib/export.ts` entry to REFERENCE.md §4's file tree,
      in the same dense one-line style as `lib/currency.ts`/`lib/expenses.ts`'s entries, describing
      `formatExpensesAsCsv(expenses)`: builds a CSV string (header row plus one row per expense, in
      `Date,Category,Currency,Amount,Payment Method,Location,Description` order, amount formatted to
      two decimal places, description blank when absent), with fields individually escaped
      (RFC 4180: quoted and internal quotes doubled) whenever they contain a comma, quote, or
      newline; not yet wired to any route.
      `git diff REFERENCE.md`
      Expected: the diff includes a new `lib/export.ts` line in §4's file tree, and no line this
      task itself didn't intend to touch.
      **Note:** this working tree may already carry an unrelated, pre-existing uncommitted change to
      REFERENCE.md (a `design.md` read-order addition, from separate in-progress work this plan's
      negative constraints say not to touch) — if so, that diff will also appear in `git diff
      REFERENCE.md` and is not a mismatch; only this task's own new `lib/export.ts` line is what to
      verify and stage (`git add -p` if entangled).

- [x] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same 8-route table feature 013 left it at:
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
      `git add lib/export.ts REFERENCE.md && git commit`
      Message: `feat(014): add formatExpensesAsCsv to lib/export`

---

### Task 2: [Route] — app/settings/page.tsx wires the export action end to end

**Files**
- modify: `app/settings/page.tsx`
- modify: `REFERENCE.md` (rewrite the `app/settings/page.tsx` §4 file-tree entry to describe the
  added export flow)
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Wire the export flow into the page.** Read the current file first (it already
      hosts `ExchangeRateForm` and feature 013's `confirmingReset` toggle — keep every existing
      line, including the reset button's own wrapping `<div className="p-4">`, byte-for-byte
      unchanged; only add the two new imports, one new `useState`, a new `downloadExpensesCsv`
      helper function, and one new sibling `<div>` above the reset button's). Replace the whole file
      with:

      ```tsx
      "use client";

      import { useEffect, useState, useSyncExternalStore } from "react";
      import { useRouter } from "next/navigation";
      import type { Trip } from "@/lib/types";
      import { getTrip, getExpenses, resetAppData } from "@/lib/storage";
      import { formatExpensesAsCsv } from "@/lib/export";
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

      function downloadExpensesCsv(): void {
        const csv = formatExpensesAsCsv(getExpenses());
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "expenses.csv";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      }

      export default function SettingsPage() {
        const router = useRouter();
        const [store] = useState(createTripStore);
        const trip = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
        const [confirmingReset, setConfirmingReset] = useState(false);
        const [resetError, setResetError] = useState<string | null>(null);
        const [exportMessage, setExportMessage] = useState<string | null>(null);

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
            <div className="p-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const expenses = getExpenses();
                  if (expenses.length === 0) {
                    setExportMessage("You have no expenses to export.");
                    return;
                  }
                  setExportMessage(null);
                  downloadExpensesCsv();
                }}
              >
                Export expenses
              </button>
              {exportMessage && <p role="status">{exportMessage}</p>}
            </div>
            <div className="p-4">
              <button type="button" onClick={() => setConfirmingReset(true)}>
                Reset app data
              </button>
            </div>
          </div>
        );
      }
      ```

      (This keeps `createTripStore`, the redirect `useEffect`, the `undefined`-or-`null` gating, the
      entire `confirmingReset` branch, and the reset button's own `<div className="p-4">` verbatim.
      The only additions are: the `getExpenses`/`formatExpensesAsCsv` imports, the
      `downloadExpensesCsv` helper, the `exportMessage` state, and the new
      `<div className="p-4 flex flex-col gap-2">` block placed above the reset button's div.)

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

- [x] **Step 5 — Manual check: the export flow end to end.** No browser-automation tool may be
      available in this environment — if so, state that plainly instead of asserting these passed;
      do your best effort with whatever tooling exists.

      **5a. Export with no recorded expenses (AC-014-03).** With an active trip and zero expenses
      recorded, open `http://localhost:3000/settings` and click "Export expenses".
      Expected: the text "You have no expenses to export." appears below the button (`role="status"`);
      no file download is triggered (check devtools' download indicator/Network tab shows no new
      blob request).

      **5b. Export with recorded expenses downloads a CSV (AC-014-01, AC-014-02).** Record at least
      two expenses with different categories/currencies, at least one with a description and at
      least one without. Open Settings and click "Export expenses".
      Expected: a file named `expenses.csv` downloads; opening it shows a header row reading
      `Date,Category,Currency,Amount,Payment Method,Location,Description` followed by exactly one
      row per recorded expense, each field in that column order, amounts shown with two decimal
      places, and the expense with no description shows an empty final field (not the text
      "undefined").

      **5c. A comma or quote in a free-text field survives the round trip (AC-014-05).** Record two
      expenses: one whose location contains a comma (e.g. `Paris, France`), one whose location
      contains a double quote (e.g. `The "Grand" Cafe`). Export, then open the CSV in a spreadsheet
      application (or re-parse it by eye against RFC 4180 quoting rules).
      Expected: each field reads back as exactly the original text — the comma does not split it
      into two columns, and the quote is not left unescaped in a way that breaks the row.

      **5c′. Embedded-newline escaping (AC-014-05's third case) — code-review check, not a UI check.**
      `components/ExpenseForm.tsx`'s `description` field is a plain `<input type="text">`, which
      cannot itself contain a newline character (confirmed: no `<textarea>` exists anywhere in this
      app), so this case cannot be exercised by typing into the current UI. Verify it instead by
      reading `lib/export.ts`'s `escapeCsvField`: confirm its regex `/[",\r\n]/` and quote-doubling
      logic apply identically to `\n`/`\r` as to `,`/`"` — i.e. the same escaping guarantee holds for
      a hypothetical multi-line value even though no control in this app currently lets a traveller
      type one.
      Expected: reading the function confirms `\n`/`\r` trigger the same quoting branch as `,`/`"`;
      no separate code path is needed or missing for this case.

      **5d. Export is unaffected by feature 013's reset flow (regression check).** From the normal
      Settings page, click "Reset app data" to open the confirm panel, then click "Cancel".
      Expected: the page returns to normal with "Export expenses" and its button still present and
      working exactly as in 5a/5b — confirming this task's addition didn't disturb feature 013's
      existing toggle.

- [x] **Step 6 — Update REFERENCE.md.** Rewrite the `app/settings/page.tsx` §4 file-tree entry
      (currently ending at feature 013's reset-flow description) to also mention the export flow: the
      "Export expenses" button, the `exportMessage` state and its `role="status"` rendering, and that
      a non-empty expense list triggers a `Blob`-based file download named `expenses.csv` via
      `lib/export.ts`'s `formatExpensesAsCsv`.
      `git diff REFERENCE.md`
      Expected: the diff includes a change to the `app/settings/page.tsx` entry, and no line this
      task itself didn't intend to touch. **Note:** this working tree may already carry an unrelated,
      pre-existing uncommitted change to REFERENCE.md (a `design.md` read-order addition, from
      separate in-progress work this plan's negative constraints say not to touch) — if so, that
      diff will also appear here and is not a mismatch; only this task's own `app/settings/page.tsx`
      hunk is what to verify and stage (`git add -p` if entangled).

- [x] **Step 7 — Commit.**
      `git add app/settings/page.tsx REFERENCE.md && git commit`
      Message: `feat(014): wire the export expenses flow into Settings`

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
- `lib/export.ts`: `formatExpensesAsCsv(expenses)`, a pure function building a CSV string (header
  row plus one RFC-4180-escaped row per expense, in `Date,Category,Currency,Amount,Payment Method,
  Location,Description` order, amount to two decimal places, description blank when absent). Commit
  `dfaec97`.
- `app/settings/page.tsx`: an "Export expenses" button, alongside feature 013's existing exchange-rate
  and reset actions — reads `getExpenses()` on click, shows a `role="status"` message with no
  download when empty, otherwise triggers a `Blob`-based download named `expenses.csv`. Commit
  `011d77f`.

**Deviations from the plan:**
- Task 2's implementer subagent was cut off mid-report by an infrastructure error (a session-limit
  API error) partway through its final REFERENCE.md edit. The controller independently verified the
  working tree rather than treating this as a failed attempt: both `app/settings/page.tsx` and
  `REFERENCE.md` were already correctly and completely edited, and `npx tsc --noEmit`/`npm run lint`/
  `npm run build` all passed cleanly. Both review gates re-verified this from the real files (not
  from a report) before passing — treated as a successful first attempt, not a retry.
- Pass A.5's independent coverage check caught one gap in the draft plan: AC-014-05's third
  Examples row (an embedded newline) had no corresponding manual-check step. Fixed by splitting
  Task 2's Step 5c into a UI check (comma/quote) and a new Step "5c′", a code-review check
  confirming `escapeCsvField`'s regex treats `\n`/`\r` identically to `,`/`"` — the newline case
  can't be exercised through this app's UI since the description field is a plain `<input
  type="text">`, not a `<textarea>`.
- Every task's REFERENCE.md diff was entangled with an unrelated, pre-existing uncommitted
  `design.md` read-order addition from separate in-progress work elsewhere in the shared working
  tree. Every commit isolated only this plan's own hunks via `git add -p`, verified line-by-line
  before staging.

**Follow-ups not in scope:**
- **RESIDUAL GAP**: no browser-automation tool exists in this environment, so Task 2's Step 5 manual
  checks (5a — empty-state message and no download, 5b — a successful download with correct
  header/rows/formatting, 5c — a comma/quote round-trip through an actual spreadsheet application,
  5d — confirming feature 013's reset-cancel path still works) could not be executed live. Sub-check
  5c′ (embedded-newline escaping) is fully verified since it's a code-review check, not a UI check.
  Both review gates traced the other four scenarios against the real code by hand as the deepest
  available substitute, but a human should exercise all of AC-014-01 through AC-014-06 in an actual
  browser before treating feature 014 as fully verified end-to-end.
- Not acted on (per the spec's own Contrarian Challenge 3): no UTF-8 byte-order mark or other
  spreadsheet-application compatibility shim was added — not requested by any scenario.

**Final verification (both tasks, cumulative):**
- `npx tsc --noEmit`: exit 0, no output.
- `npm run lint`: exit 0, no output.
- `npm run build`: exit 0, unchanged 8-route table (`/`, `/_not-found`, `/categories`,
  `/expenses/[id]` marked `ƒ`, `/expenses/new`, `/settings`, `/trip/edit`, `/trip/new`).
- All 4 review-gate passes across 2 tasks returned PASS on the first attempt.
