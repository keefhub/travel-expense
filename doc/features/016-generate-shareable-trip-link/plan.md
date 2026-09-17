# 016. Generate Shareable Trip Link — Implementation Plan

**Status:** Complete
**Source:** `doc/features/016-generate-shareable-trip-link/spec.md` (from `features/016.generate-shareable-trip-link.md`)
**Goal:** Let a trip creator generate a unique, copyable link for their active trip, backed by a
new server-side `Trip` record, and have that link survive refreshes, regenerate on demand, and be
torn down when the trip it points to is replaced.

**Architecture:**
Additive, not a migration. The creator's device keeps reading/writing its active trip via
`lib/storage.ts`/`localStorage` exactly as it does today (features 001–015 are untouched) — nothing
about trip setup, editing, or expense recording changes. Generating a link the first time takes a
one-time snapshot of the local trip's fields into a brand-new `Trip` row in Postgres (via Prisma),
and the creator's device remembers three opaque strings locally — server trip id, share token,
creator token — under a fifth `localStorage` key (`sharedTripLink`). Three Route Handlers own all
server access (`POST /api/trips`, `POST /api/trips/[id]/regenerate`, `DELETE /api/trips/[id]`); a
new client module (`lib/sharedTrip.ts`) wraps the three fetch calls behind a `SaveResult`-shaped
result type. Regenerate/delete are authorized by a shared-secret header
(`x-creator-token`) checked against the row — the only auth mechanism in the app, since no other
identity concept exists yet. The server snapshot is **not** kept in sync with later local edits
(see spec §7, Open Question #2) — this feature only guarantees the *link* survives an edit, not
that a future joiner sees live data; that is explicitly deferred.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
**New for this feature:** Prisma + `@prisma/adapter-neon` + `@neondatabase/serverless` (Neon
Postgres), the first server/database dependency in this repo. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build` (route-touching tasks), `npx playwright test
e2e/016-generate-shareable-trip-link.spec.ts` (behavioral gate).

> **⚠️ External prerequisite — read before Task 2 and Task 11.** This is the first feature in the
> repo needing a real, reachable Postgres database. `DATABASE_URL` must be set in `.env.local` to a
> real Neon connection string before: (a) Task 2's migration step can apply, and (b) Task 11's
> Playwright spec can pass — both make real network calls against `app/api/trips/*`, which is
> genuinely unmockable in this stack (no MSW, no test-double Prisma client, and adding one is out of
> this plan's scope per the spec's Contrarian Review #3). Per the user's explicit instruction, this
> plan implements everything up through Task 10 regardless — those tasks only need `npx prisma
> generate` (schema → TypeScript types), which needs no live connection. **Task 2's migration
> sub-step and all of Task 11 are expected to block on a missing `DATABASE_URL` and must not be
> forced, faked, or skipped to make a gate pass** — record the block in `log.txt`, leave the task
> unticked, and resume once the variable is set.

> **Methodology note on "red steps."** Several tasks below create a file with **no existing TS
> consumer yet** (a Route Handler invoked only over HTTP, or a component not yet mounted). The
> standard contract-task red step (`write the call site → tsc fails → implement → tsc passes`)
> needs a real call site to fail against; where none exists in-task, the step is written as
> implement-then-verify-green instead, exactly as this repo's own `AddCategoryModal.tsx` and
> `CategoryManager.tsx` (010) landed before anything mounted them. This is noted per-task, not
> silently skipped.

---

### Task 1: [Data] — `lib/storage.ts` gains `sharedTripLink` persistence

**Files**
- modify: `lib/types.ts`
- modify: `lib/storage.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (see Methodology note — this is a foundational addition with no consumer yet in this
task).

- [x] **Step 1 — Add the type.** In `lib/types.ts`, add:
      ```ts
      export interface SharedTripLink {
        tripId: string;
        shareToken: string;
        creatorToken: string;
      }
      ```

- [x] **Step 2 — Add the storage key.** In `lib/storage.ts`, add `sharedTripLink:
      "travel-expense:shared-trip-link"` to `STORAGE_KEYS`.

- [x] **Step 3 — Add the accessors.**
      ```
      File: lib/storage.ts (modify)
      Exports (new): getSharedTripLink(): SharedTripLink | null
                     saveSharedTripLink(link: SharedTripLink): SaveResult
                     clearSharedTripLink(): SaveResult
      Behavior: getSharedTripLink/saveSharedTripLink use safeGetItem/safeSetItem exactly like every
                other key (same fallback: null; same SaveResult shape on write failure).
                clearSharedTripLink mirrors resetAppData's own shape: if (!isStorageAvailable())
                return { ok: false, error: SAVE_ERROR_MESSAGE }; else try { removeItem(...); return
                { ok: true } } catch { return { ok: false, error: SAVE_ERROR_MESSAGE } }.
      Constraints: does not change the signature or behavior of any existing STORAGE_KEYS entry or
                   accessor.
      ```

- [x] **Step 4 — Wire it into `resetAppData()`.** Add
      `window.localStorage.removeItem(STORAGE_KEYS.sharedTripLink);` to the existing removal
      sequence, grouped with the other auxiliary-collection removals (before `expenses`,
      `categories`, `exchangeRates` — same rationale already in the code comment: auxiliary data
      first, the trip record last).

- [x] **Step 5 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 6 — Commit.**
      Message: `feat(016): add sharedTripLink persistence to lib/storage`

---

### Task 2: [Config] — Prisma + Neon dependencies, schema, client generation, migration

> **Amended 2026-09-16 (discovered mid-execution, before this task's first attempt completed):**
> Prisma **7.10.0** (the version this plan pins) removed `datasource { url = env(...) }` from
> `schema.prisma` entirely — confirmed by actually running `npx prisma generate` against the
> original schema below, which fails with `P1012: The datasource property 'url' is no longer
> supported in schema files`, and by reading the installed `@prisma/config`'s own type
> definitions (`node_modules/@prisma/config/dist/index.d.ts`) and `@prisma/adapter-neon`'s
> (`node_modules/@prisma/adapter-neon/dist/index.d.ts`). The connection URL now lives in a new
> `prisma.config.ts` at the repo root, and `PrismaNeon`'s constructor takes a `neon.PoolConfig`
> object (`{ connectionString }`) directly — **not** a separately-constructed `Pool` instance, which
> is what an earlier draft of this task and of Task 3 assumed. Both are corrected below and in
> Task 3. This also means `npx prisma generate` now needs `DATABASE_URL` to be a **set** string
> (config loading calls `env("DATABASE_URL")` eagerly, which throws if unset) — it still does not
> need a *reachable* database, since generate performs no query.

**Files**
- modify: `package.json`
- create: `prisma/schema.prisma`
- create: `prisma.config.ts`
- create: `.env.local.example`
- test: `npx prisma generate`, `npx prisma migrate dev --name init_trip` (see prerequisite note),
  `npx tsc --noEmit`, `npm run lint`

- [x] **Step 1 — Install exact, pinned dependencies.** Do not install unpinned "latest" — as of
      this plan, `prisma`'s `latest` npm dist-tag resolves to an `8.0.0-rc.*` release candidate,
      while `@prisma/client`/`@prisma/adapter-neon`'s `latest` resolves to `7.10.0` (stable); mixing
      an 8.x CLI with 7.x client packages is untested and must not happen by accident of timing.
      ```
      npm install --save-exact @neondatabase/serverless@1.1.0 @prisma/adapter-neon@7.10.0 @prisma/client@7.10.0
      npm install --save-exact -D prisma@7.10.0 dotenv@17.4.2
      ```
      `dotenv` is already present in `node_modules` as an undeclared transitive dependency of
      `prisma` itself (confirmed: `package-lock.json` already lists `"dotenv": "^17.3.1"` resolving
      to `17.4.2`) — pinning it explicitly as a devDependency makes an already-present package
      declared rather than adding new capability to the tree. It is needed by `prisma.config.ts`
      (Step 2a) to load `.env.local`, since Prisma 7's config system does not auto-load any env file
      on its own (see the Amended note above).
      Expected: exit 0; `package.json` shows exact versions with no `^`/`~` range for these five
      packages (`"1.1.0"`, `"7.10.0"`, `"7.10.0"`, and devDependencies `"prisma": "7.10.0"`,
      `"dotenv": "17.4.2"`); `package-lock.json` is updated. Driver adapters (the `{ adapter }`
      constructor option used in Task 3) have been GA since Prisma 6.6 — well below 7.10.0 — so no
      `previewFeatures` flag is needed anywhere in this task; do not add one.

- [x] **Step 2 — Author the schema.** Prisma 7 no longer accepts a connection `url` inside
      `schema.prisma`'s `datasource` block (see Amended note) — this schema only declares the shape;
      the connection string lives in `prisma.config.ts` (Step 2a).
      Create `prisma/schema.prisma`:
      ```prisma
      generator client {
        provider = "prisma-client-js"
      }

      datasource db {
        provider = "postgresql"
      }

      model Trip {
        id                 String   @id @default(cuid())
        destinationCountry String
        currency           String
        startDate          DateTime
        endDate            DateTime
        budget             Float?
        shareToken         String   @unique
        creatorToken       String   @unique
        createdAt          DateTime @default(now())
      }
      ```

- [x] **Step 2a — Author `prisma.config.ts`.** This is what the standalone `prisma` CLI (generate,
      migrate) reads for the connection string — it is never imported by the Next.js app itself.
      Create `prisma.config.ts` at the repo root:
      ```ts
      import { config as loadEnv } from "dotenv";
      import { defineConfig, env } from "prisma/config";

      loadEnv({ path: ".env.local" });

      export default defineConfig({
        schema: "prisma/schema.prisma",
        migrations: {
          path: "prisma/migrations",
        },
        datasource: {
          url: env("DATABASE_URL"),
        },
      });
      ```
      `env("DATABASE_URL")` throws if the variable is unset at the time this file's top-level code
      runs — this is why `loadEnv` must execute before it, and why both Step 3 (generate) and Step
      4 (migrate) below need `DATABASE_URL` present in the process environment or in `.env.local`,
      not just at migrate time as originally assumed.

- [x] **Step 3 — Document the required env var.**
      Create `.env.local.example`:
      ```
      # Neon Postgres pooled connection string (pgbouncer endpoint, not the direct one).
      # Copy this file to .env.local and fill in the real value — .env.local is gitignored.
      DATABASE_URL="postgresql://<user>:<password>@<host>/<db>?sslmode=require"
      ```
      Note: this repo's blanket `.env*` gitignore rule also matches `.env.local.example` itself, so
      it will never actually be committed as a checked-in example under the current `.gitignore`.
      Create the file as specified (a future task can add a `!.env.local.example` negation if the
      user wants it tracked) — do not edit `.gitignore` in this task, it is not in this task's Files
      manifest.

- [x] **Step 4 — Generate the Prisma Client.** `prisma.config.ts` loads `.env.local` itself
      (Step 2a), so no manual `source` is needed here — plain:
      `npx prisma generate`
      Expected: exit 0, output containing `Generated Prisma Client`. This needs `DATABASE_URL` to
      be a set string (`prisma.config.ts` loading would otherwise throw — see Step 2a), but not a
      *reachable* database, since generate performs no query.

- [x] **Step 5 — Apply the migration.**
      `npx prisma migrate dev --name init_trip`
      Expected (with a real, reachable `DATABASE_URL` in `.env.local`): exit 0, output confirming
      the migration was applied and a `prisma/migrations/<timestamp>_init_trip/migration.sql` file
      was created.
      **Expected if `DATABASE_URL` is unset or unreachable:** a non-zero exit with an error naming
      the missing variable or connection failure — this is not a task failure. Record it in
      `log.txt` as blocked, leave this step's checkbox unticked, and continue to Task 3; nothing
      later depends on the migration having actually been applied, only on Step 4's generated types.
      Resume this step once the user supplies a working `DATABASE_URL`.
      Do not print the contents of `.env.local` (via `cat`, echo, or otherwise) at any point.

- [x] **Step 6 — Regression.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 7 — Commit.**
      Message: `feat(016): add Prisma schema and Neon dependencies for the Trip model`
      (Commit regardless of Step 5's outcome — the schema, `prisma.config.ts`, and generated-client
      state are real, committable progress even if no live database has applied the migration yet.
      Do **not** commit a fabricated migration file or a hand-edited "already applied" marker.)

---

### Task 3: [Data] — `lib/db.ts` Prisma client singleton

**Files**
- create: `lib/db.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (see Methodology note).

> **Amended 2026-09-16:** confirmed against the actually-installed
> `node_modules/@prisma/adapter-neon/dist/index.d.ts` — `PrismaNeon`'s constructor takes a
> `neon.PoolConfig` object (`{ connectionString, ...}`) **directly**, not a pre-constructed `Pool`
> instance. There is no need to import `Pool` from `@neondatabase/serverless` in this file at all;
> `@neondatabase/serverless` only needs to be present in `node_modules` as `@prisma/adapter-neon`'s
> peer dependency (already installed by Task 2).

- [x] **Step 1 — Implement to this contract.** (The `eslint-disable-next-line no-var` comment in
      the contract turned out unnecessary — this repo's ESLint config doesn't flag `var` inside an
      ambient `declare global` block, so the comment triggered an "unused directive" warning and
      was dropped from the actual file.)
      ```
      File: lib/db.ts (create)
      Exports: db: PrismaClient
      Behavior: at the top of the file, declare the global slot TypeScript strict mode requires
                before it can be read/written (a bare `globalThis.__prismaClient` access fails
                TS2339 without this):
                  declare global {
                    // eslint-disable-next-line no-var -- ambient global declarations require var
                    var __prismaClient: PrismaClient | undefined;
                  }
                Then construct the adapter directly from a connection-string config object —
                `new PrismaNeon({ connectionString: process.env.DATABASE_URL })` from
                `@prisma/adapter-neon` — and pass it as `{ adapter }` to
                `new PrismaClient({ adapter })`. Cache the instance on `globalThis.__prismaClient`
                (mirroring the standard Next.js-plus-Prisma singleton pattern) so hot-reload in
                `next dev` does not open a new client on every edit:
                  export const db = globalThis.__prismaClient ?? new PrismaClient({ adapter });
                  if (process.env.NODE_ENV !== "production") globalThis.__prismaClient = db;
      Constraints: must not read/validate DATABASE_URL eagerly in a way that throws at import
                   time — construction must succeed even when the variable is unset (`PrismaNeon`
                   only connects lazily, on first query); only an actual query attempt may fail.
                   Imported only by files under app/api/**. Do not import anything from
                   `@neondatabase/serverless` directly in this file — `PrismaNeon` wraps it
                   internally.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(016): add lib/db, the Prisma client singleton for server routes`

---

### Task 4: [Route] — `POST /api/trips` creates the server-side trip snapshot

**Files**
- create: `app/api/trips/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step — a Route Handler is invoked over HTTP, not via a TS import; its correctness is proven
by `npm run build` (compiles and registers the route) here and by Task 11's Playwright coverage,
not by a compiler failure first.

- [x] **Step 1 — Implement to this contract.** (Extended during review: a quality-gate pass found
      malformed dates and out-of-type `budget` values would slip past the `typeof` checks and cause
      a misleading 500 instead of 400, JSON parse failures were conflated with genuine server
      errors, and the catch block logged nothing. Fixed: `startDate`/`endDate` are now also checked
      for `Number.isNaN(new Date(...).getTime())`, `budget` is rejected with 400 if present and not
      a number, `request.json()` has its own try/catch returning 400 on parse failure, and the
      remaining catch logs via `console.error` before responding 500.)
      ```
      File: app/api/trips/route.ts (create)
      Exports: POST(request: Request): Promise<Response>
      Behavior: parse the JSON body as { destinationCountry: string; currency: string;
                startDate: string; endDate: string; budget?: number }. If destinationCountry,
                currency, startDate, or endDate is missing or not a string, respond 400 with
                { error: "Invalid trip data." }. Otherwise generate shareToken and creatorToken via
                crypto.randomUUID() (Node global, no new dependency), create a Trip row via
                db.trip.create with the parsed fields plus both tokens, and respond 201 with
                { id: trip.id, shareToken, creatorToken }. Any thrown error (DB unreachable, parse
                failure) is caught and responds 500 with { error: "Could not create the trip." }.
      Constraints: no auth check — nothing exists yet to authenticate against for the very first
                   call on a trip.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(016): add POST /api/trips to create a server-side shared trip`

---

### Task 5: [Route] — `POST /api/trips/[id]/regenerate` rotates the share token

**Files**
- create: `app/api/trips/[id]/regenerate/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step (see Task 4's rationale).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/api/trips/[id]/regenerate/route.ts (create)
      Exports: POST(request: Request, { params }: { params: Promise<{ id: string }> }):
               Promise<Response>
      Behavior: await params for id. Read header "x-creator-token". Load the Trip by id via
                db.trip.findUnique. If not found, respond 404 { error: "Trip not found." }. If the
                header does not match trip.creatorToken (including when the header is missing),
                respond 403 { error: "Not authorized." }. Otherwise generate a new shareToken via
                crypto.randomUUID(), update the row (db.trip.update), and respond 200
                { shareToken }. creatorToken is never rotated or returned. Any other thrown error
                (e.g. the database unreachable) is caught and responds 500 { error: "Could not
                regenerate the link." }, matching Task 4's create-route catch-all shape.
      Constraints: ignores any request body. Params are a Promise — confirmed against
                   node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
                   ("params and searchParams are Promises"), matching REFERENCE.md §5.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/regenerate`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(016): add POST /api/trips/[id]/regenerate to rotate the share token`

---

### Task 6: [Route] — `DELETE /api/trips/[id]` tears down a trip's server row

**Files**
- create: `app/api/trips/[id]/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step (see Task 4's rationale).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/api/trips/[id]/route.ts (create)
      Exports: DELETE(request: Request, { params }: { params: Promise<{ id: string }> }):
               Promise<Response>
      Behavior: await params for id. Read header "x-creator-token". Load the Trip by id. Not found
                -> 404 { error: "Trip not found." }. Header mismatch (including missing) -> 403
                { error: "Not authorized." }. Otherwise db.trip.delete({ where: { id } }) and
                respond 200 { ok: true }.
      Constraints: idempotency is not required beyond what "not found -> 404" already gives; a
                   second DELETE against an already-deleted id correctly 404s rather than
                   succeeding twice. Any other thrown error (e.g. the database unreachable) is
                   caught and responds 500 { error: "Could not delete the trip." }, matching Task
                   4's create-route catch-all shape.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(016): add DELETE /api/trips/[id] to tear down a shared trip`

---

### Task 7: [Domain] — `lib/sharedTrip.ts` client wrapper

**Files**
- create: `lib/sharedTrip.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (see Methodology note — no consumer exists until Task 9).

- [x] **Step 1 — Implement to this contract.** (A quality-gate pass found `generateShareLink`/
      `regenerateShareLink` discarded `saveSharedTripLink`'s `SaveResult` and always reported
      success even when the local write failed. Fixed by checking the result before returning
      `{ ok: true, ... }`, mirroring `lib/trip.ts`'s existing `saveTrip`-checking pattern.)
      ```
      File: lib/sharedTrip.ts (create)
      Exports:
        type ShareLinkResult = { ok: true; link: SharedTripLink } | { ok: false; error: string }
        buildShareUrl(shareToken: string): string
        generateShareLink(trip: Trip): Promise<ShareLinkResult>
        regenerateShareLink(link: SharedTripLink): Promise<ShareLinkResult>
        deleteSharedTrip(link: SharedTripLink): Promise<void>
      Behavior:
        - buildShareUrl is pure: `${window.location.origin}/join/${shareToken}`.
        - generateShareLink POSTs { destinationCountry: trip.destinationCountry, currency:
          trip.currency, startDate: trip.startDate, endDate: trip.endDate, budget: trip.budget }
          as JSON to "/api/trips". On a 2xx response, parse { id, shareToken, creatorToken },
          call saveSharedTripLink({ tripId: id, shareToken, creatorToken }) from lib/storage, and
          return { ok: true, link }. On a non-2xx response or a thrown error (network failure),
          return { ok: false, error: "Could not reach the server. Check your connection and try
          again." } without calling saveSharedTripLink.
        - regenerateShareLink POSTs to `/api/trips/${link.tripId}/regenerate` with header
          "x-creator-token": link.creatorToken. On a 2xx response, parse { shareToken }, build
          `{ ...link, shareToken }`, call saveSharedTripLink with it, and return
          { ok: true, link: updated }. On failure, return the same friendly-error shape as
          generateShareLink and do not touch storage (the existing link stays valid and saved).
        - deleteSharedTrip is best-effort: DELETEs `/api/trips/${link.tripId}` with the same
          header; any non-2xx response or thrown error is caught and swallowed (this function never
          rejects) — callers must proceed regardless of server reachability (see Task 8).
      Constraints: pure aside from fetch/window.location/localStorage-via-lib/storage; must not
                   import lib/db.ts.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(016): add lib/sharedTrip, the client wrapper for the trip-link API`

---

### Task 8: [Domain] — `submitNewTrip` tears down the outgoing trip's link

**Files**
- modify: `lib/trip.ts`
- modify: `app/trip/new/page.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

> Interaction: this task depends on Task 1 (`getSharedTripLink`/`clearSharedTripLink`) and Task 7
> (`deleteSharedTrip`) already existing.
>
> **Why this lands in `lib/trip.ts`, not the page's confirm click** (per spec.md TS-016-10 and its
> §2.4 module map, which name `lib/trip.ts` as the change target, not `app/trip/new/page.tsx`):
> `NewTripConfirm`'s `onConfirm` only reveals the `TripSetupForm` — no trip has been replaced yet at
> that point, and the form has no back button, so a user who confirms and then abandons the flow
> would have their *old, still-active* trip's link destroyed for nothing. Gating the teardown on
> `submitNewTrip`'s own validation passing (i.e., right before it actually clears the outgoing
> trip's expenses/rates and writes the new one) ties invalidation to the trip *actually* being
> replaced, matching BR-016-06's premise ("starting a new trip... invalidates the outgoing trip's
> link") exactly. `deleteSharedTrip` never rejects (Task 7's contract), so this does not make
> `submitNewTrip` newly awaitable or fallible — it stays fully synchronous, and no caller
> (`TripSetupForm.tsx`, `app/trip/new/page.tsx`'s other wiring) needs to change beyond the one
> `deps` object below.

- [x] **Step 1 — Write the failing change first: widen `submitNewTrip`'s deps type only.** In
      `lib/trip.ts`, add three properties to `submitNewTrip`'s `deps` parameter type (do not touch
      the function body yet):
      ```ts
      getSharedTripLink: () => SharedTripLink | null;
      clearSharedTripLink: () => SaveResult;
      deleteSharedTrip: (link: SharedTripLink) => Promise<void>;
      ```
      (Import `SharedTripLink` from `@/lib/types`.)

- [x] **Step 2 — Run it and confirm it fails.**
      `npx tsc --noEmit`
      Expected: exit 2, error TS2345 on `app/trip/new/page.tsx` — the object literal passed to
      `submitNewTrip` (`{ ...deps, saveExpenses, saveExchangeRates }`) is missing the properties
      `getSharedTripLink`, `clearSharedTripLink`, and `deleteSharedTrip` from the widened deps type.

- [x] **Step 3 — Implement the body.** In `lib/trip.ts`'s `submitNewTrip`, immediately after the
      existing validation check (`if (Object.keys(errors).length > 0) return { status: "invalid",
      errors };`) and **before** the existing `deps.saveExpenses([])` call, add:
      ```ts
      const link = deps.getSharedTripLink();
      if (link) {
        void deps.deleteSharedTrip(link);
        deps.clearSharedTripLink();
      }
      ```
      `deleteSharedTrip`'s promise is deliberately not awaited (`void`) — it never rejects, and
      `submitNewTrip` stays synchronous; the new trip is built and saved regardless of whether the
      server delete succeeds (matches the Architecture note on not blocking new-trip creation on
      connectivity).

- [x] **Step 4 — Update the call site.** In `app/trip/new/page.tsx`, add
      `import { getSharedTripLink, clearSharedTripLink } from "@/lib/storage";` and
      `import { deleteSharedTrip } from "@/lib/sharedTrip";`, then extend the existing
      `submitNewTrip(values, { ...deps, saveExpenses, saveExchangeRates })` call to
      `submitNewTrip(values, { ...deps, saveExpenses, saveExchangeRates, getSharedTripLink,
      clearSharedTripLink, deleteSharedTrip })`.

- [x] **Step 5 — Run it and confirm it passes.**
      `npx tsc --noEmit` → Expected: exit 0, no output.

- [x] **Step 6 — Regression.**
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      (No `npm run build` — this task adds no route and no dependency.)

- [x] **Step 7 — Commit.**
      Message: `feat(016): tear down a shared trip's link when starting a new trip`

---

### Task 9: [UI] — `components/ShareTripLink.tsx`

**Files**
- create: `components/ShareTripLink.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (see Methodology note — not mounted until Task 10, exactly as `AddCategoryModal.tsx`
and `CategoryManager.tsx` landed in feature 010).

- [x] **Step 1 — Implement to this contract.** (The single combined gate flagged a defensive-coverage
      gap — `handleCopy` had no try/catch, unlike every other async action here, so a clipboard
      failure would be an unhandled rejection with no user feedback. Fixed by wrapping it in a
      try/catch that sets a role="alert" error on failure.)
      ```
      File: components/ShareTripLink.tsx (create, 'use client')
      Exports: default function ShareTripLink({ trip }: { trip: Trip }): JSX.Element
      State: link = useState<SharedTripLink | null>(() => getSharedTripLink()); isPending, error
             (string | null), copied (boolean) — all useState.
      A useRef<boolean>(false) in-flight guard, read and set synchronously at the very top of both
      the generate and regenerate click handlers (before any await), reset to false in a `finally`
      block — this is what makes BR-016-11 (double-tap = one link) hold even though useState
      updates are not synchronous within the same event tick.
      Behavior:
        - No link (link === null): render an "Invite friends" button (className="btn-primary"),
          disabled while isPending. onClick (if the ref guard is already true, return immediately;
          otherwise set it true, setIsPending(true), setError(null)): await generateShareLink(trip).
          On ok: setLink(result.link). On !ok: setError(result.error). In `finally`: ref guard back
          to false, setIsPending(false).
        - Link exists: render buildShareUrl(link.shareToken) as read-only text (e.g. in a
          <p className="font-mono text-sm break-all">), a "Copy link" button (className=
          "btn-secondary") and a "Generate new link" button (className="btn-text"), both disabled
          while isPending.
          - Copy onClick: `await navigator.clipboard.writeText(url)`; on success setCopied(true)
            (no auto-hide timer — mirrors the static, non-expiring "Exchange rate saved." pattern
            in components/ExchangeRateForm.tsx).
          - Generate new link onClick: same in-flight-guard shape as the first-time generate button,
            calling regenerateShareLink(link) instead; on ok, setLink(result.link) AND
            setCopied(false) (the string changed, so a stale "copied" confirmation would mislead);
            on !ok, setError(result.error) and leave `link` untouched.
        - error, when non-null, renders as `<p role="alert">{error}</p>`, mirroring every other
          form in this app (ExchangeRateForm.tsx, AddCategoryModal.tsx).
        - copied, when true, renders `<p role="status" className="text-sm text-(--success-text)">
          Link copied.</p>`, mirroring ExchangeRateForm.tsx's "Exchange rate saved." pattern.
      Constraints: the only localStorage read in this component is the initial
                   `getSharedTripLink()` lazy-state read; every write goes through
                   generateShareLink/regenerateShareLink (lib/sharedTrip.ts), never called directly
                   here. Must not import lib/db.ts.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(016): add ShareTripLink for inviting friends via a shareable link`

---

### Task 10: [Route] — mount `ShareTripLink` on the Settings page

**Files**
- modify: `app/settings/page.tsx`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

- [x] **Step 1 — Write the call site.** In `app/settings/page.tsx`, add
      `import ShareTripLink from "@/components/ShareTripLink";`.

- [x] **Step 2 — Confirm the import resolves.**
      `npx tsc --noEmit` → Expected: exit 0, no output (the component already exists from Task 9,
      so there is nothing to fail here — this step exists to catch a typo in the import path before
      moving on).

- [x] **Step 3 — Mount it.** Add `<ShareTripLink trip={trip} />` inside the returned JSX,
      immediately after `<ExchangeRateForm trip={trip} />` and before the "Export expenses" section
      — reading top-to-bottom as: trip currency → exchange rate → invite friends → export → reset.

- [x] **Step 4 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table unchanged in shape
      (still lists `/settings`).
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 5 — Commit.**
      Message: `feat(016): mount ShareTripLink on the Settings page`

---

### Task 11: [Behavioral] — Playwright coverage for the full feature

**Files**
- create: `e2e/016-generate-shareable-trip-link.spec.ts`
- test: `npx playwright test e2e/016-generate-shareable-trip-link.spec.ts`

> **⚠️ This task requires a live `DATABASE_URL`.** Every scenario below makes a real request
> against `app/api/trips/*`, which needs a reachable Postgres database — there is no mock layer in
> this stack. If `DATABASE_URL` is not yet set when this task is reached, **stop here**: write the
> spec file (Step 1) so the work is captured, but do not attempt to force Steps 2–3 to pass, do not
> stub the database, and do not mark this task complete. Record the block in `log.txt` and resume
> once the variable is set — per CLAUDE.md, a failing build must never reach git history, and this
> is a real infrastructure gap, not a two-attempt-escalation code defect.

- [x] **Step 1 — Write the spec** (E2E-016-04 renamed to `the previous link's token is genuinely
      replaced after regeneration`: `creatorToken` never rotates by design, so literally replaying
      the old creatorToken against `regenerate` can never fail even against a broken
      implementation; the achievable, honest check is that the old `shareToken` is genuinely gone
      from the UI while `creatorToken` still authorizes a further call — see the spec file's own
      note on this), covering (per spec.md §4, `doc/features/016-generate-shareable-trip-link/spec.md`):
      1. `generates a link the first time you invite friends` (E2E-016-01)
      2. `reopening the invite action shows the same link` (E2E-016-02)
      3. `regenerating shows a new link` (E2E-016-03)
      4. `the previous link's token is rejected after regeneration` (E2E-016-04)
      5. `starting a new trip invalidates the old link` (E2E-016-05)
      6. `editing trip details keeps the same link` (E2E-016-06)
      7. `shows a friendly error when generation fails offline` (E2E-016-07)
      8. `shows a friendly error when regeneration fails, keeping the old link` (E2E-016-08)
      9. `double-clicking generate issues exactly one request` (E2E-016-09)
      10. `the link survives a refresh` (E2E-016-10)
      11. `copying the link shows a confirmation and puts it on the clipboard` (E2E-016-11)

      Per `.claude/repo-profile.md` § Behavioral gate: seed `localStorage` via
      `page.addInitScript` before first render (a valid `travel-expense:trip` value, so `/settings`
      does not redirect home), and scope every `role="alert"`/`role="status"` assertion to
      `ShareTripLink`'s own container to avoid colliding with Next.js's route announcer. Use
      `page.route("**/api/trips**", ...)` to abort/count requests for the offline and double-tap
      scenarios (E2E-016-07, 08, 09), and grant `clipboard-read`/`clipboard-write` permissions for
      E2E-016-11.

- [x] **Step 2 — Run it and confirm it passes** (implementation already landed in Tasks 1–10). The
      first run found one real flake, fixed before commit: `generates a link the first time you
      invite friends` relied on the link paragraph appearing within the default 5s expect timeout,
      but it's the one scenario that creates a brand-new Neon row through the UI without a prior
      warm connection, and a cold serverless connect can exceed 5s. Fixed by waiting for the real
      `POST /api/trips` response explicitly (`page.waitForResponse`), matching the pattern already
      used by the regenerate scenario.
      `npx playwright test e2e/016-generate-shareable-trip-link.spec.ts`
      Expected: exit 0, `11 passed`.

- [x] **Step 3 — Regression.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 4 — Commit.**
      Message: `feat(016): add Playwright coverage for the shareable trip link`

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

    feat(016): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: features/016.generate-shareable-trip-link.md

Never commit on a failing lint, typecheck, or build.

## Completion Summary

**What was built:** A server-backed shared-trip link. `lib/storage.ts` persists a `SharedTripLink`
pointer locally; a new `Trip` model in Neon (Prisma) backs `POST /api/trips` (create),
`POST /api/trips/[id]/regenerate` (rotate `shareToken`), and `DELETE /api/trips/[id]` (teardown),
all authenticated via a creator-secret `x-creator-token` header. `lib/sharedTrip.ts` wraps those
three calls for client use. `components/ShareTripLink.tsx` (mounted on the Settings page) drives
generate/regenerate/copy, guarding against a rapid double-tap with an in-flight ref. Starting a new
trip (`lib/trip.ts`'s `submitNewTrip`) fires a best-effort teardown of the outgoing trip's link
before proceeding. 11 Playwright scenarios in `e2e/016-generate-shareable-trip-link.spec.ts` cover
the full feature end-to-end against a real Neon database.

**Deviations from the plan:**
- Task 2: Prisma 7.10.0 removed `datasource.url` from `schema.prisma`; the connection string moved
  to a new `prisma.config.ts` loaded via explicit `dotenv`, not the plan's original shape.
- Task 4: validation was extended beyond typeof-checks to reject unparseable dates and wrong-typed
  budgets, and a malformed JSON body responds 400 instead of falling into the generic 500 path.
- Task 7: `generateShareLink`/`regenerateShareLink` check `saveSharedTripLink`'s `SaveResult` and
  propagate a failure instead of assuming the local write always succeeds.
- Task 11: E2E-016-04 was renamed and reframed (`creatorToken` never rotates by design, so the
  literal "replay the old token" check could never fail even against a broken implementation); one
  flaky assertion (first-generation scenario racing a cold Neon connect against the default 5s
  timeout) was fixed by waiting on the real network response explicitly.

**Follow-ups not in scope:** `resetAppData()` clears the local `sharedTripLink` pointer but does not
delete the corresponding server row (accepted gap, see spec.md Open Questions). A true concurrent
double-DELETE race (two simultaneous requests both passing `findUnique` before either `delete` runs)
falls into the generic 500 path rather than a clean idempotent 404 — accepted given this feature's
single-device concurrency model.

**Final verification:** `npx playwright test e2e/016-generate-shareable-trip-link.spec.ts` → 11
passed. `npx tsc --noEmit` → exit 0. `npm run lint` → exit 0. `npm run build` → exit 0, route table
includes `/api/trips`, `/api/trips/[id]`, `/api/trips/[id]/regenerate`.
