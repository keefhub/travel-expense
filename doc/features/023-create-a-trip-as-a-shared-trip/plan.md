# Create a Trip as a Shared Trip — Implementation Plan

**Status:** Not Started
**Source:** `doc/features/023-create-a-trip-as-a-shared-trip/spec.md`
**Goal:** Every trip creation — a device's very first trip, or an additional one alongside trips it
already has — creates a server-backed trip directly, with a shareable link already attached, and no
local-storage-only trip mode is used for it.

**Architecture:**
Trip creation reuses `POST /api/trips` (feature 016) completely unchanged. A new client module
(`lib/tripCreation.ts`) POSTs to it and appends the result to a new, separate local-storage list —
`createdTrips` — rather than touching the existing single-slot `sharedTripLink` (016's untouched v1
pointer) or `joinedTrips` (017). Each created trip gets its own stable URL by extending the existing
`/trips/[token]` viewer (`components/SharedTripView.tsx`) with a creator-recognition branch, so `/`
can stay a thin redirector: no trip anywhere → the (now server-backed) setup form; any trip exists →
redirect to one of them. `components/TripSetupForm.tsx` is generalized to support an async,
server-backed `submit` implementation alongside its existing synchronous one. Four already-shipped
screens (`ManageParticipants.tsx`, `SharedExpenseForm.tsx`, `SharedExpenseDetail.tsx`,
`TripBalances.tsx`) are extended so a created trip's creator can actually use them, per the decision
recorded when this plan was scoped (spec §7 item 1).

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
No backend beyond the existing `/api/trips` Route Handler (016) — no new API route, no Prisma schema
change. Data: browser local storage (new `createdTrips` key) plus the existing Neon/Prisma-backed
`Trip` row. Verification: `npm run lint`, `npx tsc --noEmit`, `npm run build` (route/config-touching
tasks only), `npx playwright test e2e/<spec>.spec.ts`.

**Negative constraints (from spec §1.6 and §7):**
- Note: will NOT edit trip details after creation (feature 025), manage exchange rates (026) or
  custom categories (024) at creation time, build the shared-trip dashboard (027), add regenerate/
  link-generation UI (016 already has it), migrate a pre-existing local trip (030), or remove any v1
  route/component (031).
- Note: will NOT modify `lib/sharedTrip.ts`, `lib/storage.ts`'s existing `sharedTripLink`/
  `joinedTrips` accessors, `lib/join.ts`, `lib/countries.ts`, `app/api/trips/route.ts`, or
  `prisma/schema.prisma` — every one of these is reused exactly as it is today.
- Note: will NOT add any offline path for trip creation.
- Note: will NOT edit `features/003.create-new-trip.md` or `OVERVIEW.md` — the drift this plan
  creates in feature 003's UI reachability is recorded in spec §7 item 2 as a follow-up, not fixed
  here.

**Assumptions (from spec §7):**
- Assumed: when `/` must redirect and the device has both created and joined trips, it redirects to
  the most recently created trip (last entry of `getCreatedTrips()`); only when there are no created
  trips does it fall back to the first joined trip.
- Assumed: the "Create another trip" entry point (spec §7 item 3) is added to
  `components/CreatedTripSummary.tsx` (new, this plan) and `components/JoinedTripSummary.tsx`
  (existing) only — a device whose only trip is a v1 local trip already has a working path via
  `components/TripEditForm.tsx`'s existing "Start a new trip" link, which is unaffected by this plan
  since that component is not touched.
- Assumed: TS-023-12 (spec §2.2) is in scope for this plan — Tasks 16–19 below — per the explicit
  decision to include it rather than ship the gap.

**Review notes (Pass B/C, applied 2026-09-22):** two structural defects were found and fixed before
execution — (1) an earlier draft had Task 5 poison-pilling `app/page.tsx` with bare unresolved
identifiers left unresolved for six tasks; since `tsc --noEmit` checks the whole project, this made
every intervening task's own "expect exit 0" claim false. Task 5 is now self-contained (no
cross-file edit) and Task 11 wires the real call site in one pass. (2) Task 10 claimed a starting
failure that Task 8 never actually produces; Task 10 now carries its own self-contained red step.
Four **advisory** findings from Pass B are accepted as-is, not fixed here, and recorded for the
implementer's awareness rather than silently dropped:
- Both the pre-existing v1 "linked solo trip" switcher entry and the new `createdTrips` entries
  render with the same `TripRole` label ("… — Created"), so a device with both is not visually
  distinguishable in the switcher beyond the link target. Not fixed — `TripRole` is feature 018's
  type and widening it is out of this plan's scope.
- `CreatedTrip.trip` is an immutable creation-time cache; feature 025 (edit trip details) will need
  to add a refresh path for it. Not this plan's job — flagged for 025's own spec.
- `lib/tripCreation.ts` duplicates some of `lib/sharedTrip.ts`'s shape (POST body construction, the
  collapsed-error pattern, a local `FRIENDLY_ERROR` copy). Deliberate — see spec §2.2 TS-023-03's
  rationale for keeping the v1 and v2 creation flows decoupled.
- `components/SharedTripView.tsx`'s "gone" branch prunes stale `joinedTrips` entries; this plan does
  not add equivalent pruning for `createdTrips`, since no UI path can delete a created trip yet
  (feature 029 is where that will matter).

---

### Task 1: [Types] — Add `CreatedTrip` to `lib/types.ts`

**Files**
- modify: `lib/types.ts`
- test: `npx tsc --noEmit`, `npm run lint`

- [ ] **Step 1 — Write the failing call site.** In `lib/storage.ts`, extend the existing
      `import type { Trip, Category, Expense, ExchangeRate, SharedTripLink, JoinedTrip } from "@/lib/types";`
      line at the top of the file to also include `CreatedTrip` — do not add a second `import type`
      line.

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, error TS2305 on `lib/storage.ts` — `Module '"@/lib/types"' has no exported member 'CreatedTrip'.`

- [ ] **Step 3 — Implement to this contract.** In `lib/types.ts`, add a new exported interface,
      placed directly after the existing `JoinedTrip` interface:

      ```
      File: lib/types.ts (modify — add only, do not change any existing interface)
      Exports: interface CreatedTrip { tripId: string; shareToken: string; creatorToken: string; trip: Trip }
      Behavior: `trip` is a creation-time snapshot of the trip's business fields (destinationCountry,
                currency, startDate, endDate, budget) — reuses the existing `Trip` interface verbatim,
                not a new shape.
      Constraints: do not modify SharedTripLink, JoinedTrip, SharedTripSummary, or any other existing
                   interface in this file.
      ```

- [ ] **Step 4 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 5 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      (`npm run build` not needed — no route, config, or dependency touched.)

- [ ] **Step 6 — Commit.**
      Message: `feat(023): add CreatedTrip type`

---

### Task 2: [Data] — Add `createdTrips` storage key and accessors to `lib/storage.ts`

**Files**
- modify: `lib/storage.ts`
- modify: `lib/tripSwitcher.ts` (poison-pill import only — Task 6 uses it)
- test: `npx tsc --noEmit`, `npm run lint`

- [ ] **Step 1 — Write the failing call site.** In `lib/tripSwitcher.ts`, add this new standalone
      import statement at the top of the file:

      ```ts
      import { getCreatedTrips } from "@/lib/storage";
      ```

      This import is not used by any code in this task — Task 6 wires the call. Its only purpose
      here is to force the compiler error below.

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, error TS2305 on `lib/tripSwitcher.ts` — `Module '"@/lib/storage"' has no exported member 'getCreatedTrips'.`

