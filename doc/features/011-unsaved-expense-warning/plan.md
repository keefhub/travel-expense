# Unsaved Expense Warning — Implementation Plan

**Status:** Complete
**Source:** `doc/spec/011.unsaved-expense-warning.md`
**Goal:** Warn a traveller before losing unsaved input on the record-expense page — via the
browser's native refresh/close prompt and a custom in-app navigate-away confirmation — but never
when the form is unmodified, and never during the form's own successful-save navigation.

**Architecture:**
A new hook, `hooks/useUnsavedChangesWarning(isDirty: boolean): void` (a new `hooks/` directory —
none exists yet), registers two effects only while `isDirty` is `true`: a `window` `beforeunload`
listener (covers refresh and tab/window close) and a `document`-level, capture-phase `click`
listener that detects a click on an in-app `<a href>` pointing to a different path, intercepts it,
and shows `window.confirm(...)` before performing a full-page navigation via
`window.location.assign(...)` on confirm. Both are Web Platform standards — no new dependency.
`components/ExpenseForm.tsx` computes `isDirty` by comparing its current `values` state against a
`useState`-captured snapshot of the values it started with (captured once, at mount, from the same
initial render that seeded `values` itself), and calls the new hook unconditionally. Feature 005's
own successful-save navigation (`router.push("/")`) needs no special-case code: neither of the
hook's listeners can fire for a `router.push` call — `beforeunload` doesn't fire for client-side
route transitions, and the click-listener only intercepts real anchor clicks, which a
`router.push()` call is not.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage — no backend, no database. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build`. No test runner is installed (verified: `package.json` has no
`test` script; `node_modules/.bin` contains only `eslint`, `next`, `tsc`).

**Negative constraints (from `doc/spec/011.unsaved-expense-warning.md` §1.6, §2.6, §7):**
- Will NOT auto-save or persist draft input — OVERVIEW confirms unsaved input is discarded on
  refresh; this feature only warns, it never recovers anything.
- Will NOT add this warning anywhere except the record-expense page — no other form in this app
  (trip setup, trip edit, categories, exchange rates) is in scope.
- Will NOT attempt to customize the `beforeunload` dialog's text — no modern browser honors a
  custom message; the warning's existence, not its wording, is what this feature can control.
- Will NOT add a router-blocking library or any new dependency — both mechanisms are Web Platform
  APIs already available in every target browser.
- Will NOT change anything in `lib/expenses.ts` (validation/submit contracts) — this is pure UI
  behavior layered on top of the already-complete feature 005 form.
- Will NOT distinguish the browser back/forward button as a separate case from any other in-app
  navigation — the source Gherkin doesn't ask for that distinction, and no Next.js API in this
  version exposes one.
- Will NOT touch feature 006's additions (`lib/currency.ts`, `app/settings/page.tsx`,
  `app/page.tsx`'s currency-spending section) — verified via `git diff` that feature 006 never
  touched `components/ExpenseForm.tsx`, and this plan doesn't touch any feature-006 file either.

**Assumptions (from spec §1.3, §2.1, §6, §7 — carried forward, cheap to reverse if wrong):**
- Assumed: "unsaved input" means the form's current values differ from its initial snapshot, not
  "any field is non-blank" — the date and currency fields both start non-blank by design
  (`getInitialExpenseFormValues`), so blankness alone can't be the dirty signal (BR-011-08).
- Assumed: a confirmed in-app navigate-away uses `window.location.assign` (a full page reload)
  rather than the App Router's client-side transition, since the hook has no access to the
  `router` instance without becoming component-coupled, and this only affects the rare
  explicitly-confirmed-discard path (spec §6 Challenge 3, left as an open, low-stakes tradeoff).
- Assumed: the confirmation prompt's copy ("Leaving this page will discard your unsaved expense.
  Continue?") is SA-authored, not literal spec text — cheap, one-line change if different wording
  is wanted (spec §7 item 3).

---

### Task 1: [UI] — useUnsavedChangesWarning warns on refresh/close while dirty

**Files**
- create: `hooks/useUnsavedChangesWarning.ts`
- create (temporary, deleted within this task): `hooks/useUnsavedChangesWarning.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `hooks/useUnsavedChangesWarning.probe.ts`
      containing exactly:

      ```ts
      import useUnsavedChangesWarning from "@/hooks/useUnsavedChangesWarning";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `hooks/useUnsavedChangesWarning.probe.ts(1,38): error TS2307: Cannot find module '@/hooks/useUnsavedChangesWarning' or its corresponding type declarations.`
      (Verified empirically against this exact repo state before writing this plan.)

- [x] **Step 3 — Implement.** Create `hooks/useUnsavedChangesWarning.ts`:

      ```ts
      import { useEffect, useRef } from "react";

      export default function useUnsavedChangesWarning(isDirty: boolean): void {
        const isDiscardingRef = useRef(false);

        useEffect(() => {
          if (!isDirty) return;

          function handleBeforeUnload(event: BeforeUnloadEvent) {
            if (isDiscardingRef.current) return;
            event.preventDefault();
            event.returnValue = "";
          }

          window.addEventListener("beforeunload", handleBeforeUnload);
          return () => window.removeEventListener("beforeunload", handleBeforeUnload);
        }, [isDirty]);
      }
      ```

      No `'use client'` directive is needed on this file — it exports a plain function, not a
      component, and it will only ever be imported by an already-`'use client'` component (Task 3);
      matching how `lib/trip.ts`/`lib/expenses.ts` also need no directive of their own.

      `isDiscardingRef` is declared now, unused by anything in this task, because Task 2's
      click-interception effect needs to set it to `true` immediately before triggering a confirmed
      navigation — otherwise (found during plan review, not by any automated check) the
      `beforeunload` listener registered here is still attached when that navigation's real
      `document` unload fires, showing the browser's *native* leave-confirmation a second time right
      after the user already confirmed the app's own custom dialog; cancelling that second, unwanted
      dialog would strand the user on the page despite having already agreed to leave — a direct
      violation of BR-011-06 ("Confirming that navigation leaves the record-expense page ... "
      unconditionally once confirmed). Reading/writing `.current` here happens only inside an effect
      callback and an event handler, never during render, so this does not trip the
      `react-hooks/refs` rule Task 3 documents (that rule only rejects reading `ref.current` in the
      render body itself).

- [x] **Step 4 — Delete the probe.** Remove `hooks/useUnsavedChangesWarning.probe.ts`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as before this task
      (no new route added; this hook isn't imported anywhere yet):
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
      (Seven routes — verified empirically against this exact repo state, after feature 006's
      commits, before writing this plan.)

- [x] **Step 7 — Commit.**
      `git add hooks/useUnsavedChangesWarning.ts && git commit`
      Message: `feat(011): add beforeunload warning for a dirty expense form`

---

### Task 2: [UI] — useUnsavedChangesWarning intercepts in-app navigation while dirty

**Files**
- modify: `hooks/useUnsavedChangesWarning.ts`
- create (temporary, deleted within this task): `hooks/useUnsavedChangesWarning.click.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `hooks/useUnsavedChangesWarning.click.probe.ts`
      containing exactly:

      ```ts
      import useUnsavedChangesWarning from "@/hooks/useUnsavedChangesWarning";

      // Confirms the module still resolves after Task 1; the real red signal for this task
      // is behavioral (a second effect), not a new export, so there is no new compiler error to
      // provoke here. This step exists to record the state before Step 3's change, matching this
      // plan's test-first convention as closely as a same-file, same-signature addition allows.
      const probe: (isDirty: boolean) => void = useUnsavedChangesWarning;
      void probe;
      ```

