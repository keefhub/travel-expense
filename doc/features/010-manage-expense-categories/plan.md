# Manage Expense Categories — Implementation Plan

**Status:** Complete
**Source:** `doc/spec/010.manage-expense-categories.md`
**Goal:** Let a traveller add a custom category from the record-expense page's category dropdown
(via a "+ Add New" entry and a small modal), and rename or delete custom categories from a real
`/categories` management page — while default categories stay un-renamable/undeletable everywhere.

**Architecture:**
Two new small, self-contained client components, each wired into its parent in its own follow-up
task (mirroring feature 009's `CategoryPieChart` → `Dashboard` and `Dashboard` → `app/page.tsx`
split). `components/AddCategoryModal.tsx` collects a name, validates/saves it via the
already-shipped `addCategory`, and reports success via a callback — then `components/
ExpenseForm.tsx` gains a "+ Add New" dropdown entry that mounts it. `components/
CategoryManager.tsx` lists every category (defaults read-only, customs with Rename/Delete calling
the already-shipped `renameCategory`/`deleteCategory`) — then `app/categories/page.tsx` drops its
placeholder and mounts it behind the same trip-gated shell every other nav-destination route
already uses.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage — no backend, no database. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build`. No test runner is installed (verified: `package.json` has no
`test` script; `node_modules/.bin` contains only `eslint`, `next`, `tsc`).

**Negative constraints (from `doc/spec/010.manage-expense-categories.md` §1.6, §2.1, §6):**
- Will NOT change any function in `lib/categories.ts` — `addCategory`, `renameCategory`,
  `deleteCategory`, `getAllCategories`, `isDefaultCategoryName`, `DEFAULT_CATEGORIES` are complete
  and already shipped (commits `02855e0`, `54f7894`, `f6f171f`, `dca14d1`); this plan only builds UI
  on top of them.
- Will NOT add a confirmation dialog before deleting a custom category — not requested by any
  scenario (spec §6 Challenge 1).
- Will NOT add an "add category" control anywhere on `/categories` — adding only happens via the
  record-expense dropdown's "+ Add New" entry.
- Will NOT add fuzzy/similarity duplicate detection beyond `addCategory`'s existing exact,
  case-insensitive check (spec §6 Challenge 4).
- Will NOT touch, reference, or build upon the unrelated uncommitted dark-mode theming refactor
  currently sitting in the working tree — none of this plan's tasks touch any of those files or
  their new tokens/classes.
- Will NOT change `lib/expenses.ts`'s validation or submission logic — `ExpenseForm.tsx`'s changes
  are additive (a new dropdown entry, a new state, a mounted modal), not a rewrite of its existing
  submit/validation flow.

**Assumptions:**
- Assumed: `AddCategoryModal`/`CategoryManager` follow `components/ExchangeRateForm.tsx`'s
  `RateInput`-style self-contained pattern (collect a value, validate/save it directly, report
  success via a callback) rather than the pure-confirmation `NewTripConfirm`/`ResetAppDataConfirm`
  pattern — per the spec's own §6 Challenge 2 resolution, since both new components collect and
  validate data, which the confirmation-only precedent doesn't do.
- Assumed: new UI is built against the *committed* `app/globals.css` baseline
  (`--background`/`--foreground` only), matching every prior feature's practice in this session, not
  the uncommitted theming refactor. Tokens like `--border` are still used for visual structure where
  this codebase's own recent, already-shipped code (`Dashboard.tsx`) already does the same, per the
  spec's own §2.6 non-functional note.

---

### Task 1: [UI] — AddCategoryModal collects and validates a new category name

**Files**
- create: `components/AddCategoryModal.tsx`
- modify: `REFERENCE.md` (add a `components/AddCategoryModal.tsx` entry to the §4 file tree)
- create (temporary, deleted within this task): `components/AddCategoryModal.probe.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

> This task creates the modal as a standalone component, verified only by the compiler/lint/build —
> it is not mounted into `ExpenseForm.tsx` until Task 2, the same "build the component, wire the
> parent next" split already used for `CategoryPieChart`/`Dashboard` in feature 009.