- [ ] **Step 3 — Implement to this contract.** In `lib/storage.ts`:

      ```
      File: lib/storage.ts (modify)
      1. Extend the STORAGE_KEYS object literal with one new entry:
         createdTrips: "travel-expense:created-trips"
         (add it as the last property, after `joinedTrips`)
      2. Export function getCreatedTrips(): CreatedTrip[]
         Behavior: return safeGetItem<CreatedTrip[]>(STORAGE_KEYS.createdTrips, [])
         — identical shape to the existing getJoinedTrips, placed directly after it in the file.
      3. Export function saveCreatedTrips(trips: CreatedTrip[]): SaveResult
         Behavior: return safeSetItem(STORAGE_KEYS.createdTrips, trips)
         — identical shape to the existing saveJoinedTrips, placed directly after getCreatedTrips.
      4. In the existing resetAppData() function, add one line:
         window.localStorage.removeItem(STORAGE_KEYS.createdTrips);
         placed immediately after the existing
         window.localStorage.removeItem(STORAGE_KEYS.sharedTripLink);
         line (i.e. as the new second removeItem call, before joinedTrips) — auxiliary collections
         are removed before the trip record, matching the file's existing ordering comment above
         that block; do not reorder or edit any other line in resetAppData.
      Constraints: do not modify getSharedTripLink, saveSharedTripLink, clearSharedTripLink,
                   getJoinedTrips, or saveJoinedTrips — they are reused unchanged by other code and
                   must not change shape or behavior.
      ```

- [ ] **Step 4 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 5 — Regression run.**
      `npm run lint` → Expected: exit 0. ESLint may print one
      `@typescript-eslint/no-unused-vars` warning for the `getCreatedTrips` import added to
      `lib/tripSwitcher.ts` in Step 1 — that import genuinely is unused until Task 6 wires it into a
      call. The warning does not fail the run (this rule is configured as `warn`, and the `lint`
      script has no `--max-warnings`); the command still exits `0`. Do not treat that one warning as
      a defect to fix in this task.

- [ ] **Step 6 — Commit.**
      Message: `feat(023): add createdTrips storage key and accessors`

---

### Task 3: [Data] — Add `lib/tripCreation.ts`

**Files**
- create: `lib/tripCreation.ts`
- modify: `lib/trip.ts` (poison-pill import only — Task 4 uses it)
- test: `npx tsc --noEmit`, `npm run lint`

- [ ] **Step 1 — Write the failing call site.** In `lib/trip.ts`, add this new standalone import
      line at the top of the file, alongside its existing imports:

      ```ts
      import type { CreateTripResult } from "@/lib/tripCreation";
      ```

      This import is unused in this task — Task 4 wires the call. Its only purpose is the compiler
      failure below.

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, error TS2307 on `lib/trip.ts` — `Cannot find module '@/lib/tripCreation' or its corresponding type declarations.`

- [ ] **Step 3 — Implement to this contract.**

      ```
      File: lib/tripCreation.ts (create)
      Imports: import type { Trip, CreatedTrip } from "@/lib/types";
               import { getCreatedTrips, saveCreatedTrips } from "@/lib/storage";
      Exports:
        type CreateTripResult = { ok: true; createdTrip: CreatedTrip } | { ok: false; error: string }
        function createSharedTrip(trip: Trip): Promise<CreateTripResult>
      Behavior:
        1. POST to "/api/trips" with header "Content-Type": "application/json" and a JSON body
           containing exactly: destinationCountry: trip.destinationCountry, currency: trip.currency,
           startDate: trip.startDate, endDate: trip.endDate, budget: trip.budget.
        2. response.ok is false -> return { ok: false, error: FRIENDLY_ERROR } where FRIENDLY_ERROR
           is a local module-scope const with the exact string
           "Could not reach the server. Check your connection and try again."
           (this is a new local copy of the string, not an import from lib/sharedTrip.ts).
        3. response.ok is true -> parse the JSON body as { id: string; shareToken: string;
           creatorToken: string }, build:
             const createdTrip: CreatedTrip = { tripId: data.id, shareToken: data.shareToken,
               creatorToken: data.creatorToken, trip };
           then call saveCreatedTrips([...getCreatedTrips(), createdTrip]) — append, never replace
           the existing array.
        4. saveCreatedTrips's result is { ok: false, error } -> return { ok: false, error } (the
           SaveResult's own error string, not FRIENDLY_ERROR).
        5. saveCreatedTrips's result is { ok: true } -> return { ok: true, createdTrip }.
        6. The whole fetch call (steps 1-3) is wrapped in try/catch; a thrown error (network failure)
           -> return { ok: false, error: FRIENDLY_ERROR }, same as step 2's branch.
      Constraints: this file must not import from lib/sharedTrip.ts, must not call saveSharedTripLink
                   or getSharedTripLink, and must not modify lib/sharedTrip.ts. Do not export
                   anything named generateShareLink from this file. Export both CreateTripResult and
                   createSharedTrip — Step 1 only imported the type, but this task creates both.
      ```

- [ ] **Step 4 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 5 — Regression run.**
      `npm run lint` → Expected: exit 0. ESLint may print one
      `@typescript-eslint/no-unused-vars` warning for the `CreateTripResult` import added to
      `lib/trip.ts` in Step 1 — genuinely unused until Task 4 uses it. The run still exits `0`; do
      not treat that warning as a defect to fix in this task.

- [ ] **Step 6 — Commit.**
      Message: `feat(023): add lib/tripCreation.ts`

---

### Task 4: [Domain] — Add `submitSharedTripSetup` to `lib/trip.ts`

**Files**
- modify: `lib/trip.ts`
- test: `npx tsc --noEmit`, `npm run lint`

- [ ] **Step 1 — Confirm the current state.**
      `npx tsc --noEmit`
      Expected: exit 0, no output. (Task 3 left `lib/trip.ts` with a valid, if unused,
      `CreateTripResult` type import — that alone does not fail the compiler.)

- [ ] **Step 2 — Implement to this contract.**

      ```
      File: lib/trip.ts (modify — add only; do not change validateTripForm, calculateTripDurationDays,
            getTripFormValues, submitTripSetup, submitNewTrip, or buildAndSaveTrip)
      Imports to add: import type { CreatedTrip } from "@/lib/types"; (extend the existing
        "import type { Trip, Expense, ExchangeRate, SharedTripLink } from "@/lib/types";" line to
        also include CreatedTrip, rather than a second import line)
        import { createSharedTrip } from "@/lib/tripCreation"; — add this new runtime import line;
        the existing "import type { CreateTripResult } from \"@/lib/tripCreation\";" line from Task 3
        stays as-is (it is still needed as a type-only import for the deps parameter below).
      Exports:
        type SubmitSharedTripResult =
          | { status: "invalid"; errors: TripValidationResult["errors"] }
          | { status: "saved"; trip: Trip; createdTrip: CreatedTrip }
          | { status: "server-error"; error: string }
        function submitSharedTripSetup(
          values: TripFormValues,
          deps: {
            getCurrencyForCountry: (country: string) => string | null;
            createSharedTrip: (trip: Trip) => Promise<CreateTripResult>;
          }
        ): Promise<SubmitSharedTripResult>
      Behavior:
        1. Call validateTripForm(values) (the existing function, unchanged). If Object.keys(errors).length > 0,
           return { status: "invalid", errors } immediately — do not call deps.createSharedTrip.
        2. Otherwise build a Trip exactly as the existing buildAndSaveTrip does:
             const currency = deps.getCurrencyForCountry(values.destinationCountry);
             const trimmedBudget = values.budget.trim();
             const trip: Trip = {
               destinationCountry: values.destinationCountry,
               currency: currency ?? "",
               startDate: values.startDate,
               endDate: values.endDate,
               ...(trimmedBudget !== "" ? { budget: Number(trimmedBudget) } : {}),
             };
        3. Call const result = await deps.createSharedTrip(trip).
        4. result.ok === false -> return { status: "server-error", error: result.error }.
        5. result.ok === true -> return { status: "saved", trip, createdTrip: result.createdTrip }.
        This function performs no duplicate-trip check of any kind — no comparison against any
        existing trip's destination or dates anywhere in this function.
      Note: the runtime `createSharedTrip` import added in this step is not called by this file's own
        top-level code outside submitSharedTripSetup's body — it is passed through as the actual
        default implementation only by app/page.tsx and app/trip/new/page.tsx (Tasks 11–12), which
        import createSharedTrip themselves and hand it to submitSharedTripSetup as deps.createSharedTrip.
        Nothing in this task calls the module-level `createSharedTrip` import directly other than
        inside submitSharedTripSetup's own deps type — that is expected and correct.
      Constraints: do not call saveTrip, getSharedTripLink, or any lib/storage.ts export other than
                   what deps already injects. Do not modify submitNewTrip's signature or body.
      ```

