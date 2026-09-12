# Plan templates

Copy these shapes literally. Every command below is a real command in this repo (Next.js 16 / TypeScript / ESLint 9; **no unit-test runner**, but `@playwright/test` is installed — see `.claude/repo-profile.md`).

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

## 2. Contract task template (the default)

Use this for anything that changes behavior. The plan states the **contract**; the implementer
writes the body. The loop is: **write the call site → run it, expect a quoted compiler failure →
implement → run it, expect pass → regression run → commit.**

Because this repo has no unit-test runner, the red step is a **compiler** failure. That is a real
signal here: `TS2305` says a named export with a declared shape is missing, which is exactly what
the contract below promises.

```markdown
### Task 3: [Domain] — validateExpense rejects a non-positive amount

**Files**
- create: `lib/expenses/validateExpense.ts`
- modify: `lib/types.ts`
- test: `npx tsc --noEmit`, `npm run lint`

- [ ] **Step 1 — Write the failing check.** In `app/expenses/new/page.tsx` (the real consumer —
      do not create a throwaway probe file), add the call site:

      ```ts
      import { validateExpense } from "@/lib/expenses/validateExpense";
      ```

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, error TS2307 on `app/expenses/new/page.tsx` —
      `Cannot find module '@/lib/expenses/validateExpense' or its corresponding type declarations.`
      (Match the code and message. Do not predict the column.)

- [ ] **Step 3 — Add the types.** In `lib/types.ts`, export `ExpenseFormValues` (all fields
      `string`) and `ValidationResult`
      (`{ errors: Record<string, string>; warnings: Record<string, string> }`).

- [ ] **Step 4 — Implement to this contract.**

      ```
      File: lib/expenses/validateExpense.ts  (create)
      Exports: validateExpense(values: ExpenseFormValues): ValidationResult
      Behavior: errors.amount = "Enter an amount greater than 0." when
                Number(values.amount) is not finite or <= 0; empty objects otherwise
      Constraints: pure — no DOM, no storage, no clock. Must not modify lib/storage.ts
      ```

- [ ] **Step 5 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 6 — Regression run.** Per `.claude/repo-profile.md` § Verification commands.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      (`npm run build` only if this task touched routes, config, or dependencies — it did not.)

- [ ] **Step 7 — Commit.**
      Message: `feat(005): reject non-positive expense amounts`
```

### Rules this template encodes

- **The plan gives the contract, not the body.** Literal code appears only where exactness is the
  point — a regex, a formula, an API call with a known gotcha.
- Every step is one action with one verification.
- Every `Expected:` is something an implementer can compare against — an error code and message, not
  a description of success, and not a predicted column number.
- The red step must actually run before the implementation exists. Put it in the real consuming
  file; never create a throwaway file whose only purpose is to be deleted.
- Checkboxes are `- [ ]` in the plan as written, ticked during execution.

---

## 2b. Playwright task template (behavior the compiler cannot see)

For a banner, a redirect, a chart, a responsive layout — anything `tsc` cannot reach.

```markdown
### Task 5: [UI] — the record-expense form warns before discarding unsaved input

**Files**
- modify: `components/ExpenseForm.tsx`
- create: `e2e/011-unsaved-warning.spec.ts`
- test: `npx playwright test e2e/011-unsaved-warning.spec.ts`

- [ ] **Step 1 — Write the spec first.** Create `e2e/011-unsaved-warning.spec.ts` covering: a
      dirty form warns on in-app navigation; a clean form navigates with no warning.
      Seed `localStorage` via `page.addInitScript` **before** first render — every route
      redirects to `/` when `getTrip()` is `null`.

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx playwright test e2e/011-unsaved-warning.spec.ts`
      Expected: exit 1, `2 failed`.

- [ ] **Step 3 — Implement to the contract.** (contract block, as in template 2)

- [ ] **Step 4 — Run it and confirm it passes.**
      `npx playwright test e2e/011-unsaved-warning.spec.ts`
      Expected: exit 0, `2 passed`.
```

Scope the command to the spec file. `npm run test:e2e` runs everything, so a whole-suite count
breaks the moment another feature adds a test. See `.claude/repo-profile.md` § Behavioral gate.

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

**If the change alters any observable behavior, it is not a refactor — use the contract template (2), or the Playwright template (2b) if a compiler cannot see the change.** When in doubt, use template 2.

---

## 4. Commands available in this repo

| Purpose | Command | Success output |
|---|---|---|
| Lint | `npm run lint` | exit 0, no output |
| Typecheck | `npx tsc --noEmit` | exit 0, no output |
| Build (includes typecheck) | `npm run build` | exit 0, "Compiled successfully" then a route table |
| Dev server | `npm run dev` | serves on http://localhost:3000 |
| E2E (one spec) | `npx playwright test e2e/<spec>.spec.ts` | exit 0, `N passed` |

There is **no** `npm test` and no unit-test runner in this repo — do not write `jest`, `vitest`, or
`npm test` into a plan. `npm run test:e2e` exists but runs the whole suite; scope plan steps to a
single spec file instead. `npm run build` is **not** universal: add it only for tasks touching
routes, config, or dependencies.

Typecheck failure format, for writing `Expected:` lines:

```
<path>(<line>,<col>): error TS<code>: <message>
```

Two verified examples:

```
lib/expenses/validateExpense.ts(1,10): error TS2305: Module '"@/lib/types"' has no exported member 'ExpenseFormValues'.
app/expenses/new/page.tsx(3,31): error TS2307: Cannot find module '@/lib/expenses/validateExpense' or its corresponding type declarations.
```