- [x] **Step 2 — Run it and confirm it passes (not a red step — see Step 1's comment).**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Delete the probe.** Remove `hooks/useUnsavedChangesWarning.click.probe.ts`.

- [x] **Step 4 — Implement.** Append a second `useEffect` inside
      `useUnsavedChangesWarning`'s function body, after the existing `beforeunload` effect's
      closing `}, [isDirty]);` and before the function's own final closing `}`:

      ```ts
        useEffect(() => {
          if (!isDirty) return;

          function handleClick(event: MouseEvent) {
            if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

            const target = event.target;
            if (!(target instanceof Element)) return;

            const anchor = target.closest("a[href]");
            if (!anchor) return;

            if (anchor.hasAttribute("target") && anchor.getAttribute("target") !== "_self") return;
            if (anchor.hasAttribute("download")) return;

            const href = anchor.getAttribute("href");
            if (!href) return;

            const destination = new URL(href, window.location.href);
            if (destination.origin !== window.location.origin) return;
            if (destination.pathname === window.location.pathname) return;

            event.preventDefault();
            event.stopImmediatePropagation();

            const confirmed = window.confirm(
              "Leaving this page will discard your unsaved expense. Continue?"
            );
            if (confirmed) {
              isDiscardingRef.current = true;
              window.location.assign(destination.href);
            }
          }

          document.addEventListener("click", handleClick, true);
          return () => document.removeEventListener("click", handleClick, true);
        }, [isDirty]);
      ```

      Rule-to-code mapping (for review): the capture-phase (`true` as the third argument to
      `addEventListener`) listener runs before Next.js's own `<Link>` click handler (registered in
      the bubble phase later), so `stopImmediatePropagation()` reliably prevents a client-side
      transition from starting → BR-011-05. `target.closest("a[href]")` finds the nearest enclosing
      anchor regardless of which inner element (a span, an icon) was actually clicked, matching how
      `<Link>` renders a real `<a>` per the vendored docs (`node_modules/next/dist/docs/01-app/
      03-api-reference/02-components/link.md`: "`<Link>` ... extends the HTML `<a>` element" —
      confirmed while drafting the spec). `new URL(href, window.location.href)` resolves a relative
      `href` (e.g. `"/"`) against the current location so `.origin`/`.pathname` are always
      well-formed, even though every link in this app is same-origin and relative. The
      same-pathname check (`destination.pathname === window.location.pathname`) is the "clicking a
      link to the current page never warns" edge case → the AC-011-11 same-page case (§1.5).
      Cross-origin links (none exist in this app today, but the check costs nothing) are left
      alone entirely — never intercepted, matching that this feature only concerns navigating away
      from *this app's own* record-expense page.

      The `event.button`/`ctrlKey`/`metaKey`/`shiftKey`/`altKey` guard and the `target="_blank"`-
      style/`download`-attribute anchor checks (all found during `/sdd` execution's Gate B review,
      cross-referenced against `node_modules/next/dist/client/link.js`'s own `isModifiedEvent`/
      `linkClicked` guard set — not requested by any AC) preserve the browser's native "open in a
      new tab/window" and "download this file" gestures — without them, a user middle-clicking,
      Ctrl/Cmd/Shift/Alt-clicking, or clicking a `download`-attributed nav link while the form is
      dirty would have that intent silently destroyed: the click would be intercepted, confirmed,
      and turned into a same-tab `window.location.assign`, closing the current tab's in-progress
      page instead of opening a new one or downloading a file. `isDiscardingRef.current = true`
      immediately before `window.location.assign(...)` is the other half of the Task 1 fix — without
      it, the `beforeunload` listener (still attached, since `isDirty` hasn't changed at this point)
      would show a second, native "leave site?" dialog immediately after the user already confirmed
      this custom one.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as Task 1 (still
      not imported anywhere).

- [x] **Step 7 — Commit.**
      `git add hooks/useUnsavedChangesWarning.ts && git commit`
      Message: `feat(011): intercept in-app navigation away from a dirty expense form`

---

### Task 3: [UI] — ExpenseForm tracks dirtiness and calls the warning hook

**Depends on Tasks 1–2** (the complete `hooks/useUnsavedChangesWarning.ts`).

**Files**
- modify: `components/ExpenseForm.tsx`
- create (temporary, deleted within this task): `components/ExpenseForm.dirty.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Write the failing check.** Create `components/ExpenseForm.dirty.probe.ts`
      containing exactly:

      ```ts
      import useUnsavedChangesWarning from "@/hooks/useUnsavedChangesWarning";

      const probe: (isDirty: boolean) => void = useUnsavedChangesWarning;
      void probe;
      ```

- [x] **Step 2 — Run it and confirm it passes (this constant already exists from Tasks 1–2 — this
      step confirms the import path before wiring it into `ExpenseForm.tsx`, not a red step).**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Delete the probe.** Remove `components/ExpenseForm.dirty.probe.ts`.

- [x] **Step 4 — Implement.** In `components/ExpenseForm.tsx`:
      1. Add `import useUnsavedChangesWarning from "@/hooks/useUnsavedChangesWarning";` to the
         imports (after the existing `import { getExpenses, saveExpenses } from "@/lib/storage";`
         line).
      2. Immediately after the existing
         `const [values, setValues] = useState<ExpenseFormValues>(() => getInitialExpenseFormValues(trip, today));`
         block, add:

      ```tsx
      const [initialValues] = useState(values);
      const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);
      useUnsavedChangesWarning(isDirty);
      ```

      **Do not** use `useRef` for `initialValues` — an earlier draft of this task did, and this
      repo's ESLint config rejects reading `ref.current` during render
      (`react-hooks/refs`, verified empirically while drafting this plan: `Error: Cannot access
      refs during render ... Passing a ref to a function may read its value during render`, exit 1).
      `useState(values)` (non-lazy form) captures the same "value at mount" semantics without that
      violation, since reading state during render is exactly what state is for.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the same seven-route table as Task 1.

- [ ] **Step 7 — Manual check: the full warning matrix (AC-011-01 through AC-011-11).** Before
      starting, check whether a browser-automation tool (Playwright, Puppeteer, an MCP browser
      tool, or similar) is actually available in the environment executing this task — do not
      assume none exists just because earlier features' plans found none. If one is available, use
      it to drive these steps for real and record its actual output against each `Expected:` line
      below. If none is available, mark this step "NOT PERFORMED (no browser automation tool
      available in this environment)" explicitly — do not silently skip it without saying so.

      With an active trip saved, run `npm run dev` and open `http://localhost:3000/expenses/new`
      for each row below, reloading between rows so dirty-state doesn't carry over:

      **7a. An unmodified form does not warn on refresh (AC-011-01).** Without touching any field,
      trigger a browser refresh (Ctrl+R / Cmd+R).
      Expected: the page refreshes immediately with no confirmation dialog.

      **7b. A modified form warns on refresh (AC-011-02, 03, 04).** Type anything into the Location
      field, then trigger a refresh.
      Expected: the browser's native "Leave site? Changes you made may not be saved" (or equivalent
      browser-specific wording — see spec §2.6) dialog appears. Cancel it.
      Expected: the page does not reload; the typed Location value is still visible.
      Trigger the refresh again and confirm it this time.
      Expected: the page reloads and the form shows its default, freshly-initialized values (blank
      Location, date reset to today) — the earlier Location text is gone and does not reappear on
      this or any later visit (BR-011-10, AC-011-03).

      **7c. An unmodified form does not warn on in-app navigation (AC-011-08).** Without touching
      any field, click "Home" in the bottom navigation.
      Expected: the browser navigates to `/` immediately, no confirmation prompt.

      **7d. A modified form warns before in-app navigation, and both outcomes work (AC-011-05, 06,
      07).** Type into the Amount field, then click "Categories" in the bottom navigation.
      Expected: a confirmation dialog appears ("Leaving this page will discard your unsaved expense.
      Continue?" or the exact text implemented); the browser has not navigated yet. Cancel it.
      Expected: the browser remains on `/expenses/new`; the typed Amount value is still visible.
      Click "Categories" again and confirm this time.
      Expected: the browser navigates to `/categories` — and the confirmation itself was resolved
      after a single dialog (not a second, native one immediately following it — that second dialog
      would indicate the discard-flag fix in Task 2 regressed). Navigate to "Add Expense" again.
      Expected: the record-expense page shows its default, freshly-initialized values — the earlier
      Amount value is gone and was not preserved anywhere (BR-011-10, AC-011-06's second clause).

      **7e. Reverting a field clears dirtiness (AC-011-10).** Type into the Location field, then
      clear it back to empty (its initial value), then click "Settings" in the bottom navigation.
      Expected: no confirmation prompt appears; the browser navigates to `/settings` immediately.

      **7f. Clicking a link to the current page never warns (AC-011-11).** Type into the Amount
      field, then click "Add Expense" in the bottom navigation (the link to the page already
      showing).
      Expected: no confirmation prompt appears.

      **7g. A successful save never shows the navigate-away prompt (AC-011-09).** Fill in every
      mandatory field with valid values (amount, currency, category, date, payment method,
      location), then click "Save expense."
      Expected: the browser navigates directly to `/` with the "Expense saved." message; no
      navigate-away confirmation dialog ever appeared during this save.

- [x] **Step 8 — Commit.**
      `git add components/ExpenseForm.tsx && git commit`
      Message: `feat(011): warn before losing unsaved input on the expense form`
      (If Step 7 could not be performed because no browser automation tool is available in this
      environment, say so explicitly in the commit body and in `log.txt`, matching the disclosure
      precedent set in feature 003's and 005's plans.)

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

    feat(011): warn before losing unsaved input on the expense form

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: doc/spec/011.unsaved-expense-warning.md

Never commit on a failing lint, typecheck, or build.

## Completion Summary

**Completed:** 2026-09-11
**Tasks:** 3 of 3

**What was built:**
A new `hooks/useUnsavedChangesWarning.ts` (the first `hooks/` module in this repo), which while a
form is dirty registers a native `beforeunload` prompt for refresh/close and a `document`-level
capture-phase click listener that intercepts in-app anchor navigation with a custom confirm prompt —
while preserving the browser's native open-in-new-tab/window and download gestures. `components/
ExpenseForm.tsx` now tracks dirtiness against its initial values and calls this hook unconditionally.
A traveller can no longer silently lose in-progress expense input to an accidental refresh or nav-away
click; an unmodified form, a reverted field, and the form's own successful-save navigation never
trigger a warning.

**Deviations from the plan:**
- Task 2: Gate B (code-quality review, cross-referencing Next.js's own `<Link>` click handler) found
  two real gaps in the click interceptor's guard set — a missing `event.altKey` check and no check
  for an anchor's `download` attribute, either of which would have silently hijacked a native
  browser gesture into an app navigation while the form was dirty. Both fixed; both gates re-ran
  clean (log.txt, Task 2).
- Task 3's Step 7 (the full AC-011-01 through AC-011-11 manual browser matrix) was **NOT
  PERFORMED** — no browser automation tool is available in this environment. Both review gates
  traced every relevant code path by hand against the real committed code as a substitute, but that
  is not equivalent to an actual browser run.
- A double-confirmation-dialog bug (a still-attached `beforeunload` listener firing a second, native
  dialog immediately after a user already confirmed the app's custom in-app-navigation dialog) was
  caught during `/writing-plans`' own adversarial review, before any task was implemented, and
  designed around from Task 1 onward via a shared `isDiscardingRef` — not a deviation from the plan
  as executed, but worth noting as the single most consequential finding of this feature's whole
  review process.

**Follow-ups not in scope here:**
- **A human should run Task 3's Step 7 in an actual browser** before treating feature 011 as fully
  verified end-to-end — this is the only feature in this session's work whose correctness rests
  almost entirely on interactive browser behavior (native dialogs, real anchor clicks) that no
  automated check here can exercise.
- The confirmation prompt's exact copy ("Leaving this page will discard your unsaved expense.
  Continue?") is a one-line, low-risk change if different wording is wanted (spec §7 item 3).
- Whether a confirmed in-app navigate-away should eventually use the App Router's client-side
  transition instead of a full `window.location.assign` reload remains an open, low-stakes tradeoff
  (spec §6 Challenge 3) — revisiting it would need a way to reach the router instance from outside a
  component.

**Final verification:**
npx tsc --noEmit   exit 0, no output
npm run lint       exit 0, no output
npm run build      exit 0, seven-route table unchanged (/, /_not-found, /categories, /expenses/new,
                    /settings, /trip/edit, /trip/new)