- [ ] **Step 3 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 4 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner. (The `CreateTripResult`
      import from Task 3 is now genuinely used, by `submitSharedTripSetup`'s `deps` parameter type —
      no unused-import warning should remain in `lib/trip.ts`.)

- [ ] **Step 5 — Commit.**
      Message: `feat(023): add submitSharedTripSetup`

---

### Task 5: [UI] — Generalize `components/TripSetupForm.tsx` for async submit and double-submit protection

**Files**
- modify: `components/TripSetupForm.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

No file outside `components/TripSetupForm.tsx` is touched by this task. `TripSetupForm`'s current
callers (`app/page.tsx`'s `<TripSetupForm onSaved={store.setSnapshot} />`, with no `submit` prop, so
it uses the default `submitTripSetup`) keep compiling and behaving exactly as today, because this
task only **widens** the `submit` prop's accepted type — it does not narrow or remove anything an
existing caller relies on. Nothing yet calls this component with an async `submit`, so there is no
cross-file compiler proof available for that half of the contract; Task 11 provides it, self-
contained within that same task.

- [ ] **Step 1 — Confirm the current state.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 2 — Implement to this contract.**

      ```
      File: components/TripSetupForm.tsx (modify)
      Imports to add: extend the existing "import { useState, type FormEvent } from \"react\";" line
        to also include useRef.
        import type { SubmitSharedTripResult } from "@/lib/trip"; (add as a new type-only import
        from the same "@/lib/trip" module the component already imports from — extend the existing
        import statement rather than adding a new one)
      Prop type change: widen the `submit` prop's declared return type from
        `SubmitTripResult` to `SubmitTripResult | SubmitSharedTripResult | Promise<SubmitTripResult | SubmitSharedTripResult>`
        The prop's parameter types (`values: TripFormValues`, `deps: { getCurrencyForCountry; saveTrip }`)
        do not change.
      Behavior changes to handleSubmit:
        1. Add `const inFlight = useRef(false);` and `const [isPending, setIsPending] = useState(false);`
           as new state, alongside the existing `values`/`errors`/`saveError` state.
        2. handleSubmit becomes `async function handleSubmit(e: FormEvent)`.
        3. First line inside (after `e.preventDefault();`): `if (inFlight.current) return;` then
           `inFlight.current = true; setIsPending(true);` — both before any await.
        4. Wrap the existing submit-call-and-branch logic in try/finally; the finally block sets
           `inFlight.current = false; setIsPending(false);`.
        5. Change `const result = submit(...)` to `const result = await submit(...)`.
        6. Generalize the branching: keep the existing `if (result.status === "invalid") { setErrors(result.errors); setSaveError(null); return; }`
           unchanged, but replace the specific `if (result.status === "storage-error")` check with
           `if (result.status !== "saved") { setErrors({}); setSaveError(result.error); return; }`
           — this one condition now covers both "storage-error" and "server-error" identically,
           checked in this exact order (invalid checked first, since a "invalid" result has no
           `.error` field and must not reach the generalized branch).
        7. The final `setErrors({}); setSaveError(null); onSaved(result.trip);` lines are unchanged.
      JSX change: add `disabled={isPending}` to the existing `<button type="submit" className="btn-primary">`
        element — no other JSX changes.
      Constraints: do not change the button's visible text ("Start tracking"), do not add any new
                   visible error/status text beyond what setSaveError/setErrors already render, do
                   not modify DateField.tsx, do not modify lib/trip.ts, do not modify any file other
                   than components/TripSetupForm.tsx.
      ```

- [ ] **Step 3 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output. (Genuinely true here — nothing outside this file references the
      widened type yet, so widening it cannot break any existing caller.)

- [ ] **Step 4 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner. (The `SubmitSharedTripResult`
      type import is used by the widened prop type in this same file, so no unused-import warning.)

- [ ] **Step 5 — Commit.**
      Message: `feat(023): support async submit and double-submit guard in TripSetupForm`

---

### Task 6: [Domain] — Extend `lib/tripSwitcher.ts` to recognize created trips

**Files**
- modify: `lib/tripSwitcher.ts`
- modify: `components/TripSwitcher.tsx` (poison-pill call-site argument only — Task 7 wires the import)
- test: `npx tsc --noEmit`, `npm run lint`

- [ ] **Step 1 — Write the failing call site.** In `components/TripSwitcher.tsx`, change the existing
      line
      `const entries = getSwitcherEntries(getTrip(), getSharedTripLink(), getJoinedTrips());`
      to
      `const entries = getSwitcherEntries(getTrip(), getSharedTripLink(), getJoinedTrips(), getCreatedTrips());`
      Do not add the `getCreatedTrips` import yet — that is Task 7. This step exists only to produce
      the compiler failure below.

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, error TS2304 on `components/TripSwitcher.tsx` — `Cannot find name 'getCreatedTrips'.`

- [ ] **Step 3 — Implement to this contract.**

      ```
      File: lib/tripSwitcher.ts (modify)
      Import to add: extend the existing "import type { Trip, SharedTripLink, JoinedTrip } from
        \"@/lib/types\";" line to also include CreatedTrip.
      Signature change: getSwitcherEntries(
        trip: Trip | null,
        sharedLink: SharedTripLink | null,
        joined: JoinedTrip[],
        created: CreatedTrip[]
      ): SwitcherEntry[]
      Behavior: the existing `if (trip !== null) { ... }` block and the existing `for (const jt of
        joined) { ... }` loop are UNCHANGED, byte-for-byte. Add a new loop, placed after the
        existing `trip !== null` block and before the `for (const jt of joined)` loop:
          for (const c of created) {
            entries.push({
              role: "created",
              label: c.trip.destinationCountry,
              href: `/trips/${c.shareToken}`,
              shareToken: c.shareToken,
            });
          }
      Constraints: do not change SwitcherEntry's definition, do not change TripRole, do not reorder
                   the existing trip/joined logic relative to each other — only insert the new
                   created-trips loop between them. Do not touch components/TripSwitcher.tsx in this
                   task — its call site already has the 4th argument from Step 1; only its import is
                   still missing, and that is Task 7's job, not this task's.
      ```

- [ ] **Step 4 — Confirm this task's own change is correct.**
      `npx tsc --noEmit`
      Expected: exit 2 — **the same single error from Step 2 is still present, unchanged**:
      `error TS2304 on components/TripSwitcher.tsx — Cannot find name 'getCreatedTrips'.` Task 7
      resolves it in the very next task; it is not this task's responsibility. What this step must
      confirm is that there is **no other or additional error** anywhere in the output, and in
      particular none referencing `lib/tripSwitcher.ts` itself — that file's own change must compile
      cleanly on its own merits. If you see any error other than that one exact
      `components/TripSwitcher.tsx` / `getCreatedTrips` error, this task's implementation has a real
      defect to fix.

- [ ] **Step 5 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner from `lib/tripSwitcher.ts`
      itself (the file this task actually modifies). `components/TripSwitcher.tsx`'s Step 1 change
      is a call-site edit, not an unused import, so it does not produce a lint warning of its own at
      this point — only the still-open `tsc` error from Step 4 marks it as incomplete, which Task 7
      resolves.

- [ ] **Step 6 — Commit.**
      Message: `feat(023): recognize created trips in getSwitcherEntries`

---

### Task 7: [UI] — Update `components/TripSwitcher.tsx`'s call site

**Files**
- modify: `components/TripSwitcher.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