- [x] **Step 1 — Write the failing check.** Create `components/AddCategoryModal.probe.tsx`
      containing exactly one line:

      ```tsx
      import AddCategoryModal from "@/components/AddCategoryModal";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `components/AddCategoryModal.probe.tsx(1,30): error TS2307: Cannot find module '@/components/AddCategoryModal' or its corresponding type declarations.`
      (Column 30 via this repo's verified formula: `import <Name> from "<path>";` puts the opening
      quote at column `14 + length(<Name>)`; `"AddCategoryModal"` is 16 characters, so
      `14 + 16 = 30`.)

- [x] **Step 3 — Implement the component.** Create `components/AddCategoryModal.tsx`. `'use
      client'` (it owns `useState`, matching every other hook-using standalone component file in
      this codebase — e.g. `TripSetupForm.tsx`):

      ```tsx
      "use client";

      import { useState, type FormEvent } from "react";
      import { addCategory } from "@/lib/categories";

      export default function AddCategoryModal({
        onAdded,
        onCancel,
      }: {
        onAdded: (name: string) => void;
        onCancel: () => void;
      }) {
        const [name, setName] = useState("");
        const [error, setError] = useState<string | null>(null);

        function handleSubmit(e: FormEvent) {
          e.preventDefault();
          const result = addCategory(name);
          if (!result.ok) {
            if (result.reason === "duplicate") {
              setError("This category already exists.");
            } else if (result.reason === "storage") {
              setError(result.error);
            } else {
              setError("Enter a category name.");
            }
            return;
          }
          onAdded(name.trim());
        }

        return (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <form
              onSubmit={handleSubmit}
              className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-(--background) p-4"
            >
              <h2 className="text-xl font-semibold">Add category</h2>
              <div className="flex flex-col gap-1">
                <label htmlFor="newCategoryName">Category name</label>
                <input
                  id="newCategoryName"
                  type="text"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {error && <p role="alert">{error}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <button type="submit">Add</button>
                <button type="button" onClick={onCancel}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        );
      }
      ```

      **Why `z-50` is required, not optional:** `app/layout.tsx` renders `<div>{children}</div>`
      then `<BottomNav />` as siblings under `<body>`; `BottomNav` is itself `fixed inset-x-0
      bottom-0` with an opaque background and no `z-index` of its own. Neither element establishes
      a stacking context, so without an explicit `z-index` on this modal, plain DOM order decides
      paint order — and `BottomNav`, being later in the DOM, would paint on top of the modal's
      bottom edge, visually covering part of the dialog and leaving the nav's own links clickable
      underneath what's supposed to be a modal. This is this app's first `position: fixed` overlay
      (`NewTripConfirm.tsx`/`ResetAppDataConfirm.tsx` are inline panels, not overlays), so there is
      no existing z-index convention to fall back on; `z-50` gives this modal a higher explicit
      stacking value than `BottomNav`'s implicit `auto` (~0), which is sufficient since both are
      direct descendants of the same stacking context (`<body>`).

- [x] **Step 4 — Delete the probe.** Remove `components/AddCategoryModal.probe.tsx`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Update REFERENCE.md.** Add a `components/AddCategoryModal.tsx` entry to
      REFERENCE.md §4's file tree, in the same style as the other `components/` entries, noting it
      takes `onAdded`/`onCancel` props, calls `addCategory` directly, maps its three possible
      failure reasons (`invalid`/`duplicate`/`storage`) to an inline `role="alert"` message, and
      that it is not yet mounted anywhere.
      `git diff REFERENCE.md`
      Expected: the diff includes a new `components/AddCategoryModal.tsx` line, and no line this
      task itself didn't intend to touch. **Note:** this working tree may already carry an
      unrelated, pre-existing uncommitted change to REFERENCE.md (a `design.md` read-order
      addition, from separate in-progress work) — if so, that diff will also appear here and is not
      a mismatch; only this task's own new line is what to verify and stage (`git add -p` if
      entangled).

- [x] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same 8-route table feature 014 left it at:
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
      `git add components/AddCategoryModal.tsx REFERENCE.md && git commit`
      Message: `feat(010): add AddCategoryModal for adding a custom category`

---

### Task 2: [UI] — ExpenseForm wires "+ Add New" into the category dropdown

