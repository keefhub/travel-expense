# Switch Between Multiple Trips — Implementation Plan

**Status:** Complete
**Source:** `doc/features/018-switch-between-multiple-trips/spec.md`
**Goal:** Let a device that belongs to more than one trip (its own local trip, plus any shared
trips it has joined via link) see all of them in a switcher, move between them, and have the
switch behave safely — unsaved-input warning, offline handling, stale-trip pruning, refresh
stability, and correct role labels ("Own trip" / "Created" / "Joined").

**Architecture:**
No new storage key. A device's local trip (`getTrip()`) is either unshared ("own trip") or shared
("created", once `getSharedTripLink()` is non-null) — never both, since both live in single-slot
storage keys. A new route, `/trips/[token]`, and its component `SharedTripView.tsx`, is how a
joined trip is viewed from the switcher; it always revalidates over the network via `lib/join.ts`'s
existing `resolveTripByToken` (never trusting the cached `joinedTrips` snapshot alone), which is
what lets it detect an offline device and a since-deleted trip — this is deliberately a *different*
route from feature 017's `/join/[token]`, which is left completely untouched so its already-shipped
"skip the network once already joined" shortcut keeps working exactly as before. A new header
component, `TripSwitcher.tsx`, mounted globally in `app/layout.tsx`, renders nothing unless the
device belongs to more than one trip, and otherwise offers a small modal listing every trip as a
plain `<Link>` — because they're plain anchors, the existing `useUnsavedChangesWarning` hook (011)
already intercepts a switch attempted from a dirty expense form, with zero new warning code.
`app/page.tsx`'s home route gains one new branch: a device with no local trip but at least one
joined trip is redirected to that joined trip instead of being stuck at trip setup.

Two tasks below (Task 1, Task 5) are **refactor-template** extractions, not new behavior — used
specifically to avoid inventing a throwaway file just to give a brand-new pure module a real
"red step" consumer: the consuming component is built first (with its logic inline), then the pure
logic is mechanically pulled out into its own `lib/` module once a real caller already exists.
Playwright coverage for this feature's seven Gherkin scenarios is deliberately **one final task**
(Task 6), not interleaved per-task — this matches how features 016 and 017 actually shipped in this
repo (`git log --grep="^feat(017)"` shows implementation tasks landing first, and
`feat(017): add Playwright coverage for joining a shared trip via link` as the last, separate
commit), and every behavior Task 6 exercises is already fully built and compiler-verified by the
tasks before it.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage plus feature 017's existing `GET /api/join/[token]` — no new backend
surface. Verification: `npm run lint`, `npx tsc --noEmit`, `npm run build`,
`npx playwright test e2e/018-switch-between-multiple-trips.spec.ts`.

---

### Task 1: [UI] — Extract JoinedTripSummary from JoinTrip's joined-view branch

**Files**

- create: `components/JoinedTripSummary.tsx`
- modify: `components/JoinTrip.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts`

This is a **mechanical, behavior-preserving extraction** — `components/JoinTrip.tsx`'s existing
`// status === "joined"` return block is moved verbatim into a new, reusable component so a later
task (Task 2) can render the identical markup from a different screen. No logic changes.

- [x] **Step 1 — Create the extracted component.** Create `components/JoinedTripSummary.tsx` with
      exactly this content:

      ```tsx
      "use client";

      import Link from "next/link";
      import type { JoinedTrip } from "@/lib/types";

      export default function JoinedTripSummary({
        joinedTrip,
        storageWarning,
      }: {
        joinedTrip: JoinedTrip;
        storageWarning?: string | null;
      }) {
        return (
          <div className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">
              {joinedTrip.trip.destinationCountry}
            </h1>
            <p>
              {joinedTrip.trip.startDate} to {joinedTrip.trip.endDate}
            </p>
            <p>Joined as {joinedTrip.participantName}.</p>
            {storageWarning && (
              <p role="status" className="text-sm text-(--warning-text)">
                {storageWarning}
              </p>
            )}
            <Link href="/" className="link self-start">
              Back to home
            </Link>
          </div>
        );
      }
      ```

- [x] **Step 2 — Wire it into JoinTrip.tsx.** In `components/JoinTrip.tsx`:
      1. Add `import JoinedTripSummary from "@/components/JoinedTripSummary";` alongside the
         existing imports.
      2. Replace the entire final return block (the comment `// status === "joined"` followed by
         its `return (...)` — currently the last ~19 lines of the file, ending the component) with:

         ```tsx
         // status === "joined"
         return (
           <JoinedTripSummary
             joinedTrip={joinedTrip!}
             storageWarning={storageWarning}
           />
         );
         ```
      3. Remove the now-unused `import Link from "next/link";` line from the top of the file —
         the removed block was the only place this file used `Link` (it appeared twice, both
         inside the block just replaced). Leave every other import as-is.
      4. Do not change anything else in the file — `status`, `joinedTrip`, `storageWarning`, and
         every other branch (`"loading"`, `"invalid"`, `"offline"`, `"ready"`) stay exactly as
         they are today.

