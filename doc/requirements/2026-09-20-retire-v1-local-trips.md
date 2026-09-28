# Requirement: Retire v1 (Local-Storage Solo Trips) — v2 Becomes the Sole Trip Model

**Date:** 2026-09-20
**Status:** Approved — decomposition only, no features authored yet

## Confirmed restatement

Remove the v1 local-storage-only solo-trip flow entirely, so that every trip in the app —
including a first-time user's very first trip — is created and used as a v2 server-backed shared
trip, with no local-only trip mode left.

## Standing-context amendments (supersede `features/OVERVIEW.md` §1–3, `REFERENCE.md` §6)

`OVERVIEW.md` §2 and `REFERENCE.md` §6 currently state, as confirmed product facts, that an
unshared trip stays in `localStorage` exclusively, that the app works offline for trips that have
not been shared, and that a trip only becomes server-backed "the moment its creator generates a
shareable link." All three are being retired along with v1:

1. **Backend**: every trip is a server-backed row from the moment it is created. There is no more
   "solo" vs "shared" distinction — a trip always has a share link available, whether or not
   anyone has used it yet.
2. **Offline**: the offline-after-load guarantee is dropped. Trip creation, recording an expense,
   viewing the dashboard, etc. all require connectivity, matching how the rest of v2 (join, share,
   balances, settle) already behaves. No offline-sync or conflict-merge layer is being built.
3. **Trip roles**: `lib/tripSwitcher.ts`'s `TripRole` (`"own" | "created" | "joined"`) collapses to
   `"created" | "joined"` — the `"own"` (local-only) role has no server counterpart once v1 is gone.
4. **Migration**: a device that already has a v1 local trip does not lose it — see Migration risk
   below and feature 030.

These amendments are written into `OVERVIEW.md` §1–3 and `REFERENCE.md` §6 as part of feature 031
(Retire v1), once every feature that depends on v1 still existing (023–030) has landed.

## Impact analysis

**Build status:** all 22 features (001–022) are committed. v2 (016–022) covers link generation,
joining, multi-trip switching, participants, split attribution, balances, and settling — but it
was speced as an *addition* alongside v1, not a replacement for it, so several v1 capabilities
have no v2 equivalent yet.

### Touched modules