**Files**
- modify: `components/ExpenseForm.tsx`
- modify: `REFERENCE.md` (rewrite the `components/ExpenseForm.tsx` §4 file-tree entry)
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Wire the modal into the form.** Read `components/ExpenseForm.tsx` first — via
      `git show HEAD:components/ExpenseForm.tsx`, not the working-tree copy. **This working tree's
      unrelated, uncommitted dark-mode theming refactor already touches this exact file** (`git
      diff --stat components/ExpenseForm.tsx` is expected to show changes, unlike the clean
      precondition checks in other tasks) — reformatting a few handlers and adding
      `className="btn-primary"` to the submit button. That is a different, separate change this
      plan is not part of and does not build on (per this plan's own negative constraints). The
      code block below is written against the **committed** `HEAD` version and intentionally
      supersedes those uncommitted edits on this one file when applied — replacing the whole file
      is correct here, not a mistake to work around. (This mirrors every other feature in this
      session's established practice of building new work against the committed baseline rather
      than an in-progress, unrelated, unlanded refactor.) Keep every existing field, `handleSubmit`,
      and the `useUnsavedChangesWarning`/dirty-check logic verbatim relative to the **committed**
      version. Replace the whole file with:

      ```tsx
      "use client";

      import { useState, type FormEvent } from "react";
      import { useRouter } from "next/navigation";
      import type { Trip } from "@/lib/types";
      import { getSupportedCurrencies } from "@/lib/countries";
      import { getAllCategories } from "@/lib/categories";
      import { getExpenses, saveExpenses } from "@/lib/storage";
      import useUnsavedChangesWarning from "@/hooks/useUnsavedChangesWarning";
      import {
        getInitialExpenseFormValues,
        validateExpenseForm,
        submitExpense,
        PAYMENT_METHODS,
        EXPENSE_SAVED_FLAG_KEY,
        type ExpenseFormValues,
        type ExpenseValidationResult,
      } from "@/lib/expenses";
      import AddCategoryModal from "@/components/AddCategoryModal";

      const ADD_NEW_CATEGORY = "__add_new_category__";

      export default function ExpenseForm({ trip }: { trip: Trip }) {
        const router = useRouter();
        const today = new Date().toISOString().slice(0, 10);
        const [values, setValues] = useState<ExpenseFormValues>(() =>
          getInitialExpenseFormValues(trip, today)
        );
        const [initialValues] = useState(values);
        const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);
        useUnsavedChangesWarning(isDirty);
        const [errors, setErrors] = useState<ExpenseValidationResult["errors"]>({});
        const [saveError, setSaveError] = useState<string | null>(null);

        const [categories, setCategories] = useState(() => getAllCategories());
        const [showAddCategory, setShowAddCategory] = useState(false);
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
          <>
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
                  onChange={(e) => {
                    if (e.target.value === ADD_NEW_CATEGORY) {
                      setShowAddCategory(true);
                      return;
                    }
                    setValues({ ...values, category: e.target.value });
                  }}
                >
                  <option value={ADD_NEW_CATEGORY}>+ Add New</option>
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

            {showAddCategory && (
              <AddCategoryModal
                onAdded={(name) => {
                  setCategories(getAllCategories());
                  setValues({ ...values, category: name });
                  setShowAddCategory(false);
                }}
                onCancel={() => setShowAddCategory(false)}
              />
            )}
          </>
        );
      }
      ```

      **Critical detail:** `AddCategoryModal` renders its own `<form>` internally (Task 1). It MUST
      be rendered as a **sibling** of the expense `<form>` (both wrapped in a `<>...</>` fragment, as
      above) — never nested inside the expense `<form>` element. Nested `<form>` elements are
      invalid HTML; the browser silently closes the outer form early, which would corrupt the
      expense form's own submit behavior. This is why the return value changes from a single
      `<form>` to a fragment wrapping `<form>` and the conditional modal as two siblings.

      **Second critical detail:** the `<select>`'s `onChange` only calls `setValues` for the
      `category` field when the chosen value is *not* the sentinel. Since `value={values.category}`
      makes this a controlled input, choosing "+ Add New" without ever writing the sentinel into
      `values.category` means React re-renders the `<select>` back to whatever `values.category`
      already was — this is the entire mechanism satisfying "selecting + Add New doesn't change the
      current selection," not a separate revert step.

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output.

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with the same route table as Task 1 (no new route — `/expenses/new`
      already exists).

- [x] **Step 5 — Manual check: the Add New flow end to end.** No browser-automation tool may be
      available in this environment — if so, state that plainly instead of asserting these passed;
      do your best effort with whatever tooling exists.

      **5a. Default categories are still listed (AC-010-01, UT-010-11 — regression).** Open
      `http://localhost:3000/expenses/new` and open the category dropdown.
      Expected: Food, Transport, Accommodation, Shopping, Activities, and Others are all still
      present and selectable, unchanged by this task's dropdown modifications.

      **5b. "+ Add New" is first (AC-010-02).** Open the category dropdown again.
      Expected: "+ Add New" is the very first entry, before "Select a category" and every real
      category.

      **5c. Opening "+ Add New" doesn't disturb the current selection, and adding a unique category
      selects it (AC-010-03, AC-010-04).** Select an existing category (e.g. "Food"), then choose
      "+ Add New" from the dropdown.
      Expected: a modal opens; the dropdown itself still shows "Food" underneath (it will become
      visible again once the modal closes). In the modal, type a new, unique name (e.g.
      "Souvenirs") and confirm.
      Expected: the modal closes; the category field now shows "Souvenirs" selected (not "Food");
      opening the dropdown again lists "Souvenirs" among the real categories.

      **5d. Duplicate and blank names are rejected (AC-010-05, AC-010-06).** Open "+ Add New" again.
      Enter a name matching an existing category in a different case (e.g. "food") and confirm.
      Expected: a validation message appears in the modal; it stays open; the dropdown is unchanged.
      Clear the field entirely and confirm.
      Expected: a validation message appears; nothing is saved.

      **5e. Cancelling changes nothing (AC-010-07).** Select "Food" again, open "+ Add New", type
      some text, then click "Cancel".
      Expected: the modal closes; the category field still shows "Food"; nothing new was saved
      (open the dropdown to confirm no extra category appeared).

      **5f. The modal renders above the bottom nav, not underneath it.** Open "+ Add New" on a
      device/viewport short enough that the bottom nav bar and the modal's dialog box would
      otherwise occupy overlapping screen space (or just check on a typical phone-width viewport).
      Expected: the modal's dialog box and backdrop are fully visible on top of the bottom nav; the
      Home/Add Expense/Categories/Settings links are not visible or clickable through the modal.

- [x] **Step 6 — Update REFERENCE.md.** Rewrite the `components/ExpenseForm.tsx` §4 file-tree entry
      to mention: the categories list is now stateful (refreshed after a successful add), the
      "+ Add New" sentinel-valued first `<option>`, and that selecting it mounts
      `AddCategoryModal` as a sibling of the form (never nested inside it) without ever writing the
      sentinel into form state.
      `git diff REFERENCE.md`
      Expected: the diff includes a change to the `components/ExpenseForm.tsx` entry, and no line
      this task itself didn't intend to touch. **Note:** this working tree may already carry an
      unrelated, pre-existing uncommitted change to REFERENCE.md — if so, only this task's own
      `ExpenseForm.tsx` hunk is what to verify and stage (`git add -p` if entangled).

- [x] **Step 7 — Commit.**
      `git add components/ExpenseForm.tsx REFERENCE.md && git commit`
      Message: `feat(010): add "+ Add New" to the record-expense category dropdown`

---

### Task 3: [UI] — CategoryManager lists categories with rename/delete for custom ones

**Files**
- create: `components/CategoryManager.tsx`
- modify: `REFERENCE.md` (add a `components/CategoryManager.tsx` entry to the §4 file tree)
- create (temporary, deleted within this task): `components/CategoryManager.probe.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

> Standalone component, not yet mounted into `app/categories/page.tsx` until Task 4 — same split as
> Task 1/2.

- [x] **Step 1 — Write the failing check.** Create `components/CategoryManager.probe.tsx`
      containing exactly one line:

      ```tsx
      import CategoryManager from "@/components/CategoryManager";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `components/CategoryManager.probe.tsx(1,29): error TS2307: Cannot find module '@/components/CategoryManager' or its corresponding type declarations.`
      (Column 29: `"CategoryManager"` is 15 characters, `14 + 15 = 29`.)

- [x] **Step 3 — Implement the component.** Create `components/CategoryManager.tsx`. `'use
      client'`:

      ```tsx
      "use client";

      import { useState, type FormEvent } from "react";
      import {
        getAllCategories,
        isDefaultCategoryName,
        renameCategory,
        deleteCategory,
      } from "@/lib/categories";

      export default function CategoryManager() {
        const [categories, setCategories] = useState(() => getAllCategories());
        const [editingName, setEditingName] = useState<string | null>(null);
        const [renameValue, setRenameValue] = useState("");
        const [renameError, setRenameError] = useState<string | null>(null);
        const [deleteError, setDeleteError] = useState<string | null>(null);
        const customCategoryCount = categories.filter(
          (c) => !isDefaultCategoryName(c.name)
        ).length;

        function startRename(name: string) {
          setEditingName(name);
          setRenameValue(name);
          setRenameError(null);
          setDeleteError(null);
        }

        function cancelRename() {
          setEditingName(null);
          setRenameError(null);
        }

        function handleRenameSubmit(e: FormEvent, oldName: string) {
          e.preventDefault();
          const result = renameCategory(oldName, renameValue);
          if (!result.ok) {
            if (result.reason === "duplicate") {
              setRenameError("This category already exists.");
            } else if (result.reason === "storage") {
              setRenameError(result.error);
            } else if (result.reason === "invalid") {
              setRenameError("Enter a category name.");
            } else {
              // "default" or "not-found" shouldn't normally happen — rename is only offered for
              // a custom category that was present in the list a moment ago — but could arise
              // from a concurrent change elsewhere (e.g. another tab deleting it mid-edit).
              setRenameError("This category could not be renamed. It may have been changed elsewhere.");
            }
            return;
          }
          setCategories(getAllCategories());
          setEditingName(null);
          setRenameError(null);
          setDeleteError(null);
        }

        function handleDelete(name: string) {
          const result = deleteCategory(name);
          if (!result.ok) {
            setDeleteError(
              result.reason === "storage" ? result.error : "Could not delete this category."
            );
            return;
          }
          setDeleteError(null);
          setRenameError(null);
          setCategories(getAllCategories());
        }

        return (
          <div className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">Categories</h1>
            {deleteError && <p role="alert">{deleteError}</p>}
            <ul className="flex flex-col divide-y divide-(--border)">
              {categories.map((category) => {
                const isDefault = isDefaultCategoryName(category.name);
                const isEditing = editingName === category.name;

                if (isEditing) {
                  return (
                    <li key={category.name} className="py-2">
                      <form
                        onSubmit={(e) => handleRenameSubmit(e, category.name)}
                        className="flex flex-col gap-1"
                      >
                        <label htmlFor={`rename-${category.name}`}>Category name</label>
                        <input
                          id={`rename-${category.name}`}
                          type="text"
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                        />
                        {renameError && <p role="alert">{renameError}</p>}
                        <div className="flex flex-col gap-2">
                          <button type="submit">Save</button>
                          <button type="button" onClick={cancelRename}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    </li>
                  );
                }

                return (
                  <li
                    key={category.name}
                    className="flex items-center justify-between gap-2 py-2"
                  >
                    <span>{category.name}</span>
                    {!isDefault && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startRename(category.name)}>
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(category.name)}
                          className="text-[var(--danger)]"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {customCategoryCount === 0 && (
              <p>No custom categories yet. Add one from the record-expense page.</p>
            )}
          </div>
        );
      }
      ```

      Each row's rename `<form>` is not nested inside any other `<form>` (the page has no outer
      form), so there is no nested-form validity concern here, unlike Task 2.

