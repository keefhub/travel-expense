# 017. Join a Shared Trip via Link — Implementation Plan

**Status:** Complete
**Source:** `doc/features/017-join-a-shared-trip-via-link/spec.md` (from `features/017.join-a-shared-trip-via-link.md`)
**Goal:** Let a friend open a shared trip's link, enter a name, and become a server-backed
participant on that trip — with a friendly response to an invalid/dead link, an offline device, a
double-tap, and concurrent joiners — without ever touching the joining device's own local solo trip.

**Architecture:**
Additive, on top of feature 016's already-provisioned `Trip` model and Neon/Prisma connection.
A new `Participant` model (cascade-deleted with its `Trip`) is looked up and created by one new
Route Handler, `app/api/join/[token]/route.ts`, which owns both `GET` (resolve a share token to
public trip fields, or 404) and `POST` (create a participant, or 404/400). A new client module,
`lib/join.ts`, wraps those two calls behind result types mirroring `lib/sharedTrip.ts`'s shape. The
joining device remembers which shared trips it has joined, and as which participant, in a new
`localStorage` array (`joinedTrips`, distinct from 016's single-pointer `sharedTripLink`, since a
device can join any number of shared trips). `app/join/[token]/page.tsx` is the first route in this
app that does **not** gate on `getTrip()` — a friend with no solo trip of their own must still be
able to join — and mounts one component, `components/JoinTrip.tsx`, that owns five states
(loading, invalid link, offline, join form, joined). The "joined" view is a small, honest trip
summary, not a reuse of `components/Dashboard.tsx` — that component's real content (spend totals,
budget, category chart) is computed from the *solo* trip's local expense data, none of which exists
for a shared trip until feature 020 (per spec.md §2.1 and Contrarian Review #1). Double-submission
is guarded client-side with the same synchronous `useRef` pattern `ShareTripLink.tsx` already uses;
concurrent joins from different friends need no special handling, since each `POST` is an
independent `Participant` insert with no shared unique constraint (duplicate display names are
explicitly allowed).

**BR-017-16** (a joined participant has no elevated permissions) has no dedicated task below, by
design — mirrors spec.md §5's own "orphan rule" treatment. No task in this plan adds any
permission-gated action a participant could attempt, so the rule holds structurally (there is
nothing to elevate into); it is not implemented as a check because nothing exists yet to check
against. Revisit once 019/020 introduce a participant-side action.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Reuses feature 016's Prisma + `@prisma/adapter-neon` + `@neondatabase/serverless` dependencies and
`lib/db.ts` singleton — no new packages. Verification: `npm run lint`, `npx tsc --noEmit`,
`npm run build` (route-touching tasks), `npx playwright test
e2e/017-join-a-shared-trip-via-link.spec.ts` (behavioral gate).

> **Infrastructure note.** Unlike feature 016, this plan does **not** need a new `DATABASE_URL` —
> feature 016 already provisioned a real, reachable Neon database and its Playwright suite already
> passes against it (`git log --grep="^feat(016)"`). Task 3's migration step is expected to apply
> cleanly, not block.

> **Methodology note on "red steps."** Several tasks below create a file with **no existing TS
> consumer yet** (a Route Handler invoked only over HTTP, or a component not yet mounted). The
> standard contract-task red step (`write the call site → tsc fails → implement → tsc passes`) needs
> a real call site to fail against; where none exists in-task, the step is written as
> implement-then-verify-green instead, exactly as feature 016's `lib/sharedTrip.ts` and
> `ShareTripLink.tsx` landed before anything called or mounted them. This is noted per-task, not
> silently skipped.

---

### Task 1: [Types] — `lib/types.ts` gains `SharedTripSummary` and `JoinedTrip`

**Files**
- modify: `lib/types.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (foundational addition with no consumer yet in this task).

> **Refinement from spec.md's TS-017-04:** `SharedTripSummary` omits `budget` here. Nothing in this
> plan ever displays a shared trip's budget (`components/JoinTrip.tsx`'s "joined" view in Task 6
> shows only destination and dates), and spec.md §1.6 lists "any expense, budget, or category data
> for a shared trip" as out of scope. Carrying an unused field forward risks it being read as a
> green light for shared-trip budget UI this feature doesn't build. If a later feature needs it,
> that feature adds it to `SharedTripSummary` then.

- [x] **Step 1 — Add the types.** Append after the existing `SharedTripLink` interface:
      ```ts
      export interface SharedTripSummary {
        id: string;
        destinationCountry: string;
        currency: string;
        startDate: string;
        endDate: string;
      }

      export interface JoinedTrip {
        tripId: string;
        shareToken: string;
        participantId: string;
        participantToken: string;
        participantName: string;
        trip: SharedTripSummary;
      }
      ```
      Do not modify any existing type.

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(017): add SharedTripSummary and JoinedTrip types`

---

### Task 2: [Data] — `lib/storage.ts` gains `joinedTrips` persistence

**Files**
- modify: `lib/storage.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (foundational, no consumer yet in this task).

- [x] **Step 1 — Add the storage key.** In `STORAGE_KEYS`, add `joinedTrips:
      "travel-expense:joined-trips"`, after the existing `sharedTripLink` entry.

- [x] **Step 2 — Add the accessors.**
      ```
      File: lib/storage.ts (modify)
      Exports (new): getJoinedTrips(): JoinedTrip[]
                     saveJoinedTrips(trips: JoinedTrip[]): SaveResult
      Behavior: getJoinedTrips uses safeGetItem<JoinedTrip[]>(STORAGE_KEYS.joinedTrips, []) exactly
                like getCategories/getExpenses (array fallback, not null). saveJoinedTrips uses
                safeSetItem(STORAGE_KEYS.joinedTrips, trips) exactly like
                saveCategories/saveExpenses.
      Constraints: add JoinedTrip to the existing `import type { ... } from "@/lib/types"` line at
                   the top of the file; does not change the signature or behavior of any existing
                   STORAGE_KEYS entry or accessor.
      ```

- [x] **Step 3 — Wire it into `resetAppData()`.** Add
      `window.localStorage.removeItem(STORAGE_KEYS.joinedTrips);` to the existing removal sequence,
      grouped with the `sharedTripLink` removal among the auxiliary-collection removals (before
      `expenses`, `categories`, `exchangeRates` — same "auxiliary first, trip record last" ordering
      already documented in the existing code comment).

- [x] **Step 4 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 5 — Commit.**
      Message: `feat(017): add joinedTrips persistence to lib/storage`

---

### Task 3: [Config] — Prisma schema gains the `Participant` model

**Files**
- modify: `prisma/schema.prisma`
- test: `npx prisma generate`, `npx prisma migrate dev --name add_participant`, `npx tsc --noEmit`,
  `npm run lint`

- [x] **Step 1 — Add the relation and the model.** Inside the existing `model Trip { ... }` block,
      add one new field as the last line before the closing brace:
      ```prisma
        participants       Participant[]
      ```
      Then append a new model after `Trip`'s closing brace:
      ```prisma
      model Participant {
        id               String   @id @default(cuid())
        tripId           String
        trip             Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
        name             String
        participantToken String   @unique
        createdAt        DateTime @default(now())
      }
      ```
      Do not modify any existing field on `Trip`.

- [x] **Step 2 — Regenerate the Prisma Client.**
      `npx prisma generate`
      Expected: exit 0, output containing "Generated Prisma Client". Needs `DATABASE_URL` set (via
      `prisma.config.ts`, already in place from 016) but not reachable, since generate performs no
      query.

- [x] **Step 3 — Apply the migration.**
      `npx prisma migrate dev --name add_participant`
      Expected: exit 0, output confirming the migration was applied and a new
      `prisma/migrations/<timestamp>_add_participant/migration.sql` file was created. Per the
      Infrastructure note above, `DATABASE_URL` is already a real, working connection from feature
      016 — this step is not expected to block. If it does block on connectivity, record it in
      `log.txt` exactly as 016's Task 2 documented its own equivalent block, and resume once
      resolved; do not fake or skip it.

      ~~No index on `tripId` beyond the above.~~ Superseded: the Task 3 quality gate found
      `Participant.tripId` had no index (Postgres does not auto-index FK columns), which would
      sequential-scan on every trip-delete cascade and every future "list participants" query. Fixed
      with `@@index([tripId])` added to the `Participant` model and a second migration,
      `npx prisma migrate dev --name add_participant_trip_index`. See log.txt, Task 3.

- [x] **Step 4 — Regression.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 5 — Commit.**
      Message: `feat(017): add Participant model to the Prisma schema`

---

### Task 4: [Route] — `GET`/`POST /api/join/[token]` resolve and join a shared trip

**Files**
- create: `app/api/join/[token]/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step — a Route Handler is invoked over HTTP, not via a TS import; its correctness is proven
by `npm run build` (compiles and registers the route) here and by Task 8's Playwright coverage.

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/api/join/[token]/route.ts (create)
      Exports: GET(request: Request, { params }: { params: Promise<{ token: string }> }):
                 Promise<Response>
               POST(request: Request, { params }: { params: Promise<{ token: string }> }):
                 Promise<Response>

      Shared trip lookup: implement one local, unexported helper in this file (e.g.
      `resolveTrip(token: string)`) and call it from both `GET` and `POST` — do not duplicate the
      lookup inline in each verb, so the two verbs' 404 status/message cannot drift apart on a
      future edit.
        db.trip.findUnique({ where: { shareToken: token } })
        Not found -> respond 404 { error: "This link isn't valid." } from that verb's own handler.

      A found trip's public summary is always built the same way in both verbs:
        {
          id: trip.id,
          destinationCountry: trip.destinationCountry,
          currency: trip.currency,
          startDate: trip.startDate.toISOString().slice(0, 10),
          endDate: trip.endDate.toISOString().slice(0, 10),
        }
      (`.slice(0, 10)` yields a plain "YYYY-MM-DD" string, matching the local `Trip` type's own
      date-string format — never `shareToken`/`creatorToken`/`budget`/participant data. `budget` is
      deliberately excluded — see Task 1's refinement note.)

      GET behavior:
        1. await params for token.
        2. Look up the trip. Not found -> 404 as above.
        3. Found -> 200 with the public summary object above.
        4. Any other thrown error (e.g. the database unreachable) is caught, logged via
           console.error, and responds 500 { error: "Could not look up this link." }.

      POST behavior:
        1. await params for token.
        2. Parse the JSON body in its own try/catch; a parse failure responds 400
           { error: "Invalid join request." } and returns immediately (mirrors
           app/api/trips/route.ts's own malformed-body handling from feature 016).
        3. Look up the trip. Not found -> 404 as above (identical status and message to GET).
        4. Read `name` from the parsed body. If it is not a string, or `name.trim() === ""`,
           respond 400 { error: "Enter your name to join." }.
        5. Otherwise let `trimmedName = name.trim().slice(0, 50)` (limits length, never rejects,
           for anything over 50 characters after trimming).
        6. Create one Participant row:
           db.participant.create({ data: { tripId: trip.id, name: trimmedName,
             participantToken: crypto.randomUUID() } })
        7. Respond 201 with:
           { participantId: participant.id, participantToken: participant.participantToken,
             trip: <the public summary object above, built from the same `trip` row> }
        8. Any other thrown error (e.g. the database unreachable) is caught, logged via
           console.error, and responds 500 { error: "Could not join the trip." }.

      Constraints: ignore any other body fields. Must not import lib/storage.ts (server-only file;
                   must not read localStorage). Params are a Promise — same convention as
                   app/api/trips/[id]/route.ts (016), confirmed against
                   node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/join/[token]`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(017): add GET/POST /api/join/[token] to resolve and join a shared trip`

---

### Task 5: [Domain] — `lib/join.ts` client wrapper

**Files**
- create: `lib/join.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (no consumer until Task 6, mirrors `lib/sharedTrip.ts`'s own landing in feature 016).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: lib/join.ts (create)
      Exports:
        type ResolveResult =
          | { ok: true; trip: SharedTripSummary }
          | { ok: false; reason: "not-found" }
          | { ok: false; reason: "offline" }
        type JoinResult =
          | { ok: true; joined: JoinedTrip; persisted: boolean }
          | { ok: false; error: string }
        findJoinedTrip(joinedTrips: JoinedTrip[], token: string): JoinedTrip | null
        validateJoinName(name: string): { error?: string }
        resolveTripByToken(token: string): Promise<ResolveResult>
        joinTrip(token: string, name: string): Promise<JoinResult>

      Behavior:
        - findJoinedTrip is pure: returns the first entry in joinedTrips whose shareToken === token,
          or null if none match.
        - validateJoinName is pure: if name.trim() === "", return
          { error: "Enter your name to join." }; otherwise return {}.
        - resolveTripByToken: `fetch(\`/api/join/${token}\`)`. If the fetch throws, return
          { ok: false, reason: "offline" }. If the response is not ok (response.ok === false),
          return { ok: false, reason: "not-found" }. Otherwise parse the JSON body as
          SharedTripSummary and return { ok: true, trip }.
        - joinTrip: `fetch(\`/api/join/${token}\`, { method: "POST", headers: { "Content-Type":
          "application/json" }, body: JSON.stringify({ name }) })`. If the fetch throws or the
          response is not ok, return { ok: false, error: "Could not reach the server. Check your
          connection and try again." } (same friendly-error text lib/sharedTrip.ts already uses)
          without touching storage. On a 2xx response, parse
          { participantId: string; participantToken: string; trip: SharedTripSummary }, build:
            const joined: JoinedTrip = { tripId: trip.id, shareToken: token, participantId,
              participantToken, participantName: name.trim().slice(0, 50), trip };
          then call `saveJoinedTrips([...getJoinedTrips(), joined])` (from "@/lib/storage") and
          return { ok: true, joined, persisted: saveResult.ok }.
      Constraints: pure aside from fetch and the two lib/storage.ts calls inside joinTrip; must not
                   import lib/db.ts; must not call saveJoinedTrips when the POST itself failed.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(017): add lib/join, the client wrapper for resolving and joining a shared trip`

---

### Task 6: [UI] — `components/JoinTrip.tsx`

**Files**
- create: `components/JoinTrip.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (not mounted until Task 7, mirrors `ShareTripLink.tsx`'s own landing in feature 016).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: components/JoinTrip.tsx (create, 'use client')
      Exports: default function JoinTrip({ token }: { token: string }): JSX.Element

      State (all useState unless noted):
        status: "loading" | "invalid" | "offline" | "ready" | "joined", initial "loading"
        trip: SharedTripSummary | null, initial null
        joinedTrip: JoinedTrip | null, initial null
        name: string, initial ""
        nameError: string | null, initial null
        submitError: string | null, initial null
        storageWarning: string | null, initial null
        isPending: boolean, initial false
        A useRef<boolean>(false) in-flight guard for the Join button, read and set synchronously at
        the very top of the submit handler (before any await), reset to false in a `finally` block —
        same pattern as components/ShareTripLink.tsx's generate/regenerate handlers.

      Mount effect (useEffect, deps: [token]):
        1. Call findJoinedTrip(getJoinedTrips(), token) (getJoinedTrips from "@/lib/storage",
           findJoinedTrip from "@/lib/join").
        2. If it returns non-null: setJoinedTrip(that value); setStatus("joined"); return (no
           network call in this branch).
        3. Otherwise call resolveTripByToken(token). On { ok: true, trip }: setTrip(trip);
           setStatus("ready"). On { ok: false, reason: "offline" }: setStatus("offline"). On
           { ok: false, reason: "not-found" }: setStatus("invalid").

      Render, by status (every branch wrapped in <div className="flex flex-col gap-4 p-4">):
        - "loading": render null (no wrapper div) — mirrors every other route's
          "render null until determined" pattern (REFERENCE.md §4).
        - "invalid": <h1 className="text-xl font-semibold">Join a trip</h1> followed by
          <p>This link isn't valid or the trip is no longer available.</p>. No form, no retry
          action.
        - "offline": same heading, followed by <p>Joining a trip requires an internet connection.
          Check your connection and try again.</p>.
        - "ready": same heading, followed by a <form> containing:
            - a flex flex-col gap-1 block with <label htmlFor="participantName">Your name</label>
              and <input id="participantName" type="text" maxLength={50} value={name}
              onChange={(e) => setName(e.target.value)} />.
            - nameError, when non-null, rendered immediately below as
              <p role="alert">{nameError}</p>.
            - submitError, when non-null, rendered below that as <p role="alert">{submitError}</p>.
            - <button type="submit" className="btn-primary" disabled={isPending}>Join</button>.
          onSubmit (e.preventDefault() first):
            1. If the ref guard is already true, return immediately.
            2. Set the ref guard true; setIsPending(true).
            3. Call validateJoinName(name). If it returns an error: setNameError(result.error);
               setSubmitError(null); set the ref guard back to false; setIsPending(false); return
               — no call to joinTrip (no network request for a blank/whitespace name).
            4. Otherwise setNameError(null); await joinTrip(token, name).
            5. On { ok: true, joined, persisted }: setJoinedTrip(joined); setStatus("joined");
               if persisted is false, additionally setStorageWarning("This device could not
               remember that you joined. If you leave this page, use the link again to rejoin.")
               (the server-side join already succeeded in this branch regardless of `persisted` —
               never treat persisted: false as a failure, never call setSubmitError for it).
            6. On { ok: false, error }: setSubmitError(error).
            7. finally: set the ref guard back to false; setIsPending(false).
        - "joined": <h1 className="text-xl font-semibold">{joinedTrip!.trip.destinationCountry}</h1>,
          a <p> showing `${joinedTrip!.trip.startDate} to ${joinedTrip!.trip.endDate}`, a <p>
          reading `Joined as ${joinedTrip!.participantName}.`, storageWarning — when non-null —
          rendered immediately after that as
          <p role="status" className="text-sm text-(--warning-text)">{storageWarning}</p>
          (non-blocking: the join already succeeded, so this is `role="status"` with the
          `--warning-text` token, matching `components/Dashboard.tsx`'s missing-exchange-rate note —
          never `role="alert"`, which this codebase reserves for blocking errors), and
          <Link href="/" className="link">Back to home</Link> (Link from "next/link", mirroring
          app/expenses/[id]/page.tsx's own "Back to home" pattern). Source trip display fields only
          from joinedTrip.trip, never from the "trip" state (which is not populated on the
          already-joined mount path).

      Constraints: this component never calls saveTrip/getTrip and never reads or writes
                   STORAGE_KEYS.trip — joining must never touch the device's local solo trip. It
                   never calls router.push/router.replace — the "joined" view renders in place, not
                   via a redirect. Must not import components/Dashboard.tsx. The `persisted` field
                   from JoinResult (lib/join.ts, Task 5) must be read on every successful join —
                   silently dropping it would let a local-storage write failure go unnoticed and
                   risk a duplicate Participant row on a later rejoin attempt.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(017): add JoinTrip, the join-screen and joined-trip-view component`

---

### Task 7: [Route] — `app/join/[token]/page.tsx`

**Files**
- create: `app/join/[token]/page.tsx`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step (the component it renders already exists from Task 6; this task is the wiring itself).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/join/[token]/page.tsx (create, 'use client')
      Exports: default function JoinPage(props: PageProps<"/join/[token]">): JSX.Element
      Behavior:
        "use client";

        import { use } from "react";
        import JoinTrip from "@/components/JoinTrip";
        export default function JoinPage(props: PageProps<"/join/[token]">) {
          const { token } = use(props.params);
          return <JoinTrip token={token} />;
        }
      Constraints: does NOT read getTrip() and does NOT redirect based on it — unlike every other
                   route in this app, a local solo trip is not a precondition for this route
                   (spec.md §1.2). Mirrors app/expenses/[id]/page.tsx's use(props.params) pattern
                   for a Promise-based dynamic segment; do not hand-write a params prop type.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/join/[token]`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(017): add the /join/[token] route`

---

### Task 8: [Behavioral] — Playwright coverage for the full feature

**Files**
- create: `e2e/017-join-a-shared-trip-via-link.spec.ts`
- test: `npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts`

- [x] **Step 1 — Write the spec**, covering all 17 scenarios from spec.md §4:
      1. `joining via a valid link shows a confirming trip view` (E2E-017-01)
      2. `joining with a name not yet used succeeds` (E2E-017-02)
      3. `joining with a name already used by another participant still succeeds` (E2E-017-03)
      4. `a name longer than 50 characters is capped while typing` (E2E-017-04)
      5. `a regenerated link's old token shows the invalid-link message` (E2E-017-05)
      6. `a deleted trip's link shows the invalid-link message` (E2E-017-06)
      7. `a malformed token shows the invalid-link message` (E2E-017-07)
      8. `joining succeeds when the trip's end date is in the past` (E2E-017-08)
      9. `joining a shared trip leaves the local solo trip untouched` (E2E-017-09)
      10. `reopening the same link after already joining skips the name prompt` (E2E-017-10)
      11. `submitting a blank name shows an inline error and makes no request` (E2E-017-11)
      12. `a join attempt shows a friendly error when the server is unreachable` (E2E-017-12)
      13. `opening the link while offline shows a connectivity-specific message` (E2E-017-13)
      14. `double-tapping Join issues exactly one join request` (E2E-017-14)
      15. `two friends joining at the same time both succeed as distinct participants` (E2E-017-15)
      16. `a name of exactly 50 characters is accepted` (E2E-017-16)
      17. `whitespace around a name is trimmed before joining` (E2E-017-17)

      Helpers to build, mirroring `e2e/016-generate-shareable-trip-link.spec.ts`'s own helpers:
      - `createRealTripLink(request)`: `POST /api/trips` with a fixed trip body (destinationCountry,
        currency, startDate, endDate), returns `{ tripId, shareToken, creatorToken }` — reuse the
        same shape 016's spec already established (same fixed TRIP constant is fine to duplicate
        into this new spec file; do not import across spec files).
      - `joinViaApi(request, shareToken, name)`: `POST /api/join/${shareToken}` with `{ name }`,
        returns the parsed `{ participantId, participantToken, trip }` body — used to pre-seed an
        existing participant (for E2E-017-02/03) or a prior join (for E2E-017-10) without going
        through the UI first.

      Per `.claude/repo-profile.md` § Behavioral gate: seed any required `localStorage` via
      `page.addInitScript` before first render. Unlike every other spec in this repo, **most tests
      here seed nothing** — `/join/[token]` does not redirect on a missing `getTrip()`. Only
      E2E-017-09 (seed `travel-expense:trip` to a known solo trip) and E2E-017-10 (seed
      `travel-expense:joined-trips` to contain a `JoinedTrip` built from a real prior `joinViaApi`
      call) seed storage. Scope every `role="alert"` assertion to the rendered `<form>`/container,
      not the page root, to avoid colliding with Next.js's own route announcer. For E2E-017-05, call
      `POST /api/trips/[id]/regenerate` (016) with the creator token to rotate the token before
      visiting `/join/` with the original one. For E2E-017-06, call `DELETE /api/trips/[id]` (016)
      with the creator token before visiting. For E2E-017-12, use `page.route` to abort only the
      `POST` to `/api/join/**` (let the initial `GET` succeed normally). For E2E-017-13, abort
      **all** `**/api/join/**` requests before navigating. For E2E-017-14, use the same raw
      `dispatchEvent` double-click technique `e2e/016-...` uses (this component disables its submit
      button synchronously before any await, so two Playwright `.click()` calls would deadlock on
      the second waiting for "enabled"). For E2E-017-15, fire two `request.post("/api/join/...")`
      calls via `Promise.all` with different names, bypassing the UI, and assert both `201` with
      differing `participantId`.

- [x] **Step 2 — Run it and confirm it passes.**
      `npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts`
      Expected: exit 0, `17 passed`.

      ~~First run showed 10/17 failing with 500s from POST /api/join/[token].~~ Root cause: a
      stale `node` dev-server process had been listening on port 3000 since before this feature's
      Task 3 (which added the `Participant` Prisma model and ran `npx prisma generate`) —
      `playwright.config.ts`'s `reuseExistingServer: !process.env.CI` reused that stale process,
      whose in-memory `@prisma/client` predated the regeneration. Killed the stale process,
      verified `POST /api/join/[token]` returns 201 against a fresh server via a manual `curl`
      check, then re-ran the full suite: `17 passed (18.5s)`. See log.txt, Task 8.

- [x] **Step 3 — Regression.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 4 — Commit.**
      Message: `feat(017): add Playwright coverage for joining a shared trip via link`

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

    feat(017): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: features/017.join-a-shared-trip-via-link.md

Never commit on a failing lint, typecheck, or build.

## Completion Summary

**Completed:** 2026-09-18
**Tasks:** 8 of 8

**What was built:**
A friend can now open a shared trip's link, enter a name, and become a server-backed participant.
A new `Participant` Prisma model (cascade-deleted with its `Trip`, indexed on `tripId`) is looked
up and created by `GET`/`POST /api/join/[token]`. `lib/join.ts` wraps those calls behind result
types distinguishing a dead link from an offline device. `components/JoinTrip.tsx` owns five
states (loading, invalid, offline, name-entry form, joined) and is mounted at the new
`/join/[token]` route — the first route in this app that does not gate on a local solo trip. A
device's participation in each shared trip it joins is remembered locally in a new `joinedTrips`
array, distinct from feature 016's single-pointer `sharedTripLink`, so reopening the same link
skips the name prompt. 17 Playwright scenarios in `e2e/017-join-a-shared-trip-via-link.spec.ts`
cover the full feature end-to-end against the real Neon database already provisioned in 016.

**Deviations from the plan:**
- Task 3: added `@@index([tripId])` to `Participant` (a second migration,
  `add_participant_trip_index`) after a quality-gate FAIL — Postgres does not auto-index foreign
  key columns, and without one every trip-delete cascade and future "list participants" query
  would sequential-scan the table.
- Task 1: `SharedTripSummary` deliberately omits `budget`, diverging from spec.md's TS-017-04 —
  nothing in this plan displays a shared trip's budget, and carrying the field forward risked being
  read as license for budget UI this feature doesn't build.
- Task 5: `resolveTripByToken` has a known, accepted low-severity gap — a malformed-JSON response
  on an otherwise-successful GET is miscategorized as "offline" rather than a more accurate
  failure reason, since the fetch and the parse share one try/catch. Not exercised by any AC.
- Task 6: escalated once (its 2nd consecutive gate failure, a one-word contraction mismatch in the
  invalid-link copy) per this workflow's mandatory stop-and-ask rule; the user directed a continued
  fix rather than a full halt. Also: the controller pre-fixed an implementer-introduced
  `eslint-disable` (silencing an unused `trip` state variable, which this repo's conventions
  prohibit) by adding a "You are joining a trip to..." line to the ready-state form that actually
  uses the fetched trip summary — a real, if minor, UX improvement over the plan's literal
  contract, which never specified displaying trip context before the name form.
- Task 6's REFERENCE.md update landed after its gates had already passed rather than before
  dispatch (a process-ordering slip, corrected for Tasks 7–8). The addition itself was accurate.
- Task 8: the first Playwright run showed 10/17 tests failing with 500s from
  `POST /api/join/[token]`. Root cause was environmental, not a code or test defect — a stale
  `node` dev-server process (listening on port 3000 since before Task 3's `npx prisma generate`)
  was reused by Playwright's `reuseExistingServer: !process.env.CI` config, and its in-memory
  `@prisma/client` predated the `Participant` model. Killed the stale process, verified the fix
  with a manual `curl` call, and reran the suite clean.

**Follow-ups not in scope here:**
- BR-017-16 (a joined participant has no elevated permissions) has no dedicated test — there is
  structurally no permission-gated action for a participant to attempt yet. Revisit once 019/020
  introduce one.
- `findJoinedTrip` matches by `shareToken`, not `tripId` — a participant who already joined and
  later receives a regenerated link from the creator won't be recognized and could create a
  duplicate `Participant` row. No scenario in this feature describes that sequence; flagged in
  spec.md's Open Questions for 018/019 to resolve.
- No rate-limiting or abuse protection on the new public `POST /api/join/[token]` endpoint —
  accepted per the product's explicit "no cap" stance for v2, matching 016's identical acceptance
  of no server-side idempotency beyond its own client-side guard.
- ~~`resolveTripByToken`'s malformed-JSON-on-200 miscategorization (see Deviations above).~~
  Fixed post-completion on explicit user request — see log.txt's "Post-completion fix" entry
  (commit 15cf3c8).
- Wiring the joined shared trip into the home route, bottom navigation, or a multi-trip switcher is
  explicitly feature 018's job — a joined participant currently has no way back into the rest of
  the app besides the "Back to home" link, which returns them to their own solo trip's context (or
  trip setup, if they have none).

**Final verification:**
npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts   17 passed
npx tsc --noEmit                                                   exit 0, no output
npm run lint                                                       exit 0, no output beyond npm's banner
npm run build                                                      exit 0, route table includes /join/[token] and /api/join/[token]