- [ ] **Step 1 — Confirm the current failure.**
      `npx tsc --noEmit`
      Expected: exit 2, error TS2304 on `components/TripSwitcher.tsx` — `Cannot find name 'getCreatedTrips'.`
      (This is the state Task 6 Step 1 left the file in — the call site already passes 4 arguments,
      but the import is missing.)

- [ ] **Step 2 — Implement to this contract.** In `components/TripSwitcher.tsx`, extend the existing
      `import { getTrip, getSharedTripLink, getJoinedTrips } from "@/lib/storage";` line to also
      include `getCreatedTrips`, rather than adding a second import line. Make no other change to
      this file — the call site itself (`getSwitcherEntries(getTrip(), getSharedTripLink(), getJoinedTrips(), getCreatedTrips())`)
      already has its 4th argument from Task 6.

- [ ] **Step 3 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 4 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [ ] **Step 5 — Commit.**
      Message: `feat(023): pass created trips into the trip switcher`

---

### Task 8: [UI] — Add `components/CreatedTripSummary.tsx`

**Files**
- create: `components/CreatedTripSummary.tsx`
- modify: `components/SharedTripView.tsx` (poison-pill import only — Task 10 uses it)
- test: `npx tsc --noEmit`, `npm run lint`

- [ ] **Step 1 — Write the failing call site.** In `components/SharedTripView.tsx`, add this import
      line at the top, alongside its existing imports:

      ```ts
      import CreatedTripSummary from "@/components/CreatedTripSummary";
      ```

      This import is unused in this task — Task 10 wires the render. Its only purpose is the
      compiler failure below.

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, error TS2307 on `components/SharedTripView.tsx` — `Cannot find module '@/components/CreatedTripSummary' or its corresponding type declarations.`

- [ ] **Step 3 — Implement to this contract.**

      ```
      File: components/CreatedTripSummary.tsx (create, 'use client')
      Imports: import { useState } from "react";
               import Link from "next/link";
               import type { CreatedTrip } from "@/lib/types";
               import { calculateTripDurationDays } from "@/lib/trip";
               import { buildShareUrl } from "@/lib/sharedTrip";
      Exports: default function CreatedTripSummary({ createdTrip }: { createdTrip: CreatedTrip }): JSX.Element
      Behavior:
        1. Render an <h1 className="text-xl font-semibold"> containing createdTrip.trip.destinationCountry.
        2. Render a <p> containing exactly: `${createdTrip.trip.startDate} to ${createdTrip.trip.endDate}`.
        3. Render a <p> containing exactly:
           `${calculateTripDurationDays(createdTrip.trip.startDate, createdTrip.trip.endDate)} days`
        4. createdTrip.trip.budget is not undefined -> render a <p> containing exactly
           `${createdTrip.trip.currency} ${createdTrip.trip.budget.toFixed(2)}`. createdTrip.trip.budget
           is undefined -> render no budget line at all (not an empty paragraph).
        5. Render a font-mono break-all <p> containing buildShareUrl(createdTrip.shareToken) — this
           is the "share link" text; it must contain the substring "/join/" (buildShareUrl's own
           existing behavior already guarantees this).
        6. Render a "Copy link" btn-secondary <button type="button">: on click, call
           navigator.clipboard.writeText(buildShareUrl(createdTrip.shareToken)) inside a try/catch;
           on success set a `copied` boolean state to true and render a
           <p role="status" className="text-sm text-(--success-text)">Link copied.</p> beneath the
           button (mirrors components/ShareTripLink.tsx's own copy confirmation exactly — same
           className string); on thrown error set an `error` string state and render
           <p role="alert">Could not copy the link. Copy it manually instead.</p> (identical message
           text to components/ShareTripLink.tsx's own handleCopy catch block).
        7. Render a <Link href="/trip/new" className="link self-start">Create another trip</Link> as
           the last element.
      Constraints: this component takes no other props, does not read localStorage or call fetch
                   itself (all its data comes from the createdTrip prop), does not render any
                   "generate"/"regenerate" control, and does not import from lib/storage.ts. Do not
                   touch components/SharedTripView.tsx in this task — its import is already added by
                   Step 1; wiring its render is Task 10's job.
      ```

- [ ] **Step 4 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output. (The `CreatedTripSummary` import in `SharedTripView.tsx` becomes
      a valid module reference once this file exists — it is unused there until Task 10, which is a
      lint concern, not a compiler error.)

- [ ] **Step 5 — Regression run.**
      `npm run lint` → Expected: exit 0. ESLint may print one
      `@typescript-eslint/no-unused-vars` warning for the `CreatedTripSummary` import added to
      `components/SharedTripView.tsx` in Step 1 — genuinely unused until Task 10 renders it. The run
      still exits `0`; do not treat that warning as a defect to fix in this task.

- [ ] **Step 6 — Commit.**
      Message: `feat(023): add CreatedTripSummary`

---

### Task 9: [UI] — Add a "Create another trip" link to `components/JoinedTripSummary.tsx`

**Files**
- modify: `components/JoinedTripSummary.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

- [ ] **Step 1 — Apply the change.** In `components/JoinedTripSummary.tsx`, add one new `<Link>`
      element as the last child inside the existing outer `<div className="flex flex-col gap-4 p-4">`,
      placed immediately after the existing `View balances` `<Link>`:

      ```tsx
      <Link href="/trip/new" className="link self-start">
        Create another trip
      </Link>
      ```

      No other change to this file — its existing props, imports, and every other line stay exactly
      as they are.

- [ ] **Step 2 — Run it and confirm it passes.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [ ] **Step 3 — Commit.**
      Message: `feat(023): add a create-another-trip link to JoinedTripSummary`

---

### Task 10: [UI] — Extend `components/SharedTripView.tsx` with creator recognition

**Files**
- modify: `components/SharedTripView.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

This task's compiler check must confirm a clean baseline first: Task 8 left this file with a valid
but unused `CreatedTripSummary` import (a lint-only concern, not a compile error), so `tsc` is
expected to pass cleanly before this task's own change, unlike Tasks 6/7's pairing.

- [ ] **Step 1 — Confirm the current state.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 2 — Write the failing call site.** Inside `loadTrip()`'s existing block

      ```ts
      const local = findJoinedTrip(getJoinedTrips(), token);
      if (local === null) {
        router.replace("/");
        return;
      }
      ```

      change it to

      ```ts
      const local = findJoinedTrip(getJoinedTrips(), token);
      if (local === null) {
        const createdTrip = getCreatedTrips().find((t) => t.shareToken === token) ?? null;
        if (createdTrip !== null) {
          setState({ status: "found-as-creator", createdTrip });
          return;
        }
        router.replace("/");
        return;
      }
      ```

      Do not add the `getCreatedTrips` import yet, and do not add the `"found-as-creator"` variant to
      `ViewState` yet — both happen in Step 4. This step exists only to produce the compiler failure
      below.

- [ ] **Step 3 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, at least error TS2304 on `components/SharedTripView.tsx` —
      `Cannot find name 'getCreatedTrips'.` (A second error, TS2353 or TS2322 on the
      `setState({ status: "found-as-creator", createdTrip })` call, is also likely since that
      `ViewState` variant does not exist yet — both are expected; this step just confirms the run
      fails with errors only in this file.)