- [x] **Step 3 — Build verification.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's two banner lines.
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/join/[token]` unchanged from before this change.

- [x] **Step 4 — Regression run.** This file is covered by feature 017's existing behavioral gate;
      confirm the extraction changed nothing observable.
      `npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts`
      Expected: exit 0, `17 passed`.

- [x] **Step 5 — Commit.**
      Message: `refactor(018): extract JoinedTripSummary out of JoinTrip's joined-view branch`

---

### Task 2: [UI/Route] — SharedTripView and the /trips/[token] route

**Files**

- create: `components/SharedTripView.tsx`
- create: `app/trips/[token]/page.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

This is the connectivity-gated viewer for a shared trip the device has already joined, reached
**only** from the switcher (Task 4) — never from `/join/[token]`, which is untouched. Unlike
`JoinTrip.tsx`, it never trusts a local cache hit alone: it always calls `resolveTripByToken`, so it
can tell the difference between "offline" and "this trip no longer exists."

- [x] **Step 1 — Write the failing call site.** Create `app/trips/[token]/page.tsx`:

      ```tsx
      "use client";

      import { use } from "react";
      import SharedTripView from "@/components/SharedTripView";

      export default function TripPage(props: PageProps<"/trips/[token]">) {
        const { token } = use(props.params);
        return <SharedTripView token={token} />;
      }
      ```

      This mirrors `app/join/[token]/page.tsx`'s existing pattern exactly: it does **not** call
      `getTrip()` and does **not** redirect based on it — a device may have no local trip at all
      and must still be able to view a joined trip.

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, error TS2307 on `app/trips/[token]/page.tsx` —
      `Cannot find module '@/components/SharedTripView' or its corresponding type declarations.`

      ~~Expected: these are the only two errors.~~ **Corrected during execution:** a brand-new route
      also surfaces `TS2344` (`` `PageProps<"/trips/[token]">` does not satisfy the constraint
      'AppRoutes' ``) and a cascading `TS2339` on the unwrapped param, because
      `.next/types/routes.d.ts` is a stale build artifact until a build regenerates it. The TS2307
      above is still the expected *first* error; the other two are not defects. See `log.txt` Task 2
      and `REFERENCE.md` §5.

- [x] **Step 3 — Implement to this contract.**

      ```
      File: components/SharedTripView.tsx  (create, 'use client')
      Exports: default function SharedTripView({ token }: { token: string }): JSX.Element | null
      Imports needed:
        import { useEffect, useState } from "react";
        import { useRouter } from "next/navigation";
        import Link from "next/link";
        import type { JoinedTrip } from "@/lib/types";
        import { getJoinedTrips, saveJoinedTrips } from "@/lib/storage";
        import { resolveTripByToken, findJoinedTrip } from "@/lib/join";
        import JoinedTripSummary from "@/components/JoinedTripSummary";

      Internal state type:
        type ViewState =
          | { status: "loading" }
          | { status: "offline" }
          | { status: "gone" }
          | { status: "found"; joinedTrip: JoinedTrip };

      Component body opens with:
        const router = useRouter();
        const [state, setState] = useState<ViewState>({ status: "loading" });

      Behavior — one useEffect keyed on [token, router], calling an async function that runs once
      per token change:
        1. Call `const result = await resolveTripByToken(token);` (from lib/join.ts — do not
           reimplement this call, and do not check `findJoinedTrip` before calling it, unlike
           JoinTrip.tsx — every visit to this component must hit the network).
        2. result.ok === false && result.reason === "offline"
             -> setState({ status: "offline" }). Do not touch storage.
        3. result.ok === false && result.reason === "not-found"
             -> call `saveJoinedTrips(getJoinedTrips().filter((t) => t.shareToken !== token));`
                (removes the stale entry, if any — a no-op filter if none matches)
             -> setState({ status: "gone" })
        4. result.ok === true
             -> const local = findJoinedTrip(getJoinedTrips(), token);
             -> if local === null: call router.replace("/") and return (no setState call — this
                is an unreachable-in-practice guard for a stray/foreign token never joined on this
                device, not a modeled user scenario)
             -> else: build `const updated: JoinedTrip = { ...local, trip: result.trip };`
                call `saveJoinedTrips(getJoinedTrips().map((t) => t.shareToken === token ? updated : t));`
                setState({ status: "found", joinedTrip: updated })
      `router` is included in the effect's dependency array because it is referenced inside the
      effect body (the `local === null` guard branch) — `useRouter()`'s returned object is stable
      across renders in this Next.js version, so including it never causes an extra re-run, but
      omitting it would trip `react-hooks/exhaustive-deps` (an active lint rule in this repo's
      `eslint-config-next` preset).

      Render:
        status "loading" -> return null
        status "offline" -> return (
          <div className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">Trip</h1>
            <p>Viewing this trip requires an internet connection. Check your connection and try again.</p>
          </div>
        )
        status "gone" -> return (
          <div className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">Trip</h1>
            <p>This trip is no longer available.</p>
            <Link href="/" className="link self-start">Back to home</Link>
          </div>
        )
        status "found" -> return <JoinedTripSummary joinedTrip={state.joinedTrip} />

      Constraints:
        - Must not call getTrip(), saveTrip(), or read/write STORAGE_KEYS.trip anywhere (mirrors
          JoinTrip.tsx's existing boundary — this component never touches the device's own trip).
        - Must not call findJoinedTrip before resolveTripByToken (that shortcut belongs only to
          JoinTrip.tsx / the /join/[token] route, which this task does not modify).
        - Must not modify components/JoinTrip.tsx, app/join/[token]/page.tsx, or lib/join.ts.
      ```

- [x] **Step 4 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 5 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npm run build` → Expected: exit 0, "Compiled successfully", route table now includes
      `/trips/[token]` alongside every existing route.

