# Record Expense — Implementation Plan

**Status:** Complete
**Source:** `doc/spec/005.record-expense.md`
**Goal:** Let a traveller record an expense (amount, currency, category, date, payment method,
location, optional description) against the active trip, with a non-blocking warning when the date
falls outside the trip period, and land on the home dashboard with a success message afterward.

**Architecture:**
A new pure domain module, `lib/expenses.ts`, mirrors the shape `lib/trip.ts` already established:
form-values type, a `validateExpenseForm` function returning both blocking `errors` and non-blocking
`warnings`, and a `submitExpense` function that validates, then appends to the existing expense list
and saves via injected `deps` (`getExpenses`/`saveExpenses`/`generateId`). `lib/countries.ts` gains
one additive export, `getSupportedCurrencies()`, deriving the currency dropdown's options from the
existing `SUPPORTED_COUNTRIES` data rather than introducing a second currency source. A new
`ExpenseForm` client component renders all seven fields, pre-filled via `getInitialExpenseFormValues`
(today's date, the trip's currency), and live-recomputes the trip-period warning on every render,
mirroring `TripEditForm`'s live-derived-fields pattern. A new route, `app/expenses/new/page.tsx`,
replaces the feature-015 placeholder with the same hydration-safe `useSyncExternalStore`-over-a-
per-mount-store trip-load-and-redirect-if-none pattern already used by `/trip/edit` and `/trip/new`.
The "success message" requirement is satisfied via a one-time `sessionStorage` flag
(`EXPENSE_SAVED_FLAG_KEY`, exported from `lib/expenses.ts`) set by `ExpenseForm` right before
navigating home, and read (and cleared) once by `app/page.tsx` via a second
`useSyncExternalStore`-backed store alongside the existing trip store — not a `useEffect`, since
calling a state setter from inside an effect body trips this repo's `react-hooks/set-state-in-effect`
rule as a hard error (verified empirically while drafting this plan).

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage — no backend, no database. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build`. No test runner is installed (verified: `package.json` has no
`test` script; `node_modules/.bin` contains only `eslint`, `next`, `tsc`).

**Negative constraints (from `doc/spec/005.record-expense.md` §1.6, §2.6, §7):**
- Will NOT add editing or deleting a saved expense — no scenario describes this.
- Will NOT perform any currency conversion between the expense's currency and the trip's currency —
  that arithmetic is feature 006, not this one.
- Will NOT add a follow-up free-text field to elaborate on a payment method of "Other".
- Will NOT implement the `beforeunload` unsaved-input warning — that is feature 011, built explicitly
  as an extension of this form.
- Will NOT display the recorded expense anywhere beyond the one-time success message (a list, a
  running total, a dashboard entry) — that's feature 009.
- Will NOT add receipt/photo attachment.
- Will NOT change `lib/types.ts` — `Expense` already has every field this feature needs.
- Will NOT use `useSearchParams` for the success message — the vendored Next.js docs
  (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-search-params.md`, "Behavior
  > Prerendering") require wrapping any `useSearchParams` caller in a `Suspense` boundary on a
  statically-prerendered page; `sessionStorage` avoids that entirely for a flag this simple.

**Assumptions (from spec §1.3, §6, §7 — carried forward, cheap to reverse if wrong):**
- Assumed: currency is selected from `getSupportedCurrencies()` and category from
  `getAllCategories()` (closed sets via `<select>`), not free text (BR-005-10/11).
- Assumed: `generateId` is injected as a `submitExpense` dependency (real implementation
  `() => crypto.randomUUID()`), matching this codebase's existing DI philosophy for
  `saveTrip`/`saveExpenses` even though no test runner exists yet to exercise that testability
  (spec §6, Challenge 5).
- Assumed: `PAYMENT_METHODS = ["Cash", "Credit Card", "Debit Card", "Mobile Payment", "Other"]` — an
  SA-authored list; OVERVIEW's Assumption 6 only confirms "a dropdown with an Other option," not
  these specific four non-"Other" values.

---

### Task 1: [Domain] — getSupportedCurrencies derives a deduplicated currency list from countries

