# Requirement: Shared Trip Expense Tracking (v2)

**Date:** 2026-09-13
**Status:** Approved — decomposition only, no features authored yet

## Confirmed restatement

Let trip creators generate a unique shareable link so friends can join their trip as
participants, attribute expenses to who paid and who they're split among, and see computed
balances (who owes whom) — which requires moving the app from single-device local storage to a
server-backed shared data model for trips that are shared.

## Standing-context amendments (supersede `features/OVERVIEW.md` §1–3 for shared trips)

`OVERVIEW.md` currently states the app has no backend, works offline, and supports exactly one
trip per device. These stay true for **solo (non-shared) trips**. For **shared trips**, the
following amendments apply and must be reflected in `OVERVIEW.md` §1–3 when feature 016 lands:

1. **Backend**: a shared trip is stored server-side (API + database), not in `localStorage`. A
   solo trip stays on `localStorage` exactly as today. A trip only moves to the server the moment
   its creator generates a share link (feature 016) — there is no migration of existing solo-trip
   data, since the two paths never mix for the same trip.
   **Resolved 2026-09-13**: Neon serverless Postgres, accessed via `@neondatabase/serverless`
   (HTTP-based — no persistent TCP pool, safe under a public serverless deploy) wrapped by Prisma
   (`@prisma/adapter-neon`) for schema/migrations/type-safe queries. Pooled connection string in
   `DATABASE_URL`, read only inside a new `lib/db.ts` module that is imported exclusively by
   `app/api/*` Route Handlers / Server Actions — never by a Client Component. See
   [REFERENCE.md](../../REFERENCE.md) §6 "Shared trips / database connection" for the full note;
   feature 016's plan is what actually adds the `next`/`react`/`react-dom`-only dependency set
   (`@neondatabase/serverless`, `prisma`, `@prisma/client`, `@prisma/adapter-neon`).
2. **Offline**: "works offline" remains true for solo trips only. Shared trips require
   connectivity; no offline-sync or conflict-merge layer is being built for v2.
3. **One active trip**: this becomes "one *owned* solo trip, plus any number of shared trips the
   device's user has joined or created" rather than a single global trip. Feature 018 (Switch
   Between Multiple Trips) is the user-facing consequence of this change.

## Impact analysis

**Build status:** all 15 v1 features (001–015) are committed and complete. This is greenfield
work on top of a finished app.

### Touched modules

| Module | Reason | R/W |
|---|---|---|
| `lib/storage.ts` | Sole persistence layer today; a shared trip's data can't live in per-browser `localStorage` | read (unchanged for solo trips) |
| `lib/types.ts` | `Trip`/`Expense` need participant/split fields, for shared trips only | write |
| `lib/trip.ts`, `lib/expenses.ts` | Trip/expense domain logic assumes one implicit user | write |
| `lib/currency.ts` | Conversion logic is reusable for settlement math but doesn't net balances between people | write (new module, e.g. `lib/settlement.ts`) |
| `components/Dashboard.tsx` | Needs a balances/settle-up section for shared trips | write |
| `app/page.tsx`, `app/trip/*` | "one active trip" gating logic needs a trip-selection concept | write |
| `components/TripSetupForm.tsx`, `TripEditForm.tsx` | Read trip shape; need to know if a trip is shared | read/light write |
| `components/BottomNav.tsx` | May need a trip-switcher once multiple trips exist | write |
| `features/OVERVIEW.md` §1–3 | Standing-context amendment per above | write |

### New surface

- New module boundary: participant/identity handling (who "you" are on this device, per trip).
- New module boundary: split/settlement math (net balances, simplify debts).
- New storage: server-side trip/expense/participant records (API routes + DB) for shared trips
  only; `STORAGE_KEYS` localStorage model is untouched for solo trips.
- New routes: join-by-link flow, participants/settle-up screens.
- New concept: share-link token (generation, and what happens if it leaks — covered in 016's
  edge-case sweep).

### Migration risk

None for existing data: solo trips already in `localStorage` are never touched by the new
server-backed path, since a trip only becomes server-backed when its creator explicitly generates
a share link (016). A v1 user who never shares a trip sees no change at all.