- [x] **Step 6 — Commit.**
      Message: `feat(018): add SharedTripView and the /trips/[token] route`

---

### Task 3: [Route] — app/page.tsx redirects to a joined trip when no local trip exists

**Files**

- modify: `app/page.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

Today, `app/page.tsx`'s `Home` component shows `TripSetupForm` whenever `getTrip()` is `null` —
even if the device already belongs to one or more joined trips. This task adds the missing branch:
if there's no local trip but at least one joined trip, redirect to it instead.

- [x] **Step 1 — Add the imports and the router.** `getJoinedTrips` already exists as an export of
      `lib/storage.ts` (added by feature 017) — this task only adds a new call site for it, not a
      new export. In `app/page.tsx`, extend the existing import line
      `import { getTrip } from "@/lib/storage";` to
      `import { getTrip, getJoinedTrips } from "@/lib/storage";` (do not add a second import line
      from that specifier), and add a new import line
      `import { useRouter } from "next/navigation";`. Inside the `Home` component, add
      `const router = useRouter();` as the first line of the function body, immediately before the
      existing `const [store] = useState(createTripStore);` line.

      This task has no compiler "red step": unlike Tasks 2 and 4, it adds a new branch to an
      already-typechecking file rather than wiring a not-yet-existing module, so there is no
      natural failing state to confirm first. Proceed directly to Step 2.

- [x] **Step 2 — Implement the redirect branch.** `Home`'s body currently reads, in this exact
      order (after Step 1's addition): the `router`/`useState`/`useSyncExternalStore`
      declarations, then `if (trip === undefined) { return <DashboardSkeleton />; }`, then
      `if (trip === null) { return <TripSetupForm onSaved={store.setSnapshot} />; }`, then the
      final `return <Dashboard ... />`. Two changes, in this exact order:

      1. Insert the new `useEffect` **immediately after** the existing
         `const showSavedMessage = useSyncExternalStore(...)` declaration and **before** the
         `if (trip === undefined)` check — it must run on every render, unconditionally, never
         after a conditional `return`:

         ```tsx
         useEffect(() => {
           if (trip === null && getJoinedTrips().length > 0) {
             router.replace(`/trips/${getJoinedTrips()[0].shareToken}`);
           }
         }, [trip, router]);
         ```

      2. Replace only the existing block

         ```tsx
         if (trip === null) {
           return <TripSetupForm onSaved={store.setSnapshot} />;
         }
         ```

         with:

         ```tsx
         if (trip === null) {
           if (getJoinedTrips().length > 0) {
             return null;
           }
           return <TripSetupForm onSaved={store.setSnapshot} />;
         }
         ```

      Add `import { useEffect } from "react";` to the existing `"react"` import line (which
      currently imports `useState, useSyncExternalStore` — extend it to
      `useEffect, useState, useSyncExternalStore`, do not add a second `"react"` import line).

      Behavior — exact branches:
        - `trip === undefined` (still resolving) → unchanged, renders `<DashboardSkeleton />` as
          today; the `useEffect` above still runs on this render (hooks always run, regardless of
          which branch a later `return` takes), but its own condition checks `trip === null`, not
          `undefined`, so it does nothing on this render.
        - `trip === null` and `getJoinedTrips().length === 0` → renders `<TripSetupForm ... />`,
          exactly as today.
        - `trip === null` and `getJoinedTrips().length > 0` → renders `null` on this pass, and the
          `useEffect` fires `router.replace()` to `/trips/{getJoinedTrips()[0].shareToken}` —
          `[0]` is array order (oldest-joined-first, `joinedTrips`' natural append order from
          `lib/join.ts`'s `joinTrip`). This is deliberately the same "render null, redirect in a
          `useEffect`" pattern already used by `app/expenses/new/page.tsx`,
          `app/categories/page.tsx`, `app/trip/edit/page.tsx`, and `app/settings/page.tsx`.
        - `trip !== undefined && trip !== null` → unchanged, renders `<Dashboard ... />` as today.

      Constraint: the `useEffect` call itself must be textually unconditional — never move it
      after an `if (...) return` — or `npm run lint`'s `react-hooks/rules-of-hooks` check (an
      error-level rule in this repo's `eslint-config-next` preset) fails, and React itself throws
      "Rendered fewer hooks than expected" the first time `trip` resolves from `undefined` to
      `null`/`Trip` on a real page load.

      Reading `getJoinedTrips()` directly during render here (not only inside the effect) is safe
      for the same reason `components/Dashboard.tsx`'s own file comment documents for its plain
      storage reads: this branch is only reached after `trip !== undefined` has already resolved
      client-side, so there is no SSR/hydration pass of this code path to mismatch.

      Constraints: do not change the `trip === undefined` branch, the `Dashboard` branch, or
      `TripSetupForm`'s props. Do not modify `components/TripSetupForm.tsx`,
      `components/Dashboard.tsx`, or `lib/storage.ts`.

- [x] **Step 3 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 4 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npm run build` → Expected: exit 0, "Compiled successfully", route table unchanged (no new
      route — `/` already existed).