- [x] **Step 4 — Delete the probe.** Remove `components/CategoryManager.probe.tsx`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Update REFERENCE.md.** Add a `components/CategoryManager.tsx` entry to
      REFERENCE.md §4's file tree, in the same style as other `components/` entries, describing: it
      lists every category via `getAllCategories()`, shows no actions for defaults
      (`isDefaultCategoryName`), offers inline Rename (`renameCategory`) and direct
      no-confirmation, danger-styled Delete (`deleteCategory`) for custom ones, shows a
      "No custom categories yet." message when none exist, and cross-clears any stale rename/delete
      error when a different mutation succeeds; not yet mounted in any route.
      `git diff REFERENCE.md`
      Expected: the diff includes a new `components/CategoryManager.tsx` line, and no line this
      task itself didn't intend to touch. **Note:** as in Task 1, an unrelated pre-existing
      uncommitted REFERENCE.md diff may already be present — not this task's concern.

- [x] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same route table as Task 1 (this
      component is not yet mounted in any route).

- [x] **Step 8 — Commit.**
      `git add components/CategoryManager.tsx REFERENCE.md && git commit`
      Message: `feat(010): add CategoryManager for renaming and deleting custom categories`

---

### Task 4: [Route] — app/categories/page.tsx mounts CategoryManager