- [ ] **Step 4 — Implement to this contract.**

      ```
      File: components/SharedTripView.tsx (modify)
      Imports to add: extend the existing "import { getJoinedTrips, saveJoinedTrips } from
        \"@/lib/storage\";" line to also include getCreatedTrips (do not add a second import line
        from "@/lib/storage"). Add "import type { CreatedTrip } from \"@/lib/types\";" as a new
        import line — the file does not import from lib/types today.
      Type change: extend the existing ViewState union with one new variant, added after the
        existing "found" variant:
          | { status: "found-as-creator"; createdTrip: CreatedTrip }
      Behavior: the Step 2 edit is the complete behavior change to loadTrip() — no further change
        to that function. The rest of loadTrip() (the "offline"/"gone" branches above it, and the
        existing joined-trip update logic below the block shown) is unchanged. Do not call
        getCreatedTrips() anywhere else in this function, and do not attempt to refresh createdTrip's
        cached `trip` fields from `result.trip` (the resolveTripByToken response) — the cached
        snapshot from creation time is authoritative here, since the public endpoint never returns
        budget.
      Render change: add one new branch, placed after the existing "gone" branch and before the
      final `return <JoinedTripSummary ... />` line:
          if (state.status === "found-as-creator") {
            return <CreatedTripSummary createdTrip={state.createdTrip} />;
          }
      Constraints: do not modify the "loading", "offline", or "gone" render branches. Do not modify
                   findJoinedTrip, resolveTripByToken, or lib/join.ts.
      ```

- [ ] **Step 5 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 6 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner. (The `CreatedTripSummary`
      import from Task 8 is now used by the render branch above, so no unused-import warning
      remains.)

- [ ] **Step 7 — Commit.**
      Message: `feat(023): recognize a created trip's own creator in SharedTripView`

---

### Task 11: [Route] — Rewrite the `trip === null` branch of `app/page.tsx`

**Files**
- modify: `app/page.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

Nothing before this task has touched `app/page.tsx` — it is unchanged since before Task 1. This task
both wires the real call sites (`submitSharedTripSetup`, `createSharedTrip`) and rewrites the
redirect logic in one pass, self-contained.

- [ ] **Step 1 — Confirm the current state.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 2 — Implement to this contract.**

      ```
      File: app/page.tsx (modify)
      Imports to add:
        extend the existing "import { getTrip, getJoinedTrips } from \"@/lib/storage\";" line to
        also include getCreatedTrips.
        import { submitSharedTripSetup } from "@/lib/trip"; (new import line)
        import { createSharedTrip } from "@/lib/tripCreation"; (new import line)
        import { useRouter } from "next/navigation"; (new import line — the file does not import
          this today)
      Behavior change: the existing createTripStore/createSavedMessageStore and the
        `if (trip === undefined) { return <DashboardSkeleton />; }` and
        `return <Dashboard trip={trip} showSavedMessage={showSavedMessage} />;` lines are UNCHANGED.
        Add `const router = useRouter();` as the first line inside the Home component, before the
        existing `const [store] = useState(createTripStore);` line.
        Replace the existing block
          useEffect(() => {
            if (trip === null && getJoinedTrips().length > 0) {
              router.replace(`/trips/${getJoinedTrips()[0].shareToken}`);
            }
          }, [trip, router]);

          if (trip === undefined) {
            return <DashboardSkeleton />;
          }

          if (trip === null) {
            if (getJoinedTrips().length > 0) {
              return null;
            }
            return <TripSetupForm onSaved={store.setSnapshot} />;
          }
        with:
          useEffect(() => {
            if (trip !== null) return;
            const created = getCreatedTrips();
            if (created.length > 0) {
              router.replace(`/trips/${created[created.length - 1].shareToken}`);
              return;
            }
            const joined = getJoinedTrips();
            if (joined.length > 0) {
              router.replace(`/trips/${joined[0].shareToken}`);
            }
          }, [trip, router]);

          if (trip === undefined) {
            return <DashboardSkeleton />;
          }

          if (trip === null) {
            if (getCreatedTrips().length > 0 || getJoinedTrips().length > 0) {
              return null;
            }
            return (
              <TripSetupForm
                onSaved={() => {}}
                submit={async (values, deps) => {
                  const result = await submitSharedTripSetup(values, {
                    getCurrencyForCountry: deps.getCurrencyForCountry,
                    createSharedTrip,
                  });
                  if (result.status === "saved") {
                    router.push(`/trips/${result.createdTrip.shareToken}`);
                  }
                  return result;
                }}
              />
            );
          }
      This is a like-for-like replacement of that one block — every other line in the file
      (createTripStore, createSavedMessageStore, the `showSavedMessage` state, the final Dashboard
      render) is UNCHANGED.
      Constraints: do not modify components/Dashboard.tsx, do not modify the `trip !== null` branch,
                   do not add any new redirect target other than the two `/trips/${...}` forms shown.
      ```

- [ ] **Step 3 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 4 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npm run build` → Expected: exit 0, "Compiled successfully" then the route table (this task
      touches a route file).

- [ ] **Step 5 — Commit.**
      Message: `feat(023): redirect to an existing trip or show the server-backed setup form`

---

### Task 12: [Route] — Rewrite `app/trip/new/page.tsx`