- [x] **Step 5 — Commit.**
      Message: `feat(018): redirect home to a joined trip when no local trip exists`

---

### Task 4: [UI/Route] — TripSwitcher, mounted globally

**Files**

- create: `components/TripSwitcher.tsx`
- modify: `app/layout.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

The switcher's entry-computation logic is written **inline** in this task (not yet in `lib/`) —
Task 5 mechanically extracts it once this real consumer exists, per this plan's Architecture note.

- [x] **Step 1 — Write the failing call site.** In `app/layout.tsx`, add
      `import TripSwitcher from "@/components/TripSwitcher";` to the existing import block, and add
      `<TripSwitcher />` as the first child of `<body ...>`, immediately before `<main ...>` (so the
      body becomes `<body ...><TripSwitcher /><main ...>{children}</main><BottomNav /></body>`).
      Do not change any existing className or the `<BottomNav />` line.

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, error TS2307 on `app/layout.tsx` —
      `Cannot find module '@/components/TripSwitcher' or its corresponding type declarations.`

- [x] **Step 3 — Implement to this contract.**

      ```
      File: components/TripSwitcher.tsx  (create, 'use client')
      Exports: default function TripSwitcher(): JSX.Element | null
      Imports needed:
        import { useEffect, useState } from "react";
        import Link from "next/link";
        import { usePathname } from "next/navigation";
        import type { Trip, SharedTripLink, JoinedTrip } from "@/lib/types";
        import { getTrip, getSharedTripLink, getJoinedTrips } from "@/lib/storage";

      Internal types (module-scoped, not exported — this task keeps them local; Task 5 moves them):
        type TripRole = "own" | "created" | "joined";
        interface SwitcherEntry { role: TripRole; label: string; href: string; shareToken?: string }

      computeEntries(trip: Trip | null, sharedLink: SharedTripLink | null, joined: JoinedTrip[]): SwitcherEntry[]
        Behavior, in this exact order:
          1. If trip !== null: push one entry —
             { role: sharedLink !== null ? "created" : "own", label: trip.destinationCountry, href: "/" }
          2. For each entry `jt` of `joined`, in array order: push —
             { role: "joined", label: jt.trip.destinationCountry, href: `/trips/${jt.shareToken}`, shareToken: jt.shareToken }
          3. Return the resulting array (local entry first when present, joined entries after, in
             their existing array order — do not sort).

      Component body — deliberately does NOT use useSyncExternalStore. This component is mounted
      once in the root layout and never remounts across client-side navigation (Next.js App Router
      only swaps the segment under `{children}`, not the root layout), so a value cached at first
      mount (the useSyncExternalStore-with-a-`hasRead`-flag idiom `app/page.tsx`'s createTripStore
      uses) would never notice a later change — e.g. a joined trip pruned from storage after this
      component's first paint. Instead, `computeEntries(...)` is called directly in the render
      body, uncached, so it re-reads storage fresh on every render this component makes — which
      happens on every navigation already, because `usePathname()` (used below) itself triggers a
      re-render whenever the URL changes, and again whenever `isOpen` toggles:

        const [mounted, setMounted] = useState(false);
        useEffect(() => {
          setMounted(true);
        }, []);
        ~~[CORRECTED — this idiom cannot ship: `react-hooks/set-state-in-effect` is an error-level
        rule in this repo, so `npm run lint` fails on it. Replaced during execution with a
        module-scope `useSyncExternalStore` hydration guard (constant `true`/`false` snapshots,
        not a data store). See `log.txt` Task 4.~~
        const pathname = usePathname();
        const [isOpen, setIsOpen] = useState(false);

        if (!mounted) return null;
          (renders nothing on the server and on the very first client render before hydration
          completes, matching this app's established "never read localStorage during the render
          that must match SSR" rule — REFERENCE.md §5 — then re-renders once mounted flips true)

        const entries = computeEntries(getTrip(), getSharedTripLink(), getJoinedTrips());

        if (entries.length < 2) return null;

        const activeEntry = entries.find((e) => e.href === pathname) ?? entries[0];
          (`entries[0]` as fallback is always the local trip entry when one exists, per
          computeEntries' ordering — correct for every route in this app other than
          "/trips/[token]", since every other existing route operates on the device's own local
          trip, even ones that are only reachable at all when a local trip exists)

        const ROLE_LABEL: Record<TripRole, string> = { own: "Own trip", created: "Created", joined: "Joined" };

      Constraint: do not introduce useSyncExternalStore, a custom store object, or any caching of
      `computeEntries`'s result across renders — the whole point of this design is that every
      render recomputes it fresh from storage. Do not add a `window.addEventListener("storage", ...)`
      listener either; re-render-on-navigation via `usePathname()` (already required for
      `activeEntry`) is what keeps this fresh, not a storage event.

      ~~Constraint: do not introduce useSyncExternalStore.~~ **Narrowed during execution** — the
      ban is on using it as a *data store* (which is what the paragraph above protects). A
      `useSyncExternalStore` call is required for the hydration guard itself, because the
      `useState`/`useEffect` flag above trips `react-hooks/set-state-in-effect`. The entries are
      still recomputed uncached in the render body, no `hasRead` cache exists, and no storage-event
      listener was added, so the rule's intent holds. See `log.txt` Task 4.

      Render, exactly:
        <header className="flex items-center justify-between border-b border-(--border) bg-(--surface) px-4 py-2">
          <button
            type="button"
            aria-label="Switch trip"
            onClick={() => setIsOpen(true)}
            className="text-sm"
          >
            {activeEntry.label} — {ROLE_LABEL[activeEntry.role]}
          </button>
          {isOpen && (
            <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-(--background) p-4">
                <h2 className="text-xl font-semibold">Switch trip</h2>
                <ul className="flex flex-col divide-y divide-(--border)">
                  {entries.map((entry) => (
                    <li key={entry.href}>
                      <Link
                        href={entry.href}
                        onClick={() => setIsOpen(false)}
                        className="flex py-2"
                      >
                        {entry.label} — {ROLE_LABEL[entry.role]}
                      </Link>
                    </li>
                  ))}
                </ul>
                <button type="button" onClick={() => setIsOpen(false)} className="btn-secondary">
                  Close
                </button>
              </div>
            </div>
          )}
        </header>

      Constraints:
        - The trigger button's visible text and each dialog entry's link text must be exactly
          `${label} — ${roleLabel}` (em dash, one space either side) — Task 6's Playwright spec
          matches this literal format.
        - Do not modify `components/BottomNav.tsx`, `components/AddCategoryModal.tsx`, or
          `hooks/useUnsavedChangesWarning.ts`.
      ```

- [x] **Step 4 — Run it and confirm it passes.**
      `npx tsc --noEmit`
      Expected: exit 0, no output.

- [x] **Step 5 — Regression run.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npm run build` → Expected: exit 0, "Compiled successfully", route table unchanged (no new
      route — this only mounts a component in the existing root layout).

- [x] **Step 6 — Commit.**
      Message: `feat(018): add the trip switcher header, mounted globally`

---

### Task 5: [Domain] — Extract getSwitcherEntries into lib/tripSwitcher.ts

**Files**

- create: `lib/tripSwitcher.ts`
- modify: `components/TripSwitcher.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npm run build`

Mechanical, behavior-preserving extraction of Task 4's inline `computeEntries`/`TripRole`/
`SwitcherEntry` into their own pure module, renaming `computeEntries` to `getSwitcherEntries`. No
logic change and no render-output change.

- [x] **Step 1 — Apply the change.** Create `lib/tripSwitcher.ts`:

      ```ts
      import type { Trip, SharedTripLink, JoinedTrip } from "@/lib/types";

      export type TripRole = "own" | "created" | "joined";

      export interface SwitcherEntry {
        role: TripRole;
        label: string;
        href: string;
        shareToken?: string;
      }

      export function getSwitcherEntries(
        trip: Trip | null,
        sharedLink: SharedTripLink | null,
        joined: JoinedTrip[]
      ): SwitcherEntry[] {
        const entries: SwitcherEntry[] = [];
        if (trip !== null) {
          entries.push({
            role: sharedLink !== null ? "created" : "own",
            label: trip.destinationCountry,
            href: "/",
          });
        }
        for (const jt of joined) {
          entries.push({
            role: "joined",
            label: jt.trip.destinationCountry,
            href: `/trips/${jt.shareToken}`,
            shareToken: jt.shareToken,
          });
        }
        return entries;
      }
      ```

      This must be the exact logic Task 4 placed inline in `components/TripSwitcher.tsx` — moved
      verbatim, only renamed from `computeEntries` to `getSwitcherEntries`.

      In `components/TripSwitcher.tsx`: remove the local `type TripRole`, `interface SwitcherEntry`,
      and `function computeEntries(...)` definitions; add
      `import { getSwitcherEntries, type TripRole, type SwitcherEntry } from "@/lib/tripSwitcher";`;
      change the one call site inside the component body from
      `computeEntries(getTrip(), getSharedTripLink(), getJoinedTrips())` to
      `getSwitcherEntries(getTrip(), getSharedTripLink(), getJoinedTrips())` — this call still
      happens directly in the render body, uncached, exactly as Task 4 left it; this task does not
      change when or how often it runs, only where the function itself is defined. No other line
      in the file changes — `ROLE_LABEL`, the `mounted`/`pathname`/`isOpen` state, and the JSX are
      untouched.

- [x] **Step 2 — Build verification.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npm run build` → Expected: exit 0, "Compiled successfully", route table unchanged.

- [x] **Step 3 — Commit.**
      Message: `refactor(018): extract getSwitcherEntries into lib/tripSwitcher.ts`
      **Executed as written** (commit `d692c88`), with one authorized trim recorded in Step 1's
      import instruction: the prescribed `import { getSwitcherEntries, type TripRole, type
      SwitcherEntry } from "@/lib/tripSwitcher";` was cut to `import { getSwitcherEntries, type
      TripRole } from "@/lib/tripSwitcher";`, because `SwitcherEntry` is no longer referenced by the
      component and would have left a standing `@typescript-eslint/no-unused-vars` warning. The
      module still exports it. See `log.txt` Task 5.

---

### Task 6: [UI/Route] — Playwright coverage for switching between multiple trips

**Files**

- create: `e2e/018-switch-between-multiple-trips.spec.ts`
- test: `npx playwright test e2e/018-switch-between-multiple-trips.spec.ts`

All 14 acceptance criteria from `doc/features/018-switch-between-multiple-trips/spec.md` §3/§4 are
covered in one spec file, reusing `e2e/017-join-a-shared-trip-via-link.spec.ts`'s established
helpers (`seedStorage` via `page.addInitScript`, `createRealTripLink` via `POST /api/trips`,
`joinViaApi` via `POST /api/join/[token]`). Every behavior this spec exercises was already built and
compiler-verified in Tasks 1–5; this task adds the behavioral gate on top of it.

- [x] **Step 1 — Write the spec.** Create `e2e/018-switch-between-multiple-trips.spec.ts` with a
      `test.describe("feature 018 — switch between multiple trips", ...)` block containing exactly
      these 14 tests. Reuse this exact `STORAGE_KEYS` object and these exact helper functions,
      adapted from `e2e/017-join-a-shared-trip-via-link.spec.ts`'s own (same signatures, same
      `request.post("/api/trips", { data: TRIP })` / `request.post(\`/api/join/${shareToken}\`, { data: { name } })` calls):

      ```ts
      const STORAGE_KEYS = {
        trip: "travel-expense:trip",
        sharedTripLink: "travel-expense:shared-trip-link",
        joinedTrips: "travel-expense:joined-trips",
      } as const;

      const TRIP = {
        destinationCountry: "Japan",
        currency: "JPY",
        startDate: "2026-01-01",
        endDate: "2026-01-10",
      };

      const OWN_TRIP = {
        destinationCountry: "France",
        currency: "EUR",
        startDate: "2026-02-01",
        endDate: "2026-02-10",
      };
      ```

      `seedStorage(page, data)` — identical in shape to `e2e/017`'s own helper: an
      `await page.addInitScript(...)` that writes each key in `data` into `window.localStorage`
      before first render, keyed through `STORAGE_KEYS`.

      `createRealTripLink(request)` — identical to `e2e/017`'s own: `POST /api/trips` with `TRIP`,
      returns `{ tripId, shareToken, creatorToken }`.

      `joinViaApi(request, shareToken, name)` — identical to `e2e/017`'s own: `POST /api/join/{shareToken}`
      with `{ name }`, returns the parsed `{ participantId, participantToken, trip }`.

      `buildJoinedTrip(link, joined, name)` — new small helper returning a `JoinedTrip`-shaped
      object: `{ tripId: link.tripId, shareToken: link.shareToken, participantId: joined.participantId, participantToken: joined.participantToken, participantName: name, trip: joined.trip }`.

      Test list (test name -> exact steps and assertions):

      1. **"selecting a joined trip in the switcher shows its own summary"** (AC-018-01) — Seed
         `{ trip: OWN_TRIP }` before navigation. Create a real trip+link via `createRealTripLink`,
         join it via `joinViaApi(request, link.shareToken, "Sam")`, then re-seed
         `{ trip: OWN_TRIP, joinedTrips: [buildJoinedTrip(link, joined, "Sam")] }` (one
         `addInitScript` call covers both keys — call `seedStorage` once with both). `page.goto("/")`.
         Click `page.getByRole("button", { name: "Switch trip" })`. Click
         `page.getByRole("dialog").getByRole("link", { name: `Japan — Joined` })`. Assert the URL is
         `/trips/${link.shareToken}` (`await expect(page).toHaveURL(...)`). Assert
         `page.getByRole("heading", { name: "Japan" })` is visible and
         `page.getByText("Joined as Sam.")` is visible.

      2. **"selecting my own trip from the switcher returns to my dashboard"** (AC-018-02) — Same
         seed as test 1. `page.goto(`/trips/${link.shareToken}`)`. Wait for
         `page.getByText("Joined as Sam.")` to be visible. Click
         `page.getByRole("button", { name: "Switch trip" })`, then
         `page.getByRole("dialog").getByRole("link", { name: "France — Own trip" })`. Assert
         `page.getByRole("heading", { name: "Home" })` is visible and
         `page.getByText(/Trip to France/)` is visible.

      3. **"the trip switched away from is still listed after switching"** (AC-018-03) — Same seed
         as test 1, starting on `/`. Click "Switch trip", click the "Japan — Joined" link, wait for
         `page.getByText("Joined as Sam.")`. Click "Switch trip" again. Assert both
         `page.getByRole("dialog").getByRole("link", { name: "France — Own trip" })` and
         `page.getByRole("dialog").getByRole("link", { name: "Japan — Joined" })` are visible.

      4. **"the switcher trigger is not shown with only one trip"** (AC-018-04) — Seed only
         `{ trip: OWN_TRIP }` (no `joinedTrips`). `page.goto("/")`. Assert
         `page.getByRole("button", { name: "Switch trip" })` has count `0`.

      5. **"the switcher trigger is not shown before any trip exists"** (AC-018-05) — No seeding at
         all. `page.goto("/")`. Assert `page.getByRole("button", { name: "Switch trip" })` has
         count `0`.

      6. **"a deleted shared trip is removed from the switcher after being selected"** (AC-018-06) —
         Create a real trip+link, join it as "Sam", seed
         `{ trip: OWN_TRIP, joinedTrips: [buildJoinedTrip(link, joined, "Sam")] }`. Before
         navigating, delete the trip: `await request.delete(`/api/trips/${link.tripId}`, { headers: { "x-creator-token": link.creatorToken } });`.
         `page.goto("/")`. Click "Switch trip", click "Japan — Joined". Assert
         `page.getByText("This trip is no longer available.")` is visible. Read
         `localStorage.getItem("travel-expense:joined-trips")` via `page.evaluate` and assert the
         parsed array has length `0`. Click `page.getByRole("link", { name: "Back to home" })`
         (present on the "gone" state) to return to `/`. With the pruned device now belonging to
         only one trip (`OWN_TRIP`), the switcher hides itself entirely per AC-018-04/BR-018-04 —
         assert `page.getByRole("button", { name: "Switch trip" })` has count `0` (do not attempt
         to open the dialog again; there is no trigger left to click).

      7. **"switching trips from a dirty expense form shows the unsaved-changes warning first"**
         (AC-018-07) — Seed `{ trip: OWN_TRIP, joinedTrips: [buildJoinedTrip(link, joined, "Sam")] }`
         (create+join as in test 1). `page.goto("/expenses/new")`. Fill the location field:
         `await page.getByLabel("Location").fill("Cafe");`. Register a dialog handler before the
         click: `let dialogSeen = false; page.once("dialog", (dialog) => { dialogSeen = true; dialog.dismiss(); });`.
         Click "Switch trip", click "Japan — Joined". Wait briefly for the dialog handler to have
         fired (`await expect.poll(() => dialogSeen).toBe(true);`). Assert
         `await expect(page).toHaveURL("/expenses/new")` and
         `await expect(page.getByLabel("Location")).toHaveValue("Cafe")`.

      8. **"switching to a joined trip while offline shows a connectivity message"** (AC-018-08) —
         Seed `{ trip: OWN_TRIP, joinedTrips: [buildJoinedTrip(link, joined, "Sam")] }`.
         `page.goto("/")`. Install `await page.route("**/api/join/**", (route) => route.abort());`.
         Click "Switch trip", click "Japan — Joined". Assert
         `page.getByText(/internet connection/)` is visible and
         `page.getByText("Japan", { exact: true })` (the heading) has count `0`.

      9. **"my own trip survives a refresh"** (AC-018-09) — Seed
         `{ trip: OWN_TRIP, joinedTrips: [buildJoinedTrip(link, joined, "Sam")] }` (need ≥2 trips
         only so this test's seed is realistic, not because the assertion needs the switcher).
         `page.goto("/")`. `await page.reload();`. Assert
         `page.getByRole("heading", { name: "Home" })` is visible and
         `page.getByText(/Trip to France/)` is visible.

      10. **"a joined trip survives a refresh while online"** (AC-018-10) — Same seed as test 9.
          `page.goto(`/trips/${link.shareToken}`)`. Wait for `page.getByText("Joined as Sam.")`.
          `await page.reload();`. Assert `page.getByRole("heading", { name: "Japan" })` is visible
          and `page.getByText("Joined as Sam.")` is visible again.

      11. **"the switcher labels an unshared local trip Own trip"** (AC-018-11) — Seed
          `{ trip: OWN_TRIP, joinedTrips: [buildJoinedTrip(link, joined, "Sam")] }` — no
          `sharedTripLink` key set. `page.goto("/")`. Click "Switch trip". Assert
          `page.getByRole("dialog").getByRole("link", { name: "France — Own trip" })` and
          `page.getByRole("dialog").getByRole("link", { name: "Japan — Joined" })` are both visible.

      12. **"the switcher labels a shared local trip Created"** (AC-018-12) — Seed
          `{ trip: OWN_TRIP, sharedTripLink: { tripId: "any-id", shareToken: "any-token", creatorToken: "any-creator-token" }, joinedTrips: [buildJoinedTrip(link, joined, "Sam")] }`.
          `page.goto("/")`. Click "Switch trip". Assert
          `page.getByRole("dialog").getByRole("link", { name: "France — Created" })` and
          `page.getByRole("dialog").getByRole("link", { name: "Japan — Joined" })` are both visible.

      13. **"a device with only joined trips is shown one of them instead of trip setup"**
          (AC-018-13) — Seed only `{ joinedTrips: [buildJoinedTrip(link, joined, "Sam")] }` — no
          `trip` key at all. `page.goto("/")`. Assert
          `await expect(page).toHaveURL(`/trips/${link.shareToken}`)`. Assert
          `page.getByRole("heading", { name: "Japan" })` is visible and
          `page.getByText("Joined as Sam.")` is visible. Assert
          `page.getByLabel("Destination country")` (the trip-setup form's first field) has count
          `0`.

      14. **"switching to my own trip never shows a connectivity message, even offline"**
          (AC-018-14) — Seed `{ trip: OWN_TRIP, joinedTrips: [buildJoinedTrip(link, joined, "Sam")] }`.
          `page.goto(`/trips/${link.shareToken}`)` first while online, wait for
          `page.getByText("Joined as Sam.")` (confirms the joined trip resolved once, matching the
          "already viewed" precondition). Install
          `await page.route("**/api/**", (route) => route.abort());`. Click "Switch trip", click
          "France — Own trip". Assert `page.getByRole("heading", { name: "Home" })` is visible and
          `page.getByText(/internet connection/)` has count `0` anywhere on the page.

      Each test that needs a trip+link+join creates its own via `createRealTripLink`/`joinViaApi`
      inside the test body (not shared module-level state) — same isolation convention
      `e2e/017-join-a-shared-trip-via-link.spec.ts` already uses.

- [x] **Step 2 — Run it and confirm it passes.**
      `npx playwright test e2e/018-switch-between-multiple-trips.spec.ts`
      Expected: exit 0, `14 passed`.

- [x] **Step 3 — Commit.**
      Message: `feat(018): add Playwright coverage for switching between multiple trips`

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

    feat(018): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: doc/features/018-switch-between-multiple-trips/spec.md

Never commit on a failing lint, typecheck, or build.

## Completion Summary

**Status:** Complete — all 6 tasks landed, one commit each.

### What was built

| Task | Layer | Commit | Outcome |
| --- | --- | --- | --- |
| 1 | `[UI]` | `321e216` | `components/JoinedTripSummary.tsx` extracted out of `JoinTrip.tsx`'s joined branch, so a second screen can render identical markup |
| 2 | `[UI/Route]` | `9210fce` | `app/trips/[token]/page.tsx` + `components/SharedTripView.tsx` — always revalidates via `resolveTripByToken`, so it distinguishes offline from a deleted trip |
| 3 | `[Route]` | `462e577` | `app/page.tsx` redirects `/` to the first joined trip when there is no local trip, instead of forcing trip setup |
| 4 | `[UI/Route]` | `a97abe0` | `components/TripSwitcher.tsx` mounted globally in `app/layout.tsx` — hidden below two trips, otherwise a header trigger plus a modal listing every trip by role |
| 5 | `[Domain]` | `d692c88` | `lib/tripSwitcher.ts` — `getSwitcherEntries` extracted out of the component, leaving it thin wiring |
| 6 | `[UI/Route]` | `8f8bcb7` | `e2e/018-switch-between-multiple-trips.spec.ts` — all 14 acceptance criteria, 14 passed |

No new storage key and no new runtime dependency. Two tasks (1 and 5) were deliberately mechanical
extractions, per the plan's Architecture note.

### Deviations from the plan

1. **Task 4's mount idiom could not ship (plan defect, corrected).** The plan prescribed
   `useState(false)` + `useEffect(() => setMounted(true), [])`, which violates
   `react-hooks/set-state-in-effect` — an error-level rule here — and the plan simultaneously
   forbade `useSyncExternalStore`, which spec TS-018-02 asked for. Replaced with a module-scope
   `useSyncExternalStore` hydration guard (constant snapshots, not a data store), preserving the
   plan's real intent: entries still recomputed uncached in the render body. Task 4 therefore took
   two attempts; the first implementer stopped and reported instead of guessing. `plan.md` now
   strikes the old idiom and narrows the ban; see `log.txt` Task 4.
2. **Task 2's red step expects two extra errors.** A brand-new route also reports `TS2344` on
   `PageProps<"/trips/[token]">` plus a cascading `TS2339`, because `.next/types/routes.d.ts` is a
   stale build artifact until a build regenerates it. Annotated in Step 2 and documented in
   `REFERENCE.md` §5.
3. **Task 5's prescribed import kept one unused type.** `SwitcherEntry` is no longer referenced by
   the component, so the controller authorized trimming it from the import to avoid a standing
   lint warning; the module still exports it.
4. **The next/route-layer work was consolidated per task, not per layer** — the plan's own split
   (route + component in one task) was followed as written rather than re-cut.

### Follow-ups not in scope

- **Pre-existing failure in `e2e/009-dashboard-show-more.spec.ts`** (not caused by this feature —
  verified by reverting `app/page.tsx` and `app/layout.tsx` to their pre-018 state, where it fails
  identically). "Show less" does not collapse the list: the count stays at 15 instead of returning
  to 5. Feature 009 is still marked in-progress in `REFERENCE.md` §4.
- **`REFERENCE.md`'s `BottomNav.tsx` row** claims it is a "plain Server Component (no
  `'use client'`)", but the file starts with `"use client";`. Pre-existing inaccuracy, surfaced by
  the Task 4/6 review gates; left out of this feature's commits to keep each task's diff scoped.
- Features 019–022 (participants, attribution/split, balances, settle-up) are the remaining v2
  slices and were not touched.

### Final verification

```
npx tsc --noEmit                                                     -> exit 0, no output
npm run lint                                                         -> exit 0, banner only
npm run build                                                        -> exit 0, "Compiled successfully", 14 routes incl. /trips/[token]
npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts \
                    e2e/018-switch-between-multiple-trips.spec.ts    -> exit 0, 31 passed (17 + 14)
npx playwright test (full suite)                                     -> 47 passed, 1 failed
                                                                        (the pre-existing 009 failure above)
```

