# Edit Active Trip — Implementation Plan

**Status:** Complete
**Source:** `doc/spec/002.edit-active-trip.md`
**Goal:** Let a traveller view and edit the active trip's destination country, dates, and optional
budget after setup, from a pre-filled settings screen that recalculates travel days and trip
currency and saves back to the single stored `Trip` record.

**Architecture:**
Client-only, reusing feature 001's domain logic rather than duplicating it. A new pure function
(`getTripFormValues`) converts a stored `Trip` back into the same `TripFormValues` shape
`TripSetupForm` already edits. A new `TripEditForm` component holds that pre-filled state, displays
two read-only derived fields (travel days, trip currency) recalculated live from the current form
values, and on submit calls the *existing* `submitTripSetup` (validation + currency derivation +
`saveTrip`) unchanged — storage only ever holds one trip, so "edit" and "create" are the same write.
A new `/trip/edit` route loads the trip in a mount effect (never during render, per REFERENCE.md §5),
redirects to `/` if none exists, and renders the form. The existing home placeholder gets a link into
that route.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage — no backend, no database. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build`. No test runner is installed (verified: `package.json` has no
`test` script; `node_modules/.bin` contains only `eslint`, `next`, `tsc`).

**Negative constraints (from `doc/spec/002.edit-active-trip.md` §1.6, §2.5):**
- Will NOT delete or replace the trip, or add any confirmation-to-delete flow — that's feature 003.
- Will NOT touch `Expense`, `Category`, or `ExchangeRate` storage.
- Will NOT reconcile already-recorded `Expense.currency` values when the trip's currency changes
  (open question, spec §7 item 1).
- Will NOT add a confirmation dialog before saving a plain field edit.
- Will NOT build the real home dashboard — `app/page.tsx`'s placeholder trip-summary branch only
  gains one link; feature 009 replaces the whole branch later.
- Will NOT add a separate `submitTripEdit` function. `submitTripSetup` is reused unchanged (spec
  §6, Contrarian review #2).

**Assumptions:**
- Assumed: `getTrip`/`saveTrip`/`SaveResult` from `lib/storage.ts` (feature 012, complete) already
  handle SSR-safety, missing/corrupt data, and storage-write failure without any change here.
- Assumed: `TripSetupForm`'s markup conventions (label above input, `role="alert"` error text below,
  `gap-2`/`gap-4`/`gap-1` spacing, native `<select>`/`<input type="date">`) are the template
  `TripEditForm` follows, per `design.md` §6.

**Known tradeoffs (raised in plan review, deliberately accepted):**
- `TripEditForm` (Task 2) duplicates most of `TripSetupForm`'s JSX rather than parameterizing the
  existing component with an `initialValues`/`mode` prop. The duplication is real, but unifying them
  would mean modifying already-shipped, already-reviewed feature-001 code (`components/TripSetupForm.tsx`)
  for this feature's benefit, which `doc/spec/002.edit-active-trip.md` §2.2 (TS-002-03) did not scope
  and its own contrarian review only examined merging at the domain layer (§6, Challenge 2), not the
  UI layer. Accepted as-is for this plan; if `design.md`'s form conventions change later, both files
  need the same edit until a future feature deliberately unifies them.
- `submitTripSetup` (reused unchanged from feature 001) rebuilds the entire `Trip` object from
  `TripFormValues` rather than merging onto the existing stored trip. This is correct today because
  `Trip`'s fields are exactly the fields the form edits, but it means any future field added to
  `Trip` that isn't part of this form (e.g. an id) would be silently dropped on every edit save.
  Not a defect in this plan; flagged so a future feature touching `Trip`'s shape checks this.

---

### Task 1: [Domain] — getTripFormValues converts a Trip into pre-filled form values ✅ (93931a0)

**Files**
- modify: `lib/trip.ts`
- create (temporary, deleted within this task): `lib/trip.probe.ts`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `lib/trip.probe.ts` containing exactly:

      ```ts
      import { getTripFormValues } from "@/lib/trip";
      import type { Trip } from "@/lib/types";

      const trip: Trip = {
        destinationCountry: "Japan",
        currency: "JPY",
        startDate: "2026-03-01",
        endDate: "2026-03-10",
      };

      getTripFormValues(trip);
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `lib/trip.probe.ts(1,10): error TS2724: '"@/lib/trip"' has no exported member named 'getTripFormValues'. Did you mean 'TripFormValues'?`
      (TypeScript emits `TS2724` with a "did you mean" suggestion, not plain `TS2305`, because
      `lib/trip.ts` already exports the similarly-named `TripFormValues` — verified against this
      repo, not the generic pattern.)