### What already covers part of this

- **006/007 (multi-currency, exchange rates)**: `getConvertedTotals` is directly reusable for
  settlement math across currencies; settlement is new but shouldn't reinvent currency conversion.
- **009 (dashboard)**: already the aggregation point; a balances section extends it rather than
  replacing it.
- **001–003 (trip setup/edit/new)**: the "one trip, deletes on new" flow needs to coexist with,
  not be replaced by, a multi-trip-membership model — the biggest conceptual collision, resolved
  by keeping solo trips on their existing flow untouched and adding shared trips alongside.

## Slices (approved)

| # | Title | User goal | Est. scenarios | Depends on | Build position |
|---|---|---|---|---|---|
| 016 | Generate a Shareable Trip Link | As a trip creator, generate a unique link so I can share my trip with friends | ~6 | none | 1st — introduces server-backed shared-trip storage everything else needs |
| 017 | Join a Shared Trip via Link | As a friend, open a link and join as a named participant | ~6 | 016 | 2nd — needs a link to exist |
| 018 | Switch Between Multiple Trips | As a user who now belongs to more than one trip, view and switch between them | ~5 | 016, 017 | 3rd — multi-trip membership only exists once joining is possible |
| 019 | Manage Trip Participants | As a creator or participant, see who's in the trip, leave it, or remove someone | ~6 | 017 | 4th — extension of membership; needed before split logic must handle removal |
| 020 | Attribute an Expense to Payer and Split | As a participant, record who paid and who an expense is split among | ~6 | 017, 019 | 5th — needs real participants to attribute to |
| 021 | View Trip Balances (Who Owes Whom) | As a participant, see the running balance across the group | ~6 | 020 | 6th — needs split data to compute from |
| 022 | Settle Up a Balance | As a participant, mark a debt as settled | ~5 | 021 | 7th — needs balances to settle against |

## Rejected splits

- **A standalone "shared-trip persistence" feature**, mirroring how 012 covered `localStorage`.
  Rejected: on its own it has no independently demonstrable user action, so its scenarios (data
  survives refresh, connectivity/save failures) are folded into 016 (creator-side) and 017
  (joiner-side) instead.
- **Merging "manage participants" into "join"**. Rejected: leave/remove are separate,
  later-triggered actions distinct from the join flow; combined would exceed the ~7-scenario
  sizing guideline.
- **Merging "view balances" (read) and "settle up" (write)**. Rejected: separately useful,
  independently demonstrable actions — kept split per the same CRUD-separation precedent as
  feature 010 (add/rename/delete categories as one feature, but read vs. state-changing actions
  elsewhere in this app are kept apart, e.g. 009's read-only detail view vs. 005's record flow).

## Open questions (deferred to each feature's own Mode B edge-case sweep)

- ~~**016**: what database/hosting/connection model backs server-side shared-trip storage?~~
  Resolved above (Neon Postgres + Prisma via `@prisma/adapter-neon`, `lib/db.ts` boundary).
- ~~**016**: is server-side shared-trip data ever deleted, and on what trigger?~~ Resolved
  2026-09-13: yes — starting a new trip deletes the outgoing shared trip's server-side rows
  (cascade to expenses/participants), not just its link. No other teardown trigger exists in v2
  (no idle expiry, no standalone delete action). See feature 016's Assumption 6.
- **016**: what happens if a share link leaks — is regeneration/revocation in scope?
- **019**: does removing a participant affect their past recorded expenses?
- **020**: equal-only splits for v2, or also exact-amount/percentage splits?
- **021**: how are balances presented/settled when they span multiple currencies?

## Next commands

```
/feature-discovery 016    # Generate a Shareable Trip Link
/feature-discovery 017    # Join a Shared Trip via Link
/feature-discovery 018    # Switch Between Multiple Trips
/feature-discovery 019    # Manage Trip Participants
/feature-discovery 020    # Attribute an Expense to Payer and Split
/feature-discovery 021    # View Trip Balances (Who Owes Whom)
/feature-discovery 022    # Settle Up a Balance
```
