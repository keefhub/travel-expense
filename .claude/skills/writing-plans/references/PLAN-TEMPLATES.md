# Plan templates

Copy these shapes literally. Every command below is a real command in this repo (Next.js 16 / TypeScript / ESLint 9, **no test runner installed** — see the parent SKILL.md's Provenance table).

---

## 1. Plan header (required — every plan starts with this)

```markdown
# <Feature name> — Implementation Plan

**Status:** Not Started
**Source:** `features/005.record-expense.md`
**Goal:** Let a traveller record an expense against the active trip and see it
on the dashboard.

**Architecture:**
Client-only. The route reads the active trip and categories from local storage
in a mount effect, holds form state as strings, and converts to a typed
`Expense` once inside a single save transaction. Validation is a pure function
with no DOM, no storage and no clock. Persistence is delegated entirely to
`lib/storage/`.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5
(`strict`), Tailwind CSS 4. Data: browser local storage — no backend, no
database. Verification: `npm run lint`, `npx tsc --noEmit`, `npm run build`.
```

`**Status:**` is one of `Not Started` / `In Progress` / `Complete`. It starts at `Not Started` and is advanced during execution — see `PLAN-MAINTENANCE.md`.

When the plan is amended later, a dated `**Amended:**` line joins the header (see SKILL.md, *Amending an existing plan*).

---

## 2. Test-first task template (the default)

Use this for anything that changes behavior. The loop is: **write the failing check → run it, expect failure → minimal implementation → run it, expect pass → regression run → commit.**

Because this repo has no test runner, the failing check is a **compiler** failure — a call site that references something not yet written. That is a genuine red signal here, with an exact, verified output format.

```markdown
### Task 3: [Domain] — validateExpense rejects a non-positive amount

**Files**
- create: `lib/expenses/validateExpense.ts`
- modify: `lib/types.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [ ] **Step 1 — Write the failing check.** Create
      `lib/expenses/validateExpense.ts` containing only the call site that
      states the contract:

      ```ts
      import type { ExpenseFormValues, ValidationResult } from "@/lib/types";

      const probe: ValidationResult = validateExpense({ amount: "0" } as ExpenseFormValues);
      ```

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/expenses/validateExpense.ts(1,15): error TS2305: Module '"@/lib/types"' has no exported member 'ExpenseFormValues'.`

- [ ] **Step 3 — Add the types.** In `lib/types.ts`, export
      `ExpenseFormValues` (all fields `string`) and
      `ValidationResult` (`{ errors: Record<string, string>; warnings: Record<string, string> }`).

- [ ] **Step 4 — Re-run; confirm the error moved, not vanished.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/expenses/validateExpense.ts(3,32): error TS2304: Cannot find name 'validateExpense'.`

- [ ] **Step 5 — Minimal implementation.** Implement
      `export function validateExpense(values: ExpenseFormValues): ValidationResult`
      returning `errors.amount = "Enter an amount greater than 0."` when
      `Number(values.amount)` is not finite or is `<= 0`, and empty objects
      otherwise. Delete the `probe` line from Step 1.

- [ ] **Step 6 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the route table.

- [ ] **Step 8 — Commit.**
      `git add lib/types.ts lib/expenses/validateExpense.ts && git commit`
      Message: `feat(005): reject non-positive expense amounts`
```

### Rules this template encodes

- Every step is one action with one verification.
- Every `Expected:` is a literal string an implementer can compare against, not a description of success.
- The red step must actually run before the implementation exists — a step that cannot fail proves nothing.
- Steps 2 and 4 differ deliberately: the error *moving* is what shows the previous step worked.
- Checkboxes are `- [ ]` in the plan as written, ticked during execution.

### Verifying behavior the compiler cannot see

For UI behavior — a banner, a redirect, a chart, a responsive layout — replace the compiler step with a manual check phrased so it has a yes/no answer:

```markdown
- [ ] **Step 5 — Verify in the browser.** Run `npm run dev`, open
      http://localhost:3000/expenses/new, enter a date one day after the trip's
      end date, and submit.
      Expected: the expense saves and the dashboard opens; the text
      "This date is outside your trip dates." was shown above the date field
      before submitting; submission was not blocked.
```

Never write "check that it looks right", "verify the UI works", or "test the flow".

---

## 3. Refactor task template (mechanical changes only)

Use **only** for a rename, a file move, or an extraction with no logic change — a change where the compiler and build are a sufficient safety net because behavior is meant to be byte-for-byte identical.

```markdown
### Task 6: [Domain] — move formatMoney out of the dashboard into lib/format

**Files**
- create: `lib/format/money.ts`
- modify: `app/page.tsx`, `components/dashboard/TotalSpend.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [ ] **Step 1 — Apply the change.** Move `formatMoney` verbatim from
      `app/page.tsx` into `lib/format/money.ts` as a named export. Replace both
      call sites with `import { formatMoney } from "@/lib/format/money";`.
      No signature change, no logic change.

- [ ] **Step 2 — Build verification.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, route table unchanged from before the
      move (same routes, same static markers).

- [ ] **Step 3 — Commit.**
      `git commit` with message:
      `refactor(009): extract formatMoney into lib/format/money`
```

**If the change alters any observable behavior, it is not a refactor — use the test-first template.** When in doubt, test-first.

---

## 4. Commands available in this repo

| Purpose | Command | Success output |
|---|---|---|
| Lint | `npm run lint` | exit 0, no output |
| Typecheck | `npx tsc --noEmit` | exit 0, no output |
| Build (includes typecheck) | `npm run build` | exit 0, "Compiled successfully" then a route table |
| Dev server | `npm run dev` | serves on http://localhost:3000 |

There is **no** `npm test` in this repo. Do not write one into a plan.

Typecheck failure format, for writing `Expected:` lines:

```
<path>(<line>,<col>): error TS<code>: <message>
```

Two verified examples:

```
lib/expenses/validateExpense.ts(1,10): error TS2305: Module '"@/lib/types"' has no exported member 'ExpenseFormValues'.
app/expenses/new/page.tsx(3,31): error TS2307: Cannot find module '@/lib/expenses/validateExpense' or its corresponding type declarations.
```