| Module | Reason | R/W |
|---|---|---|
| `app/page.tsx` | Today branches on a local `Trip` (setup vs. dashboard); becomes the unconditional server-trip entry point, plus the migration check (030) | write |
| `app/trip/new/page.tsx`, `app/trip/edit/page.tsx` | v1-only routes; superseded by 023/025's server-backed equivalents | delete (031) |
| `app/expenses/new/page.tsx`, `app/expenses/[id]/page.tsx` | v1-only record/view routes; `SharedExpenseForm`/`SharedExpenseDetail` (020) are already the shared-trip equivalents | delete (031) |
| `app/categories/page.tsx` | v1-only category management; superseded by 024 | delete (031) |
| `app/settings/page.tsx` | v1 settings (rates entry, export, reset); split into 026/028/029's trip-scoped equivalents | delete (031) |
| `components/TripSetupForm.tsx`, `TripEditForm.tsx`, `NewTripConfirm.tsx` | v1 forms | delete (031), after 023/025 |
| `components/ExpenseForm.tsx`, `AddCategoryModal.tsx`, `CategoryManager.tsx` | v1 expense/category UI; `ExpenseForm` is already dead weight for the shared path (020 uses `SharedExpenseForm` instead) | delete (031), after 024 |
| `components/ExchangeRateForm.tsx` | v1 rates UI | delete (031), after 026 |
| `components/Dashboard.tsx`, `CategoryPieChart.tsx` | v1 dashboard | delete (031), after 027 |
| `components/ResetAppDataConfirm.tsx` | v1 reset | delete (031), after 029 |
| `lib/trip.ts`, `lib/expenses.ts`, `lib/categories.ts`, `lib/export.ts` | v1 domain logic bound to `localStorage` | delete/rewrite (031) |
| `lib/currency.ts` | Mostly pure conversion math (`getConvertedTotals`, `getRemainingBudget`); reusable as-is by 026/027, not v1-specific | read (reuse), light write |
| `lib/storage.ts` | `STORAGE_KEYS.trip/expenses/categories/exchangeRates` removed; `sharedTripLink`/`joinedTrips` remain | write (031) |
| `lib/tripSwitcher.ts`, `components/TripSwitcher.tsx` | `TripRole` collapses from three roles to two | write (031) |
| `components/BottomNav.tsx` | Nav targets move from v1 routes to trip-scoped `/trips/[token]/...` routes | write, incrementally across 023–029 |
| `features/OVERVIEW.md` §1–3, `REFERENCE.md` §6, `CLAUDE.md` order table | Standing-context rewrite per above | write (031, plus each feature's own §4/§7 index updates) |

### New surface

- **New module boundary**: per-trip `Category` (024) — a new Prisma model + API routes, since
  custom categories can no longer live in a single device's `localStorage`.
- **New API surface**: trip-details edit (025, likely `PATCH /api/trips/[id]` — no edit verb exists
  today, only `GET`/`DELETE`/`POST .../regenerate`); a dashboard/summary read (027, may reuse
  existing expense/balance reads rather than need a new endpoint — decide in 027's Mode B).
- **New client module**: a migration routine (030) that detects a legacy local trip on first load,
  uploads it and its expenses/categories/rates, then clears the local keys.
- **`app/page.tsx` rewritten**: unconditional "does this device already have a created or joined
  trip? → redirect. Is there a legacy local trip to migrate? → migrate, then redirect. Otherwise →
  show trip creation" — replacing today's "local trip exists? show dashboard : show setup" branch.

### Migration risk

Real, and the reason feature 030 exists. A user who already created a v1 trip has it sitting in
their browser's `localStorage` right now; the routes/components that read it are deleted in 031.
Per the approved decision, 030 auto-migrates it on next visit: uploads the trip via the same
`POST /api/trips` 016 already uses, re-creates its expenses/custom categories/exchange rates
server-side, then clears the local `trip`/`expenses`/`categories`/`exchangeRates` keys. Open risks
deferred to 030's Mode B sweep: resumability if the network drops mid-migration (trip created
server-side but expenses not yet uploaded), and correctly merging the migrated trip into a device
that already has `joinedTrips` entries from earlier v2 use rather than clobbering that list.

### What already covers part of this

- **016 (Generate Shareable Trip Link)**: `POST /api/trips`, `DELETE /api/trips/[id]`, and
  `.../regenerate` are reused directly by 023 (creation), 029 (delete), and 030 (migration's
  upload call) — no new backend design needed for those. 016 itself is not being rewritten here;
  once 023 lands, a trip has its link from creation, which may make 016's "Generate" step
  effectively instant/a no-op — that amendment question is deferred to 023's own Mode B sweep
  (rule: open at most 3 collision files; 016 is 023's one named collision).
- **020 (Attribute an Expense to Payer and Split)**: `SharedExpenseForm.tsx` already calls
  `useUnsavedChangesWarning(isDirty)` — v1's unsaved-warning (011) is **already fully covered**
  for shared trips. Confirmed by reading the component; not included as a gap or a slice below.
- **Exchange rates and budget already have server-side support**: `ExchangeRate` model +
  `PUT /api/trips/[id]/exchange-rates` (016), and `Trip.budget` accepted by `POST /api/trips`
  (016) — 025/026 are UI-only slices, not new backend design.
- **021/022 (balances, settle up)**: fully cover the balances domain already; untouched by this
  initiative.

## Slices (approved)

| # | Title | User goal | Est. scenarios | Depends on | Build position |
|---|---|---|---|---|---|
| 023 | Create a Trip as a Shared Trip | As a user, my very first trip is created directly on the server with a share link available immediately, so I never need a local-only trip | ~5–6 | none | 1st — the new entry point everything else assumes |
| 024 | Manage Custom Categories for a Shared Trip | As a trip member, add/rename/delete categories scoped to my trip | ~6–7 | 023 | 2nd — new module boundary, mirrors v1's early categories-before-everything-else ordering |
| 025 | Edit a Shared Trip's Details | As the trip creator, edit destination/dates/budget after creation | ~5 | 023 | 3rd — builds on trip creation |
| 026 | Manage Exchange Rates for a Shared Trip | As a trip member, enter/update rates for non-trip currencies so totals convert correctly | ~5 | 023 | 4th — needed before the dashboard can show complete conversions |
| 027 | View a Shared Trip's Dashboard | As a trip member, see total spend, budget/remaining, category breakdown, and recent transactions | ~6–7 | 023, 024, 025, 026 | 5th — aggregates everything above, mirrors v1's 009 dependency on 007/008 |
| 028 | Export a Shared Trip's Expenses | As a trip member, export my trip's expenses as CSV | ~3–4 | 023 (safest after 024, since export columns include category) | 6th |
| 029 | Delete a Shared Trip | As the trip creator, permanently delete my trip and all its data | ~4 | 023 | 7th — safest once all trip data types exist |
| 030 | Migrate an Existing Local Trip to a Shared Trip | As a user who had a local-only trip before the upgrade, have it (and its expenses/categories/rates) automatically carried over next time I open the app | ~5–6 | 023, 024, 026 | 8th — needs server-side categories/rates support so migrated data lands faithfully |
| 031 | Retire v1 (Remove Local-Only Trip Mode) | As any user, opening the app always lands me in the shared-trip experience, with no local-only trip mode reachable anywhere | ~4–5 | 023–030, all complete | 9th — nothing may depend on v1 before it's removed |

## Rejected splits

- **A standalone "Budget" feature mirroring v1's 008.** Rejected: budget *entry* already happens
  in 023 (create) and 025 (edit); `getRemainingBudget` is already pure, reusable domain logic. All
  that's missing is *display*, which is one line item in 027's dashboard — not enough surface for
  its own user goal.
- **An "Unsaved Expense Warning" parity slice.** Not needed at all — `SharedExpenseForm.tsx`
  already has it (see "What already covers part of this"). Dropped from the list entirely rather
  than deferred.
- **Splitting "Retire v1" into one removal feature per route/component.** Rejected: removal has
  one user-observable goal — "the app has exactly one way to create and use a trip." A
  half-removed app (some v1 routes gone, others not) is not an independently demonstrable
  intermediate state.
- **Deleting or rewriting feature 016 now.** Rejected: it's already shipped and its
  regenerate/copy-link scenarios stay valid after 023 lands. Whether "Generate" becomes "Copy my
  link" is an amendment question for 023's own Mode B sweep, not a unilateral rewrite here.

## Open questions (deferred to each feature's own Mode B edge-case sweep)

- **023**: does the creator see their share link immediately on creation? Does 016's "Generate"
  action get amended, replaced, or left as-is (now instant)?
- **024**: are custom categories visible/editable by any trip member, or creator-only (mirrors
  019's creator-only precedent for participant removal)?
- **025**: can any participant edit destination/dates/budget, or creator only?
- **026**: who may enter/update exchange rates — creator only, or any participant (v1 had no
  multi-user distinction here at all)?
- **029**: when the creator deletes a trip, are participants' local `joinedTrips` entries pruned
  automatically (like the not-found handling `SharedTripView.tsx` already does for a stale token),
  or left stale until next visit?
- **030**: is migration resumable/idempotent if the network drops mid-migration (trip created
  server-side, expenses not yet uploaded)? How does it merge with a device that already has
  `joinedTrips` entries from prior v2 use?
- **031**: exact fate of `lib/currency.ts` — kept (its pure conversion functions are imported by
  026/027) vs. deleted wholesale as "v1 code." Answer: kept: flagged here so 031 doesn't delete it
  by reflex.

## Next commands

```
/feature-discovery 023    # Create a Trip as a Shared Trip
/feature-discovery 024    # Manage Custom Categories for a Shared Trip
/feature-discovery 025    # Edit a Shared Trip's Details
/feature-discovery 026    # Manage Exchange Rates for a Shared Trip
/feature-discovery 027    # View a Shared Trip's Dashboard
/feature-discovery 028    # Export a Shared Trip's Expenses
/feature-discovery 029    # Delete a Shared Trip
/feature-discovery 030    # Migrate an Existing Local Trip to a Shared Trip
/feature-discovery 031    # Retire v1 (Remove Local-Only Trip Mode)
```