- [x] **Step 3 — Minimal implementation.** In `lib/trip.ts`, add:

      ```ts
      export function getTripFormValues(trip: Trip): TripFormValues {
        return {
          destinationCountry: trip.destinationCountry,
          startDate: trip.startDate,
          endDate: trip.endDate,
          budget: trip.budget !== undefined ? String(trip.budget) : "",
        };
      }
      ```

- [x] **Step 4 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 5 — Delete the probe.** Remove `lib/trip.probe.ts`.

- [x] **Step 6 — Re-run after deletion.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 7 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the route table unchanged from before this
      task:
      ```
      Route (app)
      ┌ ○ /
      ├ ○ /_not-found
      ├ ○ /categories
      ├ ○ /expenses/new
      └ ○ /settings
      ```

- [x] **Step 8 — Commit.**
      `git add lib/trip.ts && git commit`
      Message: `feat(002): add getTripFormValues to pre-fill the trip edit form`

---

### Task 2: [UI] — TripEditForm renders a pre-filled, validated trip edit form ✅ (cebb2c5)

**Files**
- create: `components/TripEditForm.tsx`
- create (temporary, deleted within this task): `components/TripEditForm.probe.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [x] **Step 1 — Write the failing check.** Create `components/TripEditForm.probe.tsx` containing
      exactly one line:

      ```tsx
      import TripEditForm from "@/components/TripEditForm";
      ```

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, output exactly —
      `components/TripEditForm.probe.tsx(1,26): error TS2307: Cannot find module '@/components/TripEditForm' or its corresponding type declarations.`

- [x] **Step 3 — Implement the component.** Create `components/TripEditForm.tsx`:

      ```tsx
      "use client";

      import { useState, type FormEvent } from "react";
      import { useRouter } from "next/navigation";
      import type { Trip } from "@/lib/types";
      import { SUPPORTED_COUNTRIES, getCurrencyForCountry } from "@/lib/countries";
      import { saveTrip } from "@/lib/storage";
      import {
        calculateTripDurationDays,
        getTripFormValues,
        submitTripSetup,
        type TripFormValues,
        type TripValidationResult,
      } from "@/lib/trip";

      export default function TripEditForm({ trip }: { trip: Trip }) {
        const router = useRouter();
        const [values, setValues] = useState<TripFormValues>(() => getTripFormValues(trip));
        const [errors, setErrors] = useState<TripValidationResult["errors"]>({});
        const [saveError, setSaveError] = useState<string | null>(null);

        const durationDays = calculateTripDurationDays(values.startDate, values.endDate);
        const currency = getCurrencyForCountry(values.destinationCountry);

        function handleSubmit(e: FormEvent) {
          e.preventDefault();
          const result = submitTripSetup(values, { getCurrencyForCountry, saveTrip });
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
          router.push("/");
        }

        return (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">Trip settings</h1>

            <div className="flex flex-col gap-1">
              <label htmlFor="destinationCountry">Destination country</label>
              <select
                id="destinationCountry"
                value={values.destinationCountry}
                onChange={(e) => setValues({ ...values, destinationCountry: e.target.value })}
              >
                <option value="">Select a country</option>
                {SUPPORTED_COUNTRIES.map((c) => (
                  <option key={c.code} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              {errors.destinationCountry && <p role="alert">{errors.destinationCountry}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="startDate">Start date</label>
              <input
                id="startDate"
                type="date"
                value={values.startDate}
                onChange={(e) => setValues({ ...values, startDate: e.target.value })}
              />
              {errors.startDate && <p role="alert">{errors.startDate}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="endDate">End date</label>
              <input
                id="endDate"
                type="date"
                value={values.endDate}
                onChange={(e) => setValues({ ...values, endDate: e.target.value })}
              />
              {errors.endDate && <p role="alert">{errors.endDate}</p>}
            </div>

            <p className="font-mono text-sm text-[var(--muted)]">
              {Number.isFinite(durationDays) && durationDays > 0
                ? `${durationDays} ${durationDays === 1 ? "day" : "days"}`
                : "-"}
            </p>

            <div className="flex flex-col gap-1">
              <label htmlFor="budget">Budget (optional)</label>
              <input
                id="budget"
                type="text"
                inputMode="decimal"
                value={values.budget}
                onChange={(e) => setValues({ ...values, budget: e.target.value })}
              />
              {errors.budget && <p role="alert">{errors.budget}</p>}
            </div>

            <p className="font-mono text-sm text-[var(--muted)]">Trip currency: {currency ?? "-"}</p>

            {saveError && <p role="alert">{saveError}</p>}

            <button type="submit">Save changes</button>
          </form>
        );
      }
      ```

- [x] **Step 4 — Delete the probe.** Remove `components/TripEditForm.probe.tsx`.

- [x] **Step 5 — Re-run; confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output.
      `npm run build` → Expected: exit 0, ending with the route table unchanged from Task 1 (this
      component is not yet mounted in any route):
      ```
      Route (app)
      ┌ ○ /
      ├ ○ /_not-found
      ├ ○ /categories
      ├ ○ /expenses/new
      └ ○ /settings
      ```

- [x] ~~Step 6.5 (added during review) — guard the travel-days display~~ Superseded: folded directly
      into Step 3's code block above (`Number.isFinite(durationDays) && durationDays > 0`), since
      the original Step 3 code as first written let `calculateTripDurationDays` render literally
      "NaN days" (empty/invalid dates) or a negative count (end before start). Found by the
      code-quality review gate across two rounds; the plan's Step 3 block above now reflects what
      actually shipped. See `log.txt`, Task 2.

- [x] **Step 7 — Commit.**
      `git add components/TripEditForm.tsx && git commit`
      Message: `feat(002): add pre-filled trip edit form component`

---

### Task 3: [Route] — /trip/edit loads the active trip, guards the no-trip case, and saves edits ✅ (db3b202)

**Files**
- create: `app/trip/edit/page.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Implement the route.** Create `app/trip/edit/page.tsx`. This mirrors
      `app/page.tsx`'s existing `useSyncExternalStore`-over-a-per-mount-store pattern rather than a
      plain `useEffect` + `setState` — that plain approach was tried and empirically fails
      `npm run lint` here (`react-hooks/set-state-in-effect`, part of `eslint-config-next`'s
      `core-web-vitals` preset) because it calls a state setter synchronously inside an effect body.
      The pattern below avoids that: the trip is read once via `useSyncExternalStore` (hydration-safe
      per REFERENCE.md §5), and the only `useEffect` in the file calls `router.replace`, never a
      local state setter, so the rule has nothing to flag.

      ```tsx
      "use client";

      import { useEffect, useState, useSyncExternalStore } from "react";
      import { useRouter } from "next/navigation";
      import type { Trip } from "@/lib/types";
      import { getTrip } from "@/lib/storage";
      import TripEditForm from "@/components/TripEditForm";

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

      export default function EditTripPage() {
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

        return <TripEditForm trip={trip} />;
      }
      ```

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output.

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with a route table that now includes `/trip/edit`:
      ```
      Route (app)
      ┌ ○ /
      ├ ○ /_not-found
      ├ ○ /categories
      ├ ○ /expenses/new
      ├ ○ /settings
      └ ○ /trip/edit
      ```
      If the tool orders routes differently, that is not a failure — confirm all six paths are
      present with the `○ (Static)` marker and note the actual order in `log.txt` as a deviation
      rather than treating it as a build break.

- [ ] **Step 5 — NOT PERFORMED (no browser automation tool available in this environment).**
      Manual check: no active trip redirects home. Run `npm run dev`. In a browser
      devtools console on `http://localhost:3000`, run `localStorage.clear()`, then navigate
      directly to `http://localhost:3000/trip/edit`.
      Expected: the browser lands on `http://localhost:3000/` and shows the trip setup form (no
      trip exists to edit).

- [ ] **Step 6 — NOT PERFORMED (no browser automation tool available in this environment).**
      Manual check: pre-fill, edit, save, and validation. This step covers
      AC-002-01 through AC-002-10 in one continuous session (each sub-check builds on the previous
      one's saved state) — run them in order.

      **6a. Initial pre-fill (AC-002-01).** Complete trip setup (any supported country, e.g. Japan,
      with start date `2026-03-01` and end date `2026-03-10`, no budget), then navigate to
      `http://localhost:3000/trip/edit`.
      Expected: destination country shows "Japan", start date shows `2026-03-01`, end date shows
      `2026-03-10`, the travel-days line reads "10 days", the currency line reads
      "Trip currency: JPY", and the budget field is empty.

      **6b. Successful multi-field edit (AC-002-03, AC-002-04, AC-002-05).** Change the destination
      country to "Thailand", change the end date to `2026-03-15`, enter `500` as the budget, and
      click "Save changes".
      Expected: the browser navigates to `/`; reopening `/trip/edit` shows destination country
      "Thailand", end date `2026-03-15`, travel days "15 days", currency "Trip currency: THB", and
      budget `500`.

      **6c. No-op save leaves the trip equivalent (AC-002-10).** On `/trip/edit`, without changing
      any field, click "Save changes".
      Expected: the browser navigates to `/`; reopening `/trip/edit` shows the same values as the
      end of 6b (Thailand, `2026-03-15`, 15 days, THB, budget `500`) — nothing was altered.

      **6d. Budget removal clears it from storage (AC-002-06).** On `/trip/edit`, clear the budget
      field entirely and click "Save changes".
      Expected: the browser navigates to `/`; reopening `/trip/edit` shows an empty budget field
      (not `0`, not blank-but-present — genuinely absent, matching 6a's initial empty state).

      **6e. Whitespace-only budget is treated as no budget, not invalid (§1.5 edge case).** On
      `/trip/edit`, enter a single space character into the budget field and click "Save changes".
      Expected: no validation message appears; the browser navigates to `/` (the save succeeds,
      treating the whitespace as an absent budget, not a rejected one).

      **6f. Invalid date ranges are rejected without saving (AC-002-07).** On `/trip/edit`, for each
      row below, apply the change and click "Save changes", then check the result, then reload
      `/trip/edit` before moving to the next row (reloading resets the fields to the last
      successfully saved values from 6e).
      | Change | Expected |
      |---|---|
      | Clear the start date field | Stays on `/trip/edit`; a validation message appears under the start date field; reloading shows the start date unchanged from its last saved value. |
      | Clear the end date field | Stays on `/trip/edit`; a validation message appears under the end date field; reloading shows the end date unchanged. |
      | Set start date to `2026-03-15` and end date to `2026-03-01` (end before start) | Stays on `/trip/edit`; a validation message appears under the end date field; reloading shows both dates unchanged. |

      **6g. Invalid budgets are rejected without saving (AC-002-08).** On `/trip/edit`, for each
      value below, enter it into the budget field and click "Save changes", then check the result,
      then reload `/trip/edit` before the next value.
      | Budget value | Expected |
      |---|---|
      | `0` | Stays on `/trip/edit`; a validation message appears under the budget field; reloading shows the budget unchanged. |
      | `-5` | Same as above. |
      | `abc` | Same as above. |

      **6h. Unsupported destination country is rejected without saving (AC-002-09).** On
      `/trip/edit`, using the browser devtools console, run
      `document.getElementById("destinationCountry").insertAdjacentHTML("beforeend", '<option value="Atlantis">Atlantis</option>')`
      to inject a value not in the supported list, select "Atlantis" from the dropdown, and click
      "Save changes".
      Expected: stays on `/trip/edit`; a validation message appears under the destination country
      field; reloading shows the destination country unchanged from its last saved value.

- [ ] **Step 7 — NOT PERFORMED (no browser automation tool available in this environment).**
      Manual check: a storage failure preserves unsaved edits (AC-002-11). In the
      browser devtools console on `http://localhost:3000/trip/edit`, exhaust local storage so the
      next write fails:
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
      Then change the end date field to a new value and click "Save changes".
      Expected: the browser stays on `/trip/edit`; a friendly error message appears (not a raw
      exception, not a blank screen); the end date field still shows the value you just typed, not
      the previously saved one.

      Clean up before continuing: in the same console, run
      `for (let k in localStorage) { if (k.startsWith("__pad")) localStorage.removeItem(k); }`
      and confirm `/trip/edit` still shows the trip's last genuinely saved values after a reload.

- [x] **Step 8 — Commit.**
      `git add app/trip/edit/page.tsx && git commit`
      Message: `feat(002): add the trip edit route`
      (Committed with Steps 5-7's manual browser checks NOT performed — no browser automation tool
      is available in this environment. Compensated with the deepest available static verification:
      two independent review-gate subagents traced every scenario by hand against the real code and
      React/Next.js semantics — see log.txt, Task 3. Flagged to the user as a residual gap: these
      three manual checks should be run by a human in an actual browser before treating feature 002
      as fully verified end-to-end.)

---

### Task 4: [Route] — Home screen links to the trip edit route ✅ (56d623e)

**Files**
- modify: `app/page.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, manual browser check via `npm run dev`

- [x] **Step 1 — Add the entry point.** In `app/page.tsx`, add `import Link from "next/link";` to
      the imports, and inside the placeholder trip-summary block (the `trip !== null` return
      branch), add a link after the existing paragraph:

      ```tsx
      <Link href="/trip/edit">Edit trip</Link>
      ```

      so the branch reads:

      ```tsx
      return (
        <div className="p-4">
          <h1 className="text-xl font-semibold">Home</h1>
          <p>
            Trip to {trip.destinationCountry} ({trip.startDate} – {trip.endDate},{" "}
            {durationDays} {durationDays === 1 ? "day" : "days"})
          </p>
          <Link href="/trip/edit">Edit trip</Link>
        </div>
      );
      ```

- [x] **Step 2 — Typecheck.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 3 — Lint.**
      `npm run lint`
      Expected: exit 0, no output.

- [x] **Step 4 — Build.**
      `npm run build`
      Expected: exit 0, ending with the same six-route table produced at the end of Task 3 (no new
      route added by this task).

- [ ] **Step 5 — NOT PERFORMED (no browser automation tool available in this environment).**
      Manual check: the full Home → edit → save → Home round trip. With an active
      trip already saved (from Task 3's manual check), run `npm run dev` and open
      `http://localhost:3000/`. Note the destination country, dates, and day count currently shown
      in the trip summary.
      Expected: an "Edit trip" link is visible below the trip summary; clicking it navigates to
      `http://localhost:3000/trip/edit` and shows the form pre-filled with those same current
      values.

      Then, on `/trip/edit`, change the destination country to a different supported country (e.g.
      "Vietnam" if the current one is "Thailand") and change the end date so the day count changes,
      and click "Save changes".
      Expected: the browser lands back on `http://localhost:3000/`, and the trip summary shown
      there — without any further manual reload — immediately reflects the new destination country,
      the new end date, and the recalculated day count. This is the end-to-end behavior the feature
      exists for: an edit made on `/trip/edit` is visible on the home screen the moment the user
      returns to it.

- [x] **Step 6 — Commit.**
      `git add app/page.tsx && git commit`
      Message: `feat(002): link to trip settings from the home screen`
      (Committed with Step 5's manual round-trip check NOT performed — no browser automation tool
      available in this environment. Static verification (both review gates independently traced
      the code and confirmed the Link's href resolves to a route file that provably exists) stands
      in, but is not a substitute. See log.txt, Task 4, and the plan-level note below.)

---

## Completion Summary

**Completed:** 2026-09-10
**Tasks:** 4 of 4

**What was built:**
`getTripFormValues` in `lib/trip.ts` (pre-fills an edit form from a stored trip), the
`components/TripEditForm.tsx` component (pre-filled trip edit form, reusing feature 001's
`submitTripSetup` for validation and save, with live-recalculated travel-days and trip-currency
display), the `app/trip/edit/page.tsx` route (hydration-safe load, redirects home if no trip
exists), and an "Edit trip" link on the home placeholder. A traveller can now open trip settings,
see the current destination country/dates/budget/currency/day-count, change any of them, and save
back to the single stored `Trip` record — with invalid input rejected without saving and a storage
failure preserving their unsaved edits.

**Deviations from the plan:**
- Task 1: TypeScript's actual error for the missing-export probe was `TS2724` with a "did you mean"
  suggestion, not the plan's originally-guessed `TS2305` — the plan's Step 2 was corrected in place
  before the implementer ran it (log.txt, Task 1).
- Task 2: the plan's literal Step 3 code block rendered the travel-days display with no guard
  against `NaN` or negative values; two rounds of the code-quality gate caught this (garbage text
  like "NaN days" or "-4 days" could render mid-edit before submission), which was this task's 2nd
  consecutive Gate-B failure. Per `/sdd`'s escalation rule the automatic retry stopped there; per
  CLAUDE.md's outer loop the controller applied the root-cause fix directly and had it independently
  re-verified. plan.md's Step 3 code block now reflects what actually shipped (log.txt, Task 2).
- Tasks 3 and 4: **this environment has no browser-automation tool.** None of the plan's manual
  browser checks were executed against a real browser/localStorage — specifically Task 3's Steps
  5-7 (no-trip redirect, the full pre-fill/edit/save/validation matrix, the storage-failure check)
  and Task 4's Step 5 (the Home→edit→save→Home round trip). Both tasks were committed anyway, after
  the deepest available substitute: independent review-gate subagents traced every scenario by hand
  against the real committed code and documented React/Next.js/ESLint semantics. This is disclosed
  rather than glossed over — see the "RESIDUAL GAP" note at the end of `log.txt`.
- Gate B raised two non-blocking Advisory findings not acted on (Task 2: duplication between
  `TripSetupForm`/`TripEditForm`; Task 3: duplication between `app/page.tsx`'s and
  `app/trip/edit/page.tsx`'s store scaffolding, and a missing explanatory code comment). Neither was
  required by the task/spec; logged for a future feature to reconsider if it touches the same code.

**Follow-ups not in scope here:**
- Reconciling existing `Expense.currency` values when a trip's currency changes mid-trip — open
  question in `doc/spec/002.edit-active-trip.md` §7 item 1, deferred to feature 006's spec.
- Extracting the duplicated `TripSnapshot`/`createTripStore` scaffolding shared by `app/page.tsx`
  and `app/trip/edit/page.tsx` into a shared hook — flagged by Gate B as Advisory, not requested by
  this feature's spec.
- **A human should run Task 3's Steps 5-7 and Task 4's Step 5 in an actual browser** before treating
  feature 002 as fully verified end-to-end — see the RESIDUAL GAP note in `log.txt`.

**Final verification:**
npx tsc --noEmit   exit 0, no output
npm run lint       exit 0, no output
npm run build      exit 0, six-route table (/, /_not-found, /categories, /expenses/new, /settings,
                    /trip/edit)

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