**Files**
- modify: `app/categories/page.tsx`
- modify: `REFERENCE.md` (rewrite the `app/categories/page.tsx` §4 file-tree entry)
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Replace the placeholder.** Replace the whole file with:

      ```tsx
      "use client";

      import { useEffect, useState, useSyncExternalStore } from "react";
      import { useRouter } from "next/navigation";
      import type { Trip } from "@/lib/types";
      import { getTrip } from "@/lib/storage";
      import CategoryManager from "@/components/CategoryManager";

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

      export default function CategoriesPage() {
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

        return <CategoryManager />;
      }
      ```

      (This mirrors `app/settings/page.tsx`'s and `app/trip/edit/page.tsx`'s trip-gated shell
      pattern exactly. `trip` itself is never passed to `CategoryManager` — categories aren't
      trip-scoped data — it exists only to gate the redirect, matching this app's precondition that
      every nav-destination route requires an active trip.)

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output.

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with the same route table as Task 1 (no new route — `/categories`
      already exists as a route, previously showing only a placeholder).

- [x] **Step 5 — Manual check: category management end to end.** No browser-automation tool may be
      available in this environment — if so, state that plainly instead of asserting these passed.

      **5a. Empty state before any custom category exists.** With an active trip that has no
      custom categories yet, open `http://localhost:3000/categories`.
      Expected: the six defaults are listed; below them, the text "No custom categories yet. Add
      one from the record-expense page." is shown (not a blank area).

      **5b. Every category is listed; defaults show no actions (AC-010-01, AC-010-11).** Add a
      custom category via `/expenses/new`'s "+ Add New" flow (Task 2), then reopen
      `/categories`.
      Expected: Food, Transport, Accommodation, Shopping, Activities, and Others are still listed
      with no Rename/Delete buttons next to them; the newly added custom category appears in the
      list with Rename and Delete buttons (Delete styled distinctly, matching this app's existing
      danger-action styling), and the empty-state text from 5a is gone.

      **5c. No add-category control exists on this page (AC-010-12).** On the same page.
      Expected: no button, link, or input anywhere on `/categories` offers to add a new category —
      only `/expenses/new`'s dropdown does.

      **5d. Renaming a custom category updates its expenses (AC-010-08).** Record an expense using a
      custom category (via `/expenses/new`), then go to `/categories` and rename that category.
      Expected: the rename saves; reopening the expense (via `/`'s recent transactions or
      `/expenses/{id}`) shows the new category name, not the old one.

      **5e. Deleting a used vs. unused custom category (AC-010-09, AC-010-10).** With one custom
      category used by an existing expense and another unused, delete each in turn from
      `/categories`.
      Expected: both disappear from `/categories` and from `/expenses/new`'s dropdown; the expense
      that used the deleted category still shows that category's original name on its detail page —
      nothing crashes, no blank category appears.