**Files**
- modify: `app/trip/new/page.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

- [ ] **Step 1 — Confirm the current state compiles.**
      `npx tsc --noEmit`
      Expected: exit 0, no output. (This task starts from a clean baseline — no prior task left a
      dangling reference in this file.)

- [ ] **Step 2 — Implement to this contract.** Replace the entire contents of
      `app/trip/new/page.tsx` with:

      ```
      File: app/trip/new/page.tsx (rewrite in full)
      Directive: "use client"
      Imports: import { useRouter } from "next/navigation";
               import { createSharedTrip } from "@/lib/tripCreation";
               import { submitSharedTripSetup } from "@/lib/trip";
               import TripSetupForm from "@/components/TripSetupForm";
      Exports: default function NewTripPage()
      Behavior: no local-storage read of any kind, no useEffect, no gate, no NewTripConfirm — this
        route is reachable unconditionally, regardless of any existing local/created/joined trip
        state. It renders exactly:
          const router = useRouter();
          return (
            <TripSetupForm
              onSaved={() => {}}
              submit={async (values, deps) => {
                const result = await submitSharedTripSetup(values, {
                  getCurrencyForCountry: deps.getCurrencyForCountry,
                  createSharedTrip,
                });
                if (result.status === "saved") {
                  router.push(`/trips/${result.createdTrip.shareToken}`);
                }
                return result;
              }}
            />
          );
      Constraints: do not import getTrip, submitNewTrip, deleteSharedTrip, NewTripConfirm,
                   saveExpenses, saveExchangeRates, getSharedTripLink, or clearSharedTripLink in this
                   file — none of feature 003/016's old teardown logic is reachable from this route
                   any longer. Do not delete components/NewTripConfirm.tsx itself (it stays in the
                   tree, unused, until feature 031's cleanup).
      ```

      **Known consequence, accepted per the confirmed decision recorded in spec §7 item 2 and this
      plan's negative constraints:** `components/TripEditForm.tsx` has a live
      `<Link href="/trip/new">Start a new trip</Link>` today, which currently shows
      `components/NewTripConfirm.tsx`'s destructive-replace warning. After this task, that same link
      leads to the new additive flow instead, with no confirmation step, and a v1 trip that already
      has a `sharedTripLink` (feature 016) loses its only in-app path to delete/replace that
      server-side `Trip` row (`submitNewTrip`'s `deleteSharedTrip` call is not reachable from any
      route once this task lands). This is a real, live behavior change to a currently-working
      control, not just documentation drift — it is being shipped anyway because the decision to
      repurpose this route now (rather than adding a second one) was made explicitly; do not attempt
      to preserve the old destructive flow at a different route as an unrequested addition to this
      task.

- [ ] **Step 3 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [ ] **Step 4 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npm run build` → Expected: exit 0, "Compiled successfully" then the route table (this task
      touches a route file).

- [ ] **Step 5 — Commit.**
      Message: `feat(023): repurpose /trip/new as the additive creation flow`

---

### Task 13: [Test] — Playwright coverage for the core creation flow, part 1 (happy path, boundaries, validation)

**Files**
- create: `e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
- test: `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`

- [ ] **Step 1 — Write the spec file with its first 4 tests.** Create
      `e2e/023-create-a-trip-as-a-shared-trip.spec.ts` with one
      `test.describe("feature 023 — create a trip as a shared trip", () => { ... })` block containing
      exactly these 4 tests. Scope every `role="alert"`/`role="status"` assertion to a section
      locator, never a bare `page.getByRole(...)`, since Next.js renders its own route announcer on
      every page. The setup form's fields, from `components/TripSetupForm.tsx`:
      `page.getByLabel("Destination country")` (a `<select>`), `page.getByLabel("Start date")`,
      `page.getByLabel("End date")`, `page.getByLabel("Budget (optional)")`, and the submit button
      `page.getByRole("button", { name: "Start tracking" })`.

      1. `"completes trip setup and lands on the created trip's page with the link already visible"` —
         from an empty device, `page.goto("/")`; select country `"Japan"`, fill start date
         `"2026-11-01"`, end date `"2026-11-10"`, budget `"500"`; wait for
         `page.waitForResponse(res => res.url().endsWith("/api/trips") && res.request().method() === "POST")`
         together with clicking "Start tracking"; assert `page.url()` matches `/trips/[^/]+$`; assert
         the page shows text `"Japan"`, text matching `/\d+ days/`, text containing `"500.00"`, a
         `<p>` containing `"/join/"`, and a `"Copy link"` button; assert no element with the text
         `"Invite friends"` or `"Generate new link"` exists anywhere on the page.
      2. `"creates a trip without a budget"` — same flow, budget left blank; assert the page shows no
         text matching `/^[A-Z]{3} [\d.]+$/` anywhere (no currency-amount line).
      3. `"accepts boundary-value input"` — a `for` loop over two cases (`{ start: "2026-10-01", end: "2026-10-01", budget: "500" }`
         and `{ start: "2026-10-01", end: "2026-10-10", budget: "99999999" }`); for each, a fresh
         `page.goto("/")`, fill the form, submit, assert `page.url()` matches `/trips/[^/]+$` and no
         `role="alert"` element is visible on the page before navigating.
      4. `"refuses invalid setup input"` — a `for` loop over four cases: `{ field: "end", value: "2026-01-01", message: "End date cannot be earlier than the start date." }`
         (with start date `"2026-06-01"`), `{ field: "budget", value: "0", message: "Enter a budget greater than 0." }`,
         `{ field: "budget", value: "-5", message: "Enter a budget greater than 0." }`,
         `{ field: "budget", value: "abc", message: "Enter a budget greater than 0." }`; for each, a
         fresh `page.goto("/")`, fill a valid destination/start/end/budget first, then overwrite the
         one invalid field, submit, assert `page.getByRole("alert").getByText(message)` is visible
         and `page.url()` is still `"/"` (or ends with `"/"` — no `/trips/` navigation happened).

- [ ] **Step 2 — Run it and record the result.**
      `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
      Expected: exit 0, `4 passed`. If any test fails, the defect is in Tasks 1–12's implementation,
      not this spec — diagnose against the relevant task's contract and fix the implementation, never
      loosen an assertion to make a failing test pass.

- [ ] **Step 3 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npx tsc --noEmit` → Expected: exit 0, no output.

- [ ] **Step 4 — Commit.**
      Message: `test(023): add Playwright coverage for trip creation — happy path and validation`

---

### Task 14: [Test] — Playwright coverage for the core creation flow, part 2 (server errors, duplicates, resilience)

**Files**
- modify: `e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
- test: `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`

- [ ] **Step 1 — Append 5 more tests to the same `test.describe` block**, using the same field
      locators and storage-seeding conventions as Task 13 (`localStorage` seeded via
      `page.addInitScript` before first render; storage keys
      `"travel-expense:created-trips"` and `"travel-expense:joined-trips"`, from `STORAGE_KEYS` in
      `lib/storage.ts`).

      5. `"shows a friendly error when the server rejects the creation"` — `page.route("**/api/trips", route => route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Invalid trip data." }) }))`
         before `page.goto("/")`; fill valid input, submit; assert a `role="alert"` element containing
         text `"Could not reach the server. Check your connection and try again."` is visible and
         `page.url()` is still `"/"`.
      6. `"allows a duplicate destination and dates"` — via `request.post("/api/trips", { data: { destinationCountry: "Japan", currency: "JPY", startDate: "2026-11-01", endDate: "2026-11-10" } })`,
         create one real trip first and capture its `id` from the JSON response; `page.goto("/")`,
         fill the identical destination/dates, submit; assert `page.url()` matches `/trips/[^/]+$` and
         the token in that URL is NOT the seeded trip's `id`; assert no `role="alert"` is visible.
      7. `"lets a device with an existing trip create another"` — via `request.post`, create one real
         trip (`destinationCountry: "France"`, `currency: "EUR"`, `startDate: "2026-05-01"`,
         `endDate: "2026-05-10"`) and capture `{ id, shareToken, creatorToken }` from the JSON
         response; seed it into `"travel-expense:created-trips"` as a one-element array
         (`[{ tripId: id, shareToken, creatorToken, trip: { destinationCountry: "France", currency: "EUR", startDate: "2026-05-01", endDate: "2026-05-10" } }]`)
         via `page.addInitScript`; `page.goto("/trip/new")`; fill a second trip's details
         (`destinationCountry: "Japan"`, distinct dates), submit; assert `page.url()` matches
         `/trips/[^/]+$` and is NOT the first trip's URL; open the trip switcher
         (`page.getByRole("button", { name: "Switch trip" })`, click, then within the
         `role="dialog"`) and assert both `"France"` and `"Japan"` appear as separate list entries,
         each inside a link whose `href` matches `/^\/trips\//`.
      8. `"shows a friendly error when the server is unreachable"` — `page.route("**/api/trips", route => route.abort())`
         before `page.goto("/")`; fill valid input including a distinctive budget `"777"`, submit;
         assert a `role="alert"` element containing the same friendly-error text as test 5 is visible,
         `page.url()` is still `"/"`, and `page.getByLabel("Budget (optional)")` still has the value
         `"777"`.
      9. `"double-tapping submit creates only one trip"` — count intercepted requests via
         `page.route("**/api/trips", async route => { requestCount += 1; await route.continue(); })`
         (a `let requestCount = 0` declared before `page.goto`); fill valid input; dispatch two raw
         `click` events on the submit button in one synchronous `evaluate` call (`.click()` would
         deadlock against the synchronously-disabled button, since `TripSetupForm` disables it before
         any `await`), using exactly this pattern (verbatim, matching
         `e2e/016-generate-shareable-trip-link.spec.ts`'s existing double-tap test):

         ```ts
         const button = page.getByRole("button", { name: "Start tracking" });
         await button.evaluate((el) => {
           el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
           el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
         });
         ```

         assert `page.url()` eventually matches `/trips/[^/]+$` and `requestCount` equals `1`.

- [ ] **Step 2 — Run it and record the result.**
      `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
      Expected: exit 0, `9 passed` (the 4 from Task 13 plus these 5). If any test fails, the defect
      is in Tasks 1–12's implementation, not this spec.

- [ ] **Step 3 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npx tsc --noEmit` → Expected: exit 0, no output.

- [ ] **Step 4 — Commit.**
      Message: `test(023): add Playwright coverage for trip creation — server errors and resilience`

---

### Task 15: [Test] — Playwright coverage for the core creation flow, part 3 (navigation, dates, mobile)

**Files**
- modify: `e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
- test: `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`

- [ ] **Step 1 — Append 3 more tests to the same `test.describe` block.**

      10. `"refreshing mid-form loses unsaved input"` — `page.goto("/")`; select country `"Japan"` and
          fill the start date; `page.reload()`; assert `page.getByLabel("Destination country")` has
          value `""` (empty selection).
      11. `"accepts dates outside the ordinary range"` — `page.goto("/")`; fill start date
          `"2020-01-01"` (past) and end date `"2030-12-31"` (far future), a valid budget, submit;
          assert `page.url()` matches `/trips/[^/]+$` and no `role="alert"` is visible.
      12. `"the share link displays legibly on mobile with a working copy action"` —
          `test.use({ viewport: { width: 375, height: 667 } })` for this one test (Playwright allows
          per-test `test.use` inside a `test.describe` block); `context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3000" })`;
          complete a trip creation; locate the link `<p>` (the one containing text `"/join/"`) and
          assert its `boundingBox()!.width` is less than or equal to `375`; click "Copy link"; assert
          a `role="status"` element containing `"Link copied."` is visible and
          `page.evaluate(() => navigator.clipboard.readText())` equals the link paragraph's own text
          content.

- [ ] **Step 2 — Run it and record the result.**
      `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
      Expected: exit 0, `12 passed` (the 9 from Tasks 13–14 plus these 3). If any test fails, the
      defect is in Tasks 1–12's implementation, not this spec.

- [ ] **Step 3 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npx tsc --noEmit` → Expected: exit 0, no output.

- [ ] **Step 4 — Commit.**
      Message: `test(023): add Playwright coverage for trip creation — navigation, dates, mobile`

---

### Task 16: [UI] — Recognize a created trip's creator in `components/ManageParticipants.tsx`

**Files**
- modify: `components/ManageParticipants.tsx`
- modify: `e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
- test: `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`

- [ ] **Step 1 — Write the failing test.** Append one new test to the existing
      `test.describe` block in `e2e/023-create-a-trip-as-a-shared-trip.spec.ts`, named
      `"a created trip's creator can view its participants"`: via `request.post("/api/trips", { data: { destinationCountry: "Japan", currency: "JPY", startDate: "2026-11-01", endDate: "2026-11-10" } })`
      create a real trip and capture `{ id, shareToken, creatorToken }` from the JSON response; seed
      it into `"travel-expense:created-trips"` as a one-element array
      (`[{ tripId: id, shareToken, creatorToken, trip: { destinationCountry: "Japan", currency: "JPY", startDate: "2026-11-01", endDate: "2026-11-10" } }]`)
      via `page.addInitScript`; `page.goto(`/trips/${shareToken}/participants`)`; assert
      `page.getByText("Trip creator")` is visible and no `role="alert"` element is visible (today,
      before Step 3's change, this device is treated as a stray visitor and redirected to `"/"`, so
      this assertion fails).

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
      Expected: exit 1, `1 failed` (the new test), `12 passed` (the existing 12 from Tasks 13–15
      remain green).

- [ ] **Step 3 — Implement to this contract.** In `components/ManageParticipants.tsx`:

      ```
      File: components/ManageParticipants.tsx (modify)
      Imports to add: extend the existing
        "import { getSharedTripLink, getJoinedTrips, saveJoinedTrips } from \"@/lib/storage\";" line
        to also include getCreatedTrips.
      Behavior change inside loadParticipants(), replacing the existing:
          if (sharedLink !== null && sharedLink.shareToken === token) {
            resolved = {
              kind: "creator",
              tripId: sharedLink.tripId,
              token: sharedLink.creatorToken,
            };
          } else {
            const joined = findJoinedTrip(getJoinedTrips(), token);
            ...
          }
      with:
          if (sharedLink !== null && sharedLink.shareToken === token) {
            resolved = {
              kind: "creator",
              tripId: sharedLink.tripId,
              token: sharedLink.creatorToken,
            };
          } else {
            const createdTrip = getCreatedTrips().find((t) => t.shareToken === token) ?? null;
            if (createdTrip !== null) {
              resolved = {
                kind: "creator",
                tripId: createdTrip.tripId,
                token: createdTrip.creatorToken,
              };
            } else {
              const joined = findJoinedTrip(getJoinedTrips(), token);
              ...  (unchanged inner body)
            }
          }
      Check order: the existing sharedLink check runs first, unchanged; the new createdTrips check
      runs second; the existing joined-trip check runs last, only when neither of the first two
      matched.
      Constraints: do not modify handleConfirm, the render branches, or ConfirmParticipantAction.
      ```

- [ ] **Step 4 — Run it and confirm it passes.**
      `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
      Expected: exit 0, `13 passed`.

- [ ] **Step 5 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npx tsc --noEmit` → Expected: exit 0, no output.

- [ ] **Step 6 — Commit.**
      Message: `feat(023): recognize a created trip's creator in ManageParticipants`

---

### Task 17: [UI] — Recognize a created trip's creator in `components/SharedExpenseForm.tsx`

**Files**
- modify: `components/SharedExpenseForm.tsx`
- modify: `e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
- test: `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`

- [ ] **Step 1 — Write the failing test.** Append one new test named
      `"a created trip's creator can record an expense"`: via
      `request.post("/api/trips", { data: { destinationCountry: "Japan", currency: "JPY", startDate: "2026-11-01", endDate: "2026-11-10" } })`
      create a real trip and capture `{ id, shareToken, creatorToken }` from the JSON response; seed
      it into `"travel-expense:created-trips"` as a one-element array
      (`[{ tripId: id, shareToken, creatorToken, trip: { destinationCountry: "Japan", currency: "JPY", startDate: "2026-11-01", endDate: "2026-11-10" } }]`)
      via `page.addInitScript`; `page.goto(`/trips/${shareToken}/expenses/new`)`; fill
      `page.getByLabel("Amount")` with `"20"`, select the first non-empty `<option>` of
      `page.getByLabel("Category")` and of `page.getByLabel("Payment method")`, fill
      `page.getByLabel("Location")` with `"Test"`; click
      `page.getByRole("button", { name: "Save expense" })` (the form's exact submit button text, from
      `components/SharedExpenseForm.tsx`); assert `page.url()` matches
      `/trips\/[^/]+\/expenses\/[^/]+$` (today, before Step 3's change, this device is redirected to
      `"/"` instead).

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
      Expected: exit 1, `1 failed` (the new test), `13 passed` (Tasks 13–16's tests remain green).

- [ ] **Step 3 — Implement to this contract.** In `components/SharedExpenseForm.tsx`:

      ```
      File: components/SharedExpenseForm.tsx (modify)
      Imports to add: extend the existing
        "import { getSharedTripLink, getJoinedTrips, getTrip } from \"@/lib/storage\";" line to also
        include getCreatedTrips.
      Behavior change inside loadContext(), replacing the existing:
          if (sharedLink !== null && sharedLink.shareToken === token) {
            const localTrip = getTrip();
            if (localTrip !== null) {
              resolved = {
                tripId: sharedLink.tripId,
                auth: { role: "creator", token: sharedLink.creatorToken },
                myOptionId: TRIP_CREATOR_ID,
                tripDates: { startDate: localTrip.startDate, endDate: localTrip.endDate },
                tripCurrency: localTrip.currency,
              };
            }
          } else {
            const joined = findJoinedTrip(getJoinedTrips(), token);
            ... (unchanged)
          }
      with:
          if (sharedLink !== null && sharedLink.shareToken === token) {
            const localTrip = getTrip();
            if (localTrip !== null) {
              resolved = {
                tripId: sharedLink.tripId,
                auth: { role: "creator", token: sharedLink.creatorToken },
                myOptionId: TRIP_CREATOR_ID,
                tripDates: { startDate: localTrip.startDate, endDate: localTrip.endDate },
                tripCurrency: localTrip.currency,
              };
            }
          } else {
            const createdTrip = getCreatedTrips().find((t) => t.shareToken === token) ?? null;
            if (createdTrip !== null) {
              resolved = {
                tripId: createdTrip.tripId,
                auth: { role: "creator", token: createdTrip.creatorToken },
                myOptionId: TRIP_CREATOR_ID,
                tripDates: { startDate: createdTrip.trip.startDate, endDate: createdTrip.trip.endDate },
                tripCurrency: createdTrip.trip.currency,
              };
            } else {
              const joined = findJoinedTrip(getJoinedTrips(), token);
              ... (unchanged inner body)
            }
          }
      Check order: sharedLink+localTrip checked first (unchanged); createdTrips checked second;
      joined-trip checked last.
      Constraints: do not modify the rest of loadContext (the currency/initialValues hydration, the
                   getParticipants call, or the attribution-options setup), do not modify
                   handleSplitMethodChange or any submit handler.
      ```

- [ ] **Step 4 — Run it and confirm it passes.**
      `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
      Expected: exit 0, `14 passed`.

- [ ] **Step 5 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npx tsc --noEmit` → Expected: exit 0, no output.

- [ ] **Step 6 — Commit.**
      Message: `feat(023): recognize a created trip's creator in SharedExpenseForm`

---

### Task 18: [UI] — Recognize a created trip's creator in `components/SharedExpenseDetail.tsx`

**Files**
- modify: `components/SharedExpenseDetail.tsx`
- modify: `e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
- test: `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`

- [ ] **Step 1 — Write the failing test.** Append one new test named
      `"a created trip's creator can view an expense's detail page"`: via
      `request.post("/api/trips", { data: { destinationCountry: "Japan", currency: "JPY", startDate: "2026-11-01", endDate: "2026-11-10" } })`
      create a real trip and capture `{ id, shareToken, creatorToken }` from the JSON response; seed
      it into `"travel-expense:created-trips"` as a one-element array
      (`[{ tripId: id, shareToken, creatorToken, trip: { destinationCountry: "Japan", currency: "JPY", startDate: "2026-11-01", endDate: "2026-11-10" } }]`)
      via `page.addInitScript`; via
      `request.post(`/api/trips/${id}/expenses`, { headers: { "x-creator-token": creatorToken }, data: { amount: 20, currency: "JPY", category: "Food", date: "2026-11-02", paymentMethod: "Cash", location: "Test", payerParticipantId: null, shares: [{ participantId: null, amount: 20 }] } })`
      create one real expense on that trip and capture its `id` from the JSON response's
      `expense.id`; `page.goto(`/trips/${shareToken}/expenses/${expenseId}`)`; assert
      `page.getByText("Food")` is visible (today, before Step 3's change, this device is redirected
      to `"/"` instead).

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
      Expected: exit 1, `1 failed` (the new test), `14 passed` (Tasks 13–17's tests remain green).

- [ ] **Step 3 — Implement to this contract.** In `components/SharedExpenseDetail.tsx`:

      ```
      File: components/SharedExpenseDetail.tsx (modify)
      Imports to add: extend the existing
        "import { getSharedTripLink, getJoinedTrips } from \"@/lib/storage\";" line to also include
        getCreatedTrips.
      Behavior change inside loadDetail(), replacing the existing:
          if (sharedLink !== null && sharedLink.shareToken === token) {
            resolved = {
              tripId: sharedLink.tripId,
              auth: { role: "creator", token: sharedLink.creatorToken },
            };
          } else {
            const joined = findJoinedTrip(getJoinedTrips(), token);
            ... (unchanged)
          }
      with:
          if (sharedLink !== null && sharedLink.shareToken === token) {
            resolved = {
              tripId: sharedLink.tripId,
              auth: { role: "creator", token: sharedLink.creatorToken },
            };
          } else {
            const createdTrip = getCreatedTrips().find((t) => t.shareToken === token) ?? null;
            if (createdTrip !== null) {
              resolved = {
                tripId: createdTrip.tripId,
                auth: { role: "creator", token: createdTrip.creatorToken },
              };
            } else {
              const joined = findJoinedTrip(getJoinedTrips(), token);
              ... (unchanged inner body)
            }
          }
      Check order: sharedLink checked first (unchanged); createdTrips checked second; joined-trip
      checked last.
      Constraints: do not modify the rest of this component (the expense/participants load, the
                   payerNeedsReselection logic, or the edit-attribution submit handler).
      ```

- [ ] **Step 4 — Run it and confirm it passes.**
      `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
      Expected: exit 0, `15 passed`.

- [ ] **Step 5 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npx tsc --noEmit` → Expected: exit 0, no output.

- [ ] **Step 6 — Commit.**
      Message: `feat(023): recognize a created trip's creator in SharedExpenseDetail`

---

### Task 19: [UI] — Recognize a created trip's creator in `components/TripBalances.tsx`

**Files**
- modify: `components/TripBalances.tsx`
- modify: `e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
- test: `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`

- [ ] **Step 1 — Write the failing test.** Append one new test named
      `"a created trip's creator can view its balances"`: via
      `request.post("/api/trips", { data: { destinationCountry: "Japan", currency: "JPY", startDate: "2026-11-01", endDate: "2026-11-10" } })`
      create a real trip and capture `{ id, shareToken, creatorToken }` from the JSON response; seed
      it into `"travel-expense:created-trips"` as a one-element array
      (`[{ tripId: id, shareToken, creatorToken, trip: { destinationCountry: "Japan", currency: "JPY", startDate: "2026-11-01", endDate: "2026-11-10" } }]`)
      via `page.addInitScript`; `page.goto(`/trips/${shareToken}/balances`)`; assert
      `page.getByText("Everyone is settled up.")` is visible (today, before Step 3's change, this
      device is redirected to `"/"` instead).

- [ ] **Step 2 — Run it and confirm it fails.**
      `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
      Expected: exit 1, `1 failed` (the new test), `15 passed` (Tasks 13–18's tests remain green).

- [ ] **Step 3 — Implement to this contract.** In `components/TripBalances.tsx`:

      ```
      File: components/TripBalances.tsx (modify)
      Imports to add: extend the existing
        "import { getSharedTripLink, getJoinedTrips } from \"@/lib/storage\";" line to also include
        getCreatedTrips.
      Behavior change inside load(), replacing the existing:
          if (sharedLink !== null && sharedLink.shareToken === token) {
            resolved = {
              kind: "creator",
              tripId: sharedLink.tripId,
              token: sharedLink.creatorToken,
            };
          } else {
            const joined = findJoinedTrip(getJoinedTrips(), token);
            ... (unchanged)
          }
      with:
          if (sharedLink !== null && sharedLink.shareToken === token) {
            resolved = {
              kind: "creator",
              tripId: sharedLink.tripId,
              token: sharedLink.creatorToken,
            };
          } else {
            const createdTrip = getCreatedTrips().find((t) => t.shareToken === token) ?? null;
            if (createdTrip !== null) {
              resolved = {
                kind: "creator",
                tripId: createdTrip.tripId,
                token: createdTrip.creatorToken,
              };
            } else {
              const joined = findJoinedTrip(getJoinedTrips(), token);
              ... (unchanged inner body)
            }
          }
      Check order: sharedLink checked first (unchanged); createdTrips checked second; joined-trip
      checked last.
      Constraints: do not modify the rest of load() (the fetchTripBalances call or its branches), do
                   not modify handleSettleConfirm.
      ```

- [ ] **Step 4 — Run it and confirm it passes.**
      `npx playwright test e2e/023-create-a-trip-as-a-shared-trip.spec.ts`
      Expected: exit 0, `16 passed`.

- [ ] **Step 5 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npx tsc --noEmit` → Expected: exit 0, no output.

- [ ] **Step 6 — Commit.**
      Message: `feat(023): recognize a created trip's creator in TripBalances`

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

    feat(023): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: doc/features/023-create-a-trip-as-a-shared-trip/spec.md

Never commit on a failing lint, typecheck, or build.