**Files**
- modify: `lib/countries.ts`
- create (temporary, deleted within this task): `lib/countries.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/countries.probe.ts` containing exactly:

      ```ts
      import { getSupportedCurrencies } from "@/lib/countries";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/countries.probe.ts(1,10): error TS2305: Module '"@/lib/countries"' has no exported member 'getSupportedCurrencies'.`
      (Verified empirically against this exact repo state before writing this plan.)

- [x] **Step 3 — Implement.** Append to `lib/countries.ts`:

      ```ts
      export function getSupportedCurrencies(): string[] {
        return Array.from(new Set(SUPPORTED_COUNTRIES.map((c) => c.currency))).sort();
      }
      ```

- [x] **Step 4 — Delete the probe.** Remove `lib/countries.probe.ts`.

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
      `git add lib/countries.ts && git commit`
      Message: `feat(005): add getSupportedCurrencies to lib/countries`

---

### Task 2: [Domain] — lib/expenses.ts form-values type and getInitialExpenseFormValues

**Files**
- create: `lib/expenses.ts`
- create (temporary, deleted within this task): `lib/expenses.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/expenses.probe.ts` containing exactly:

      ```ts
      import { getInitialExpenseFormValues } from "@/lib/expenses";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/expenses.probe.ts(1,45): error TS2307: Cannot find module '@/lib/expenses' or its corresponding type declarations.`
      (Verified empirically against this exact repo state before writing this plan.)

- [x] **Step 3 — Implement.** Create `lib/expenses.ts`:

      ```ts
      import type { Trip } from "@/lib/types";

      export interface ExpenseFormValues {
        amount: string;
        currency: string;
        category: string;
        date: string;
        paymentMethod: string;
        location: string;
        description: string;
      }

      export const PAYMENT_METHODS: readonly string[] = [
        "Cash",
        "Credit Card",
        "Debit Card",
        "Mobile Payment",
        "Other",
      ];

      export const EXPENSE_SAVED_FLAG_KEY = "travel-expense:expense-saved";

      export function getInitialExpenseFormValues(trip: Trip, today: string): ExpenseFormValues {
        return {
          amount: "",
          currency: trip.currency,
          category: "",
          date: today,
          paymentMethod: "",
          location: "",
          description: "",
        };
      }
      ```

- [x] **Step 4 — Delete the probe.** Remove `lib/expenses.probe.ts`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as Task 1 (this
      module is not yet imported by any route).

- [x] **Step 7 — Commit.**
      `git add lib/expenses.ts && git commit`
      Message: `feat(005): add expense form values and initial-values helper`

---

### Task 3: [Domain] — validateExpenseForm rejects invalid input and warns on out-of-range dates

**Depends on Task 1** (`getSupportedCurrencies` from `lib/countries.ts`) for the currency closed-set
check below.