- [x] **Step 6 — Update REFERENCE.md.** Rewrite the `app/categories/page.tsx` §4 file-tree entry
      (currently the feature-015 placeholder description) to describe the trip-gated shell mounting
      `CategoryManager`.
      `git diff REFERENCE.md`
      Expected: the diff includes a change to the `app/categories/page.tsx` entry, and no line this
      task itself didn't intend to touch. **Note:** an unrelated pre-existing uncommitted
      REFERENCE.md diff may already be present — not this task's concern; only this task's own
      `app/categories/page.tsx` hunk is what to verify and stage (`git add -p` if entangled).

- [x] **Step 7 — Commit.**
      `git add app/categories/page.tsx REFERENCE.md && git commit`
      Message: `feat(010): mount CategoryManager on the categories route`

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
- `components/AddCategoryModal.tsx`: a fixed-overlay dialog (z-50, above the app's fixed
  `BottomNav`) collecting a category name, calling `addCategory` directly, reporting success via
  `onAdded(name)`. Commit `448b776`.
- `components/ExpenseForm.tsx`: a "+ Add New" first dropdown option, detected by position
  (`selectedIndex === 0`) rather than by value, mounting `AddCategoryModal` as a sibling of the
  form. Commit `1ba4518`.
- `components/CategoryManager.tsx`: lists every category, defaults read-only, custom categories get
  inline Rename and direct, no-confirmation, danger-styled Delete. Commit `e2193f6`.