**Files**
- modify: `lib/expenses.ts`
- create (temporary, deleted within this task): `lib/expenses.validate.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/expenses.validate.probe.ts` containing
      exactly:

      ```ts
      import { validateExpenseForm } from "@/lib/expenses";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/expenses.validate.probe.ts(1,10): error TS2305: Module '"@/lib/expenses"' has no exported member 'validateExpenseForm'.`
      (Verified empirically against this exact repo state before writing this plan — after simulating
      Task 2's output.)

- [x] **Step 3 — Implement.** First, add an import for `getSupportedCurrencies` at the top of
      `lib/expenses.ts` (it does not yet import anything from `@/lib/countries`):

      ```ts
      import { getSupportedCurrencies } from "@/lib/countries";
      ```

      Then append to `lib/expenses.ts`:

      ```ts
      export interface ExpenseValidationResult {
        errors: Partial<Record<keyof ExpenseFormValues, string>>;
        warnings: Partial<Record<keyof ExpenseFormValues, string>>;
      }

      export function validateExpenseForm(
        values: ExpenseFormValues,
        trip: { startDate: string; endDate: string },
        categoryNames: string[]
      ): ExpenseValidationResult {
        const errors: ExpenseValidationResult["errors"] = {};
        const warnings: ExpenseValidationResult["warnings"] = {};

        const trimmedAmount = values.amount.trim();
        if (trimmedAmount === "") {
          errors.amount = "Enter an amount.";
        } else {
          const parsed = Number(trimmedAmount);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            errors.amount = "Enter an amount greater than 0.";
          }
        }

        if (!getSupportedCurrencies().includes(values.currency)) {
          errors.currency = "Select a valid currency.";
        }

        if (!categoryNames.includes(values.category)) {
          errors.category = "Select a valid category.";
        }

        if (values.date.trim() === "") {
          errors.date = "Enter a date.";
        } else if (values.date < trip.startDate || values.date > trip.endDate) {
          warnings.date = "This date is outside your trip dates.";
        }

        if (!PAYMENT_METHODS.includes(values.paymentMethod)) {
          errors.paymentMethod = "Select a valid payment method.";
        }

        if (values.location.trim() === "") {
          errors.location = "Enter a location.";
        }

        return { errors, warnings };
      }
      ```

      Rule-to-code mapping (for review): blank/non-numeric/≤0 amount → BR-005-04; blank location
      after trim → BR-005-03a; `currency`/`category`/`paymentMethod` are each checked by set
      membership (`.includes(...)`) rather than a separate blank check — an empty string is never a
      member of any of the three sets, so this single check covers both "left blank" (BR-005-03a) and
      "not one of the known values" (BR-005-10/11/12) for those three fields in one condition;
      `categoryNames` is accepted as a parameter (not read via `getAllCategories()` internally)
      because that function reads local storage, and this module is a pure domain module per this
      plan's own layer rules (no storage reads inside `lib/expenses.ts`) — the caller (`ExpenseForm`,
      Task 5) is responsible for supplying the current category names. String-comparison date-range
      check on `YYYY-MM-DD` values, exclusive of the boundary dates (`<`/`>`, not `<=`/`>=`) →
      BR-005-08a and the AC-005-06 boundary case; no upper bound is ever checked on `date`, so a
      future date never produces an error → BR-005-07; the date check only *warns*, never adds to
      `errors` → BR-005-08b.

      **Deviation from spec TS-005-05 flagged during plan review:** the gated spec's original design
      text only described currency/category/paymentMethod as failing on "blank after trim" without
      spelling out the closed-set membership check as executable logic; an earlier draft of this task
      implemented only the blank check and both the plan's adversarial review pass and its
      document-review pass independently caught that BR-005-10/11/12 ("not one of their respective
      known sets") were unenforced. This corrected version closes that gap.

- [x] **Step 4 — Delete the probe.** Remove `lib/expenses.validate.probe.ts`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as Task 1.

- [x] **Step 7 — Commit.**
      `git add lib/expenses.ts && git commit`
      Message: `feat(005): add validateExpenseForm with trip-period date warning`

---

### Task 4: [Domain] — submitExpense validates, appends, and saves a new expense

**Files**
- modify: `lib/expenses.ts`
- create (temporary, deleted within this task): `lib/expenses.submit.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/expenses.submit.probe.ts` containing
      exactly:

      ```ts
      import { submitExpense } from "@/lib/expenses";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/expenses.submit.probe.ts(1,10): error TS2305: Module '"@/lib/expenses"' has no exported member 'submitExpense'.`
      (Verified empirically against this exact repo state before writing this plan — after simulating
      Tasks 2–3's output.)

- [x] **Step 3 — Implement.** First, change the top of `lib/expenses.ts` from
      `import type { Trip } from "@/lib/types";` to add `Expense` (now used by this task) and a new
      import line for `SaveResult` (already imported the same way by `lib/trip.ts` from
      `@/lib/storage`):

      ```ts
      import type { Trip, Expense } from "@/lib/types";
      import type { SaveResult } from "@/lib/storage";
      ```

      Then append to `lib/expenses.ts`:

      ```ts
      export type SubmitExpenseResult =
        | { status: "invalid"; errors: ExpenseValidationResult["errors"] }
        | { status: "saved"; expense: Expense }
        | { status: "storage-error"; error: string };

      export function submitExpense(
        values: ExpenseFormValues,
        trip: { startDate: string; endDate: string },
        categoryNames: string[],
        deps: {
          getExpenses: () => Expense[];
          saveExpenses: (expenses: Expense[]) => SaveResult;
          generateId: () => string;
        }
      ): SubmitExpenseResult {
        const { errors } = validateExpenseForm(values, trip, categoryNames);
        if (Object.keys(errors).length > 0) {
          return { status: "invalid", errors };
        }

        const trimmedDescription = values.description.trim();
        const expense: Expense = {
          id: deps.generateId(),
          amount: Number(values.amount.trim()),
          currency: values.currency,
          category: values.category,
          date: values.date,
          paymentMethod: values.paymentMethod,
          location: values.location.trim(),
          ...(trimmedDescription !== "" ? { description: trimmedDescription } : {}),
        };

        const result = deps.saveExpenses([...deps.getExpenses(), expense]);
        if (!result.ok) {
          return { status: "storage-error", error: result.error };
        }

        return { status: "saved", expense };
      }
      ```

      Rule-to-code mapping (for review): `errors` non-empty short-circuits before any storage call,
      and a `warnings`-only result reaches the save path → BR-005-05, BR-005-08b; description trimmed
      and the key omitted entirely (not `""`) when blank → the §1.5 absent-description edge case,
      AC-005-09; `id: deps.generateId()` → BR-005-09; append (not replace) to the existing list →
      BR-005-06a — `[...deps.getExpenses(), expense]` on an empty array returned by `deps.getExpenses()`
      (the §1.5 "first expense ever recorded" edge case: no active trip has any expenses yet) produces
      a valid one-element array through this exact same line, not a special case needing separate
      code; `storage-error` returned, not thrown, on a failed save → the §1.5 storage-failure edge
      case.

- [x] **Step 4 — Delete the probe.** Remove `lib/expenses.submit.probe.ts`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as Task 1.

- [x] **Step 7 — Commit.**
      `git add lib/expenses.ts && git commit`
      Message: `feat(005): add submitExpense, complete the expense domain module`

---

### Task 5: [UI] — ExpenseForm renders all seven fields with live trip-period warning

**Depends on Tasks 1–4** (`getSupportedCurrencies` from `lib/countries.ts`; every export of
`lib/expenses.ts`, including `validateExpenseForm`'s and `submitExpense`'s `categoryNames` parameter
added in Task 3/4).

**Files**
- create: `components/ExpenseForm.tsx`
- create (temporary, deleted within this task): `components/ExpenseForm.probe.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `components/ExpenseForm.probe.tsx` containing
      exactly:

      ```tsx
      import ExpenseForm from "@/components/ExpenseForm";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `components/ExpenseForm.probe.tsx(1,25): error TS2307: Cannot find module '@/components/ExpenseForm' or its corresponding type declarations.`
      (Verified empirically against this exact repo state before writing this plan — after simulating
      Tasks 1–4's output.)

- [x] **Step 3 — Implement.** Create `components/ExpenseForm.tsx`:

      ```tsx
      "use client";

      import { useState, type FormEvent } from "react";
      import { useRouter } from "next/navigation";
      import type { Trip } from "@/lib/types";
      import { getSupportedCurrencies } from "@/lib/countries";
      import { getAllCategories } from "@/lib/categories";
      import { getExpenses, saveExpenses } from "@/lib/storage";
      import {
        getInitialExpenseFormValues,
        validateExpenseForm,
        submitExpense,
        PAYMENT_METHODS,
        EXPENSE_SAVED_FLAG_KEY,
        type ExpenseFormValues,
        type ExpenseValidationResult,
      } from "@/lib/expenses";

      export default function ExpenseForm({ trip }: { trip: Trip }) {
        const router = useRouter();
        const today = new Date().toISOString().slice(0, 10);
        const [values, setValues] = useState<ExpenseFormValues>(() =>
          getInitialExpenseFormValues(trip, today)
        );
        const [errors, setErrors] = useState<ExpenseValidationResult["errors"]>({});
        const [saveError, setSaveError] = useState<string | null>(null);

        const [categories] = useState(() => getAllCategories());
        const categoryNames = categories.map((c) => c.name);
        const dateWarning = validateExpenseForm(values, trip, categoryNames).warnings.date;

        function handleSubmit(e: FormEvent) {
          e.preventDefault();
          const result = submitExpense(values, trip, categoryNames, {
            getExpenses,
            saveExpenses,
            generateId: () => crypto.randomUUID(),
          });
          if (result.status === "invalid") {
            setErrors(result.errors);
            setSaveError(null);
            return;
          }
          if (result.status === "storage-error") {
            setErrors({});
            setSaveError(result.error);
            return;
          }
          setErrors({});
          setSaveError(null);
          window.sessionStorage.setItem(EXPENSE_SAVED_FLAG_KEY, "1");
          router.push("/");
        }

        return (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">Record an expense</h1>

            <div className="flex flex-col gap-1">
              <label htmlFor="amount">Amount</label>
              <input
                id="amount"
                type="text"
                inputMode="decimal"
                value={values.amount}
                onChange={(e) => setValues({ ...values, amount: e.target.value })}
              />
              {errors.amount && <p role="alert">{errors.amount}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="currency">Currency</label>
              <select
                id="currency"
                value={values.currency}
                onChange={(e) => setValues({ ...values, currency: e.target.value })}
              >
                <option value="">Select a currency</option>
                {getSupportedCurrencies().map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              {errors.currency && <p role="alert">{errors.currency}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="category">Category</label>
              <select
                id="category"
                value={values.category}
                onChange={(e) => setValues({ ...values, category: e.target.value })}
              >
                <option value="">Select a category</option>
                {categories.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.category && <p role="alert">{errors.category}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="date">Date</label>
              <input
                id="date"
                type="date"
                value={values.date}
                onChange={(e) => setValues({ ...values, date: e.target.value })}
              />
              {errors.date && <p role="alert">{errors.date}</p>}
              {!errors.date && dateWarning && <p role="status">{dateWarning}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="paymentMethod">Payment method</label>
              <select
                id="paymentMethod"
                value={values.paymentMethod}
                onChange={(e) => setValues({ ...values, paymentMethod: e.target.value })}
              >
                <option value="">Select a payment method</option>
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
              {errors.paymentMethod && <p role="alert">{errors.paymentMethod}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="location">Location</label>
              <input
                id="location"
                type="text"
                value={values.location}
                onChange={(e) => setValues({ ...values, location: e.target.value })}
              />
              {errors.location && <p role="alert">{errors.location}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="description">Description (optional)</label>
              <input
                id="description"
                type="text"
                value={values.description}
                onChange={(e) => setValues({ ...values, description: e.target.value })}
              />
            </div>

            {saveError && <p role="alert">{saveError}</p>}

            <button type="submit">Save expense</button>
          </form>
        );
      }
      ```

      Design notes (for review): `today` is computed inline via `new Date().toISOString().slice(0, 10)`
      — no clock injection, matching `TripSetupForm`'s existing precedent (TS-005-09). `categoryNames`
      is derived from `getAllCategories()`, wrapped in a lazy `useState` initializer so it runs
      once on mount rather than on every render (a Gate B code-quality review during `/sdd` execution
      found the original per-render call re-read and re-parsed localStorage on every keystroke; see
      log.txt Task 5), and passed into both
      `validateExpenseForm` (for the live date warning) and `submitExpense` (for the actual save) —
      this is the one and only place in the whole feature that reads storage-backed category data,
      keeping `lib/expenses.ts` itself free of storage reads per Task 3's layering note. The date
      warning is recomputed on every render (not stored in state), mirroring `TripEditForm`'s
      live-derived-fields pattern, and uses `role="status"` (non-blocking) instead of `role="alert"`
      (blocking) — TS-005-09's deliberate distinction, and it is only shown when `errors.date` is
      absent so a blank-date error and an out-of-range warning never both/either overlap oddly. A
      `storage-error` result does not reset `values`, so the user's entered values remain visible —
      BR-005-10/AC-005-10.

- [x] **Step 4 — Delete the probe.** Remove `components/ExpenseForm.probe.tsx`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as Task 1 (this
      component is not yet mounted in any route).

- [x] **Step 7 — Commit.**
      `git add components/ExpenseForm.tsx && git commit`
      Message: `feat(005): add ExpenseForm with all seven fields and trip-period warning`

---

### Task 6: [Route] — /expenses/new loads the trip, redirects if none, and renders ExpenseForm

**Files**
- modify: `app/expenses/new/page.tsx` (replaces the feature-015 placeholder)
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Implement the route.** Replace the entire contents of
      `app/expenses/new/page.tsx` (currently the feature-015 placeholder:
      `export default function Page() { return <h1>Add Expense</h1>; }`) with the same
      hydration-safe `useSyncExternalStore`-over-a-per-mount-store pattern feature 002/003 already
      established for `/trip/edit` and `/trip/new`:

      ```tsx
      "use client";

      import { useEffect, useState, useSyncExternalStore } from "react";
      import { useRouter } from "next/navigation";
      import type { Trip } from "@/lib/types";
      import { getTrip } from "@/lib/storage";
      import ExpenseForm from "@/components/ExpenseForm";

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

      export default function RecordExpensePage() {
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

        return <ExpenseForm trip={trip} />;
      }
      ```

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output. (The only `useEffect` calls `router.replace`, never a state
      setter — the same shape already confirmed clean of `react-hooks/set-state-in-effect` for
      `app/trip/edit/page.tsx` in feature 002.)

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with the same seven-route table as Task 1 (`/expenses/new` already
      existed as the feature-015 placeholder; this task changes its content, not the route list):
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

- [ ] **Step 5 — NOT PERFORMED (no browser automation tool available in this environment).**
      Manual check: no active trip redirects home (AC-005-11). Run `npm run dev`. In a browser
      devtools console on `http://localhost:3000`, run `localStorage.clear()`, then navigate directly
      to `http://localhost:3000/expenses/new`.
      Expected: the browser lands on `http://localhost:3000/` and shows the trip setup form; no
      expense form is shown at any point.

- [ ] **Step 6 — NOT PERFORMED (no browser automation tool available in this environment).**
      Manual check: the full record-expense scenario matrix (AC-005-01 through AC-005-10). With an
      active trip saved (e.g. Japan, 2026-03-01 to 2026-03-10) and at least the default categories
      present, run `npm run dev` and open `http://localhost:3000/expenses/new` for each row, reloading
      the page between rows so form state doesn't carry over:

      **6a. All fields present, date defaults to today (AC-005-01, AC-005-02).**
      Expected: fields for amount, currency, category, date, payment method, location are shown, plus
      an optional description field; the date field's initial value is today's date; the currency
      field's initial value is the trip's currency (JPY).

      **6b. A valid submission saves and redirects with a success message (AC-005-03).** Enter amount
      `1000`, currency `JPY`, category `Food`, date `2026-03-05`, payment method `Cash`, location
      `Tokyo`, submit.
      Expected: the browser redirects to `http://localhost:3000/`; a success message is shown there.
      In the devtools console, `JSON.parse(localStorage.getItem("travel-expense:expenses"))` shows one
      expense matching those values with a generated `id` and no `description` key present at all
      (AC-005-09 — description was left blank).

      **6c. A future-dated expense saves without a date error (AC-005-04).** Enter date `2026-04-01`
      (after the trip's end date) with every other field valid, submit.
      Expected: no validation error is shown for the date field before submitting; the expense saves
      and the browser redirects home.

      **6d. An expense outside the trip period warns but still saves (AC-005-05).** Enter date
      `2026-02-20` (before the trip's start date) with every other field valid.
      Expected: a `role="status"` warning "This date is outside your trip dates." appears below the
      date field, without submitting.
      Submit anyway.
      Expected: the expense saves and the browser redirects home.

      **6e. Boundary dates show no warning (AC-005-06).** Enter date `2026-03-01` (exactly the trip's
      start date) with every other field valid.
      Expected: no trip-period warning is shown.
      Change the date to `2026-03-10` (exactly the trip's end date).
      Expected: still no trip-period warning is shown.

      **6f. Missing mandatory fields block saving (AC-005-07).** For each of amount, currency,
      category, date, payment method, location: leave that one field blank (every other mandatory
      field valid), submit.
      Expected, for each: a validation message (`role="alert"`) appears under that field; the browser
      does not navigate away; `JSON.parse(localStorage.getItem("travel-expense:expenses"))` count is
      unchanged from before this row.

      **6g. Invalid amounts are rejected (AC-005-08).** For amount values `0`, `-5`, `abc` (every
      other mandatory field valid), submit.
      Expected, for each: a validation message appears under the amount field; no new expense is
      saved.

      **6h. A storage failure preserves entered values (AC-005-10).** In the devtools console, exhaust
      local storage so the next write fails:
      ```js
      let i = 0;
      try {
        while (true) {
          localStorage.setItem("__pad" + i, "x".repeat(5 * 1024 * 1024));
          i++;
        }
      } catch (e) {
        console.log("storage full after", i, "pads");
      }
      ```
      Enter valid values for every field and submit.
      Expected: a friendly storage error message appears (`role="alert"`, not a raw exception or blank
      screen); every field still shows the value entered; no new expense was saved.
      Clean up before continuing:
      `for (let k in localStorage) { if (k.startsWith("__pad")) localStorage.removeItem(k); }`.

- [x] **Step 7 — Commit.**
      `git add app/expenses/new/page.tsx && git commit`
      Message: `feat(005): add the record-expense route`
      (If Steps 5-6 could not be performed because no browser automation tool is available in this
      environment, say so explicitly in the commit body and in `log.txt`, matching the disclosure
      precedent set in feature 003's plan, Task 4.)

---

### Task 7: [Route] — app/page.tsx shows a one-time success message after a saved expense

**Files**
- modify: `app/page.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Implement.** `EXPENSE_SAVED_FLAG_KEY` already exists from Task 2 (no red-step probe
      needed here — this task only wires an already-verified export into a new call site). In
      `app/page.tsx`:
      1. Add `import { EXPENSE_SAVED_FLAG_KEY } from "@/lib/expenses";` to the imports (after the
         existing `import { calculateTripDurationDays } from "@/lib/trip";` line).
      2. Add a second `useSyncExternalStore`-backed store above `Home()`, right after
         `createTripStore`'s closing brace — **not** a `useEffect`. A plain
         `useEffect(() => { ...; setShowSavedMessage(true); }, [])` calling a state setter
         synchronously from an effect body trips this repo's `react-hooks/set-state-in-effect`
         ESLint rule as a hard error (verified empirically while drafting this plan). `createTripStore`'s
         existing `useSyncExternalStore` pattern already solves the same class of problem for `trip`,
         so the success flag reuses it:

      ```tsx
      // Reads the one-time post-save flag and clears it on the same call, so a
      // later reload of "/" never re-shows the message. Modeled as a
      // useSyncExternalStore snapshot (not useEffect+setState) for the same reason
      // createTripStore is: setting state from inside an effect body is a
      // synchronous cascading re-render the react-hooks/set-state-in-effect rule
      // rejects, and this needs the read to happen exactly once regardless of how
      // many times React calls getSnapshot for comparison.
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
      ```

      3. Inside `Home()`, after the existing `const [store] = useState(createTripStore);` and
         `const trip = useSyncExternalStore(...)` lines, add:

      ```tsx
      const [savedMessageStore] = useState(createSavedMessageStore);
      const showSavedMessage = useSyncExternalStore(
        savedMessageStore.subscribe,
        savedMessageStore.getSnapshot,
        savedMessageStore.getServerSnapshot
      );
      ```

      4. In the dashboard placeholder's returned JSX (the branch that renders after
         `trip !== null`), add the message as the first child inside the existing
         `<div className="p-4">`:

      ```tsx
      {showSavedMessage && <p role="status">Expense saved.</p>}
      ```

- [x] **Step 2 — Regression run.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output. (Verified empirically while drafting this plan:
      this exact `useSyncExternalStore` implementation lints clean; the originally-considered
      `useEffect`+`setState` alternative does not — it fails with `react-hooks/set-state-in-effect`,
      exit 1.)
      `npm run build` → Expected: exit 0, ending with the same seven-route table as Task 1.

- [ ] **Step 3 — NOT PERFORMED (no browser automation tool available in this environment).**
      Manual check: the success message shows once then clears (AC-005-03, tail end). Continuing
      directly from Task 6's Step 6b (an expense was just saved and the browser redirected to `/`):
      Expected: the home page shows "Expense saved." (`role="status"`).
      Reload `http://localhost:3000/`.
      Expected: "Expense saved." no longer appears (the flag was removed after the first read).

- [x] **Step 4 — Commit.**
      `git add app/page.tsx && git commit`
      Message: `feat(005): show a one-time success message after saving an expense`
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

    feat(005): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: features/005.record-expense.md

Never commit on a failing lint, typecheck, or build.

## Completion Summary

**Completed:** 2026-09-11
**Tasks:** 7 of 7

**What was built:**
`lib/expenses.ts` (a new pure domain module mirroring `lib/trip.ts`'s shape: `ExpenseFormValues`,
`PAYMENT_METHODS`, `EXPENSE_SAVED_FLAG_KEY`, `getInitialExpenseFormValues`, `validateExpenseForm`
with blocking errors and a non-blocking trip-period date warning, and `submitExpense`), one additive
export on `lib/countries.ts` (`getSupportedCurrencies`), `components/ExpenseForm.tsx` (all seven
fields, live date warning, storage-error recovery), the `/expenses/new` route (hydration-safe,
redirects home with no active trip), and a one-time "Expense saved." success message on the home
dashboard. A traveller can now record an expense against the active trip with amount/currency/
category/payment-method validated against closed sets, a required location, an optional description
(saved as genuinely absent when blank), a date that defaults to today, allows future dates freely,
and warns (without blocking) when outside the trip's date range.

**Deviations from the plan:**
- Task 2: `lib/expenses.ts`'s initial `Trip`-only import (not `Trip, Expense`) — deliberate, to avoid
  an unused-import lint warning until Task 4 actually needed `Expense` (log.txt, Task 2).
- Task 3: the plan's validator was corrected *before* implementation — an earlier draft only checked
  currency/category/paymentMethod for blank, not closed-set membership (BR-005-10/11/12); this was
  caught by two independent plan-review passes during `/writing-plans` and fixed before `/sdd` ever
  ran Task 3 (plan header, Task 3 body).
- Task 5: Gate B (code-quality review) found `getAllCategories()` was called directly in the render
  body, re-reading and re-parsing `localStorage` on every keystroke; fixed with a lazy `useState`
  initializer so it runs once on mount (log.txt, Task 5). Required a second review round on both
  gates.
- Task 7: the plan's original `useEffect`+`setState` design for the success-message flag was replaced
  *before* implementation with a second `useSyncExternalStore`-backed store, after empirically
  confirming the `useEffect` version fails this repo's `react-hooks/set-state-in-effect` lint rule as
  a hard error (plan header, Task 7 body). During `/sdd` execution, Gate B additionally found the
  `sessionStorage` read/clear had no try/catch (a render-time crash risk if storage throws); fixed by
  wrapping it, degrading to no message shown on any storage error (log.txt, Task 7). Required a
  second review round on both gates.
- Tasks 6 and 7's manual browser-check steps (AC-005-01 through AC-005-11's full scenario matrix, and
  the success-message-shows-once-then-clears check) were **NOT PERFORMED** — no browser automation
  tool is available in this environment, matching the disclosed precedent in feature 003's plan.
  Static review (both gates traced every scenario by hand against the real committed code) stands in,
  but is not a substitute for an actual browser run.

**Follow-ups not in scope here:**
- **A human should run Task 6's Steps 5-6 and Task 7's Step 3 in an actual browser** before treating
  feature 005 as fully verified end-to-end.
- Currency conversion between an expense's currency and the trip's currency — feature 006.
- The `beforeunload` unsaved-input warning on this form — feature 011.
- Displaying recorded expenses anywhere (a list, a running total) — feature 009's dashboard.
- Editing or deleting a saved expense, and a follow-up field for payment method "Other" — out of
  scope per the spec (doc/spec/005.record-expense.md §1.6).

**Final verification:**
npx tsc --noEmit   exit 0, no output
npm run lint       exit 0, no output
npm run build      exit 0, seven-route table unchanged (/, /_not-found, /categories, /expenses/new,
                    /settings, /trip/edit, /trip/new)