- `app/categories/page.tsx`: replaced the feature-015 placeholder with the same trip-gated shell
  every other nav-destination route uses, mounting `CategoryManager`. Commit `c3bcc4f`.

**Deviations from the plan:**
- Task 1: Gate B's first pass FAILED on a false positive (claimed the modal's buttons needed
  `.btn-primary`/`.btn-secondary` classes, based on reading the working tree's separate, unrelated,
  uncommitted dark-mode refactor instead of the committed `HEAD` baseline). A re-review, given the
  exact `git show HEAD` evidence, confirmed the plain buttons are correct and passed.
- Task 2: Gate B's first pass FAILED on a real bug — the "+ Add New" sentinel value could collide
  with an actual category name a traveller typed, permanently hiding that category from selection.
  Fixed by switching detection from value comparison to `selectedIndex === 0`. The re-review that
  followed found a smaller, second gap (a stale REFERENCE.md description of the old detection
  mechanism), which the controller corrected directly rather than dispatching a third automated
  attempt.
- Task 4: Gate A's first pass FAILED on a pipeline-ordering misunderstanding — it flagged the
  absence of a commit/log entry/ticked checkboxes as gaps, all of which are the expected state
  before the controller commits. A re-review, given the pipeline explicitly clarified and the
  implementer's real manual-check report, passed.
- Every task's REFERENCE.md diff was entangled with an unrelated, pre-existing uncommitted
  `design.md` read-order addition from separate in-progress work elsewhere in the shared working
  tree. Every commit isolated only this plan's own hunks via `git add -p`, verified line-by-line
  before staging.
- Beyond the draft plan, three fixes were incorporated during `/writing-plans` review before any
  code was written: a `z-50` fix for the modal (this app's first fixed-position overlay, which
  would otherwise paint underneath the fixed, opaque `BottomNav`), a danger-styled Delete button and
  an empty-state message on `CategoryManager` (matching `design.md`'s own empty-state requirement),
  and cross-clearing of stale rename/delete errors.

**Follow-ups not in scope:**
- **RESIDUAL GAP**: no browser-automation tool exists in this environment, so every UI task's Step
  5 manual checks (opening "+ Add New," adding/selecting a category, duplicate/blank rejection,
  cancel leaving the selection unchanged, the modal rendering above the bottom nav, the
  category-management page's empty state, listing, no-add-control, rename-propagates-to-expenses,
  and delete-used-vs-unused behavior) could not be executed live. Every review gate traced the
  relevant scenario against the real code by hand as the deepest available substitute, and partial
  curl-based checks confirmed each route resolves without crashing, but a human should exercise all
  of AC-010-01 through AC-010-12 in an actual browser before treating feature 010 as fully verified
  end-to-end.
- Not acted on (per the spec's own Contrarian Challenge 4 and Pass B's Advisory findings): no fuzzy
  duplicate-name detection was added beyond `addCategory`'s existing exact, case-insensitive check;
  no cross-tab category-staleness handling was added (a pre-existing, app-wide gap this feature
  didn't introduce, consistent with every other piece of state in this single-tab-assumption app).

**Final verification (all four tasks, cumulative):**
- `npx tsc --noEmit`: exit 0, no output.
- `npm run lint`: exit 0, no output.
- `npm run build`: exit 0, unchanged 8-route table (`/`, `/_not-found`, `/categories`,
  `/expenses/[id]` marked `ƒ`, `/expenses/new`, `/settings`, `/trip/edit`, `/trip/new`).
- 8 of 8 review-gate passes across 4 tasks eventually returned PASS; 3 tasks required one
  fix-and-re-review cycle each (two false positives from misread baselines/pipeline state, one real
  bug found and fixed).
