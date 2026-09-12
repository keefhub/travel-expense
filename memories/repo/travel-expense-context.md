# Travel Expense — Repo Context Packet

> **STALE WARNING (2026-09-11):** the "Design system" section below describes `.btn-primary`/
> `.btn-secondary`/`.btn-danger` component classes and an extended color-token set (`--surface`,
> `--muted`, `--border`, `--accent`, `--danger`, `--warning`, `--success`) as if already present in
> `app/globals.css`. Verified directly (`grep` against the real file): **none of that exists at
> `HEAD` right now** — `globals.css` only declares `--background`/`--foreground`. This packet
> appears to have been written describing an in-progress dark-mode/design-token refactor as if it
> had already landed; that refactor was found broken and uncommitted in the shared working tree
> (multiple concurrent sessions, unclaimed), and has since been stashed (reversible — see
> `git stash list`) rather than committed, with the repo's user's authorization. Until that refactor
> (or something like it) actually lands, do **not** write new code assuming `.btn-*` classes or any
> token beyond `--background`/`--foreground` exist. Several already-shipped components
> (`NewTripConfirm.tsx`, `ExchangeRateForm.tsx`, `TripEditForm.tsx`) already reference some of these
> undefined tokens too (e.g. `text-[var(--danger)]`) — this is a pre-existing, repo-wide cosmetic gap
> that quietly no-ops rather than breaking the build, not something any one feature is responsible
> for fixing. Regenerate this whole packet from the real `REFERENCE.md`/`design.md`/`app/globals.css`
> once the token system's actual state is settled.

Distilled from `REFERENCE.md` §2/§4/§6, `features/OVERVIEW.md` §1–3, and `design.md`, for handing to
implementer/reviewer subagents instead of the raw files. Regenerate this file (in the same change)
whenever one of those sources changes in a way this packet no longer reflects.

## What this app is

Mobile-first, offline-capable travel expense tracker. No backend, no database, no API routes — all
state lives in browser `localStorage`. One active trip at a time; creating a new trip deletes the old
one after confirmation. Minimal design style; mobile bottom nav (Home, Add Expense, Categories,
Settings) is the app shell every page renders inside.

## Stack & commands

| Thing      | Version / choice                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16.3.3, App Router (`app/`)                                                                              |
| React      | 19.2.8                                                                                                           |
| Language   | TypeScript 5, `strict: true`                                                                                     |
| Styling    | Tailwind CSS v4, CSS-first config (no `tailwind.config.js`) — tokens in `app/globals.css`                        |
| Lint       | ESLint 9 flat config (`eslint-config-next`)                                                                      |
| Tests      | none installed — no jest/vitest/playwright. Verification = `npx tsc --noEmit` + `npm run lint` + `npm run build` |
| Path alias | `@/*` → repo root                                                                                                |

Commands: `npm run dev`, `npm run build` (also the typecheck gate via `next build`'s TypeScript pass —
but this repo also runs `npx tsc --noEmit` directly as a separate, faster typecheck step in plans),
`npm run lint`, `npm start`. Runtime deps are only `next`/`react`/`react-dom` — no chart/date/form/state
library. Do not silently add a dependency; raise it with the user first.

## Layers (task/file boundaries)

| Layer  | Path               | Holds                                                                          |
| ------ | ------------------ | ------------------------------------------------------------------------------ |
| Types  | `lib/types.ts`     | Shared domain interfaces: `Trip`, `Category`, `Expense`, `ExchangeRate`        |
| Data   | `lib/storage.ts`   | `localStorage` read/write, key naming, serialization, error surfacing          |
| Domain | `lib/<name>.ts`    | Pure functions — validation, mapping, formatting. No DOM, no storage, no clock |
| UI     | `components/*.tsx` | Presentational/interactive React client components                             |
| Route  | `app/**/page.tsx`  | App Router entries; client components where they touch storage                 |

Data, domain, and UI/route work are always separate tasks/commits.

## Current file layout (as of feature 005 complete; 006 not yet started)

```
app/
  layout.tsx              # root layout, Geist fonts, max-w-2xl container, BottomNav
  page.tsx                # "/" — setup form (no trip) or dashboard placeholder (trip exists);
                           #   'use client', useSyncExternalStore-over-per-mount-store pattern;
                           #   shows one-time "Expense saved." message after a save (005)
  expenses/new/page.tsx   # record-expense route (005, complete)
  trip/edit/page.tsx      # edit-trip route (002, complete)
  trip/new/page.tsx       # new-trip route (003, complete)
  categories/page.tsx     # placeholder — replaced by feature 010's UI (unassigned)
  settings/page.tsx       # placeholder — replaced by feature 007 (exchange-rate management)
lib/
  types.ts       # Trip, Category, Expense, ExchangeRate
  storage.ts     # getTrip/saveTrip, getCategories/saveCategories, getExpenses/saveExpenses,
                 #   getExchangeRates/saveExchangeRates — all safe (try/catch, fallback [] or null)
  countries.ts   # SUPPORTED_COUNTRIES, getCurrencyForCountry, isSupportedCountry,
                 #   searchSupportedCountries, getSupportedCurrencies
  categories.ts  # DEFAULT_CATEGORIES (frozen), getAllCategories, isDefaultCategoryName,
                 #   addCategory/renameCategory/deleteCategory
  trip.ts        # calculateTripDurationDays, validateTripForm, submitTripSetup, getTripFormValues,
                 #   submitNewTrip
  expenses.ts    # ExpenseFormValues, PAYMENT_METHODS, EXPENSE_SAVED_FLAG_KEY,
                 #   getInitialExpenseFormValues, validateExpenseForm, submitExpense
components/
  BottomNav.tsx, TripSetupForm.tsx, TripEditForm.tsx, NewTripConfirm.tsx, ExpenseForm.tsx
```

`lib/storage.ts` public API (feature 012, complete) — this is the whole data layer:

- `STORAGE_KEYS` = `{ trip: "travel-expense:trip", expenses: "travel-expense:expenses", categories: "travel-expense:categories", exchangeRates: "travel-expense:exchange-rates" }`
- `SaveResult` = `{ ok: true } | { ok: false; error: string }`
- `getTrip(): Trip | null` / `saveTrip(trip): SaveResult`
- `getCategories(): Category[]` / `saveCategories(categories): SaveResult`
- `getExpenses(): Expense[]` / `saveExpenses(expenses): SaveResult`
- `getExchangeRates(): ExchangeRate[]` / `saveExchangeRates(rates): SaveResult`

All getters return a safe fallback on SSR/missing/corrupt data; all setters catch write failures and
return the friendly `SaveResult` error instead of throwing.

## Domain facts that cut across features

- **Trip**: destination country (fixed list), start/end date, derived travel-days, derived currency,
  optional budget. One active trip only.
- **Expense**: amount, currency, category, date, payment method, location (all mandatory); description
  optional. Date defaults to today; future dates allowed; out-of-range dates warn but don't block.
- **Categories**: defaults are Food, Transport, Accommodation, Shopping, Activities, Others — not
  renamable/deletable. Custom categories: add/rename/delete, names unique.
- **Currency display**: always `CODE amount`, e.g. `SGD 12.50`.
- **Exchange rates**: fixed, manually entered, one per non-trip currency, managed in Settings. Missing
  a rate ⇒ still show per-currency totals and flag converted totals as incomplete; never guess a rate.
- **Budget**: optional, in trip currency; remaining budget only computed when every non-trip currency
  has a rate.
- **Dashboard**: trip summary, total spend, budget/remaining, pie chart by category, last 5
  transactions newest-first, tap-through to view-only detail.

## Next.js 16 gotchas (this version ≠ training data)

- `params`/`searchParams` are Promises — `await` them.
- `PageProps<'/route'>`/`LayoutProps<'/route'>` are globally available generated types — don't
  hand-write prop interfaces.
- Everything under `app/` is a Server Component by default; `localStorage` is client-only, so every
  screen needing it is `'use client'`.
- Never read `localStorage` during render/SSR — read via a client-only pattern
  (`useSyncExternalStore` in this repo, not `useEffect`+`setState`, which trips
  `react-hooks/set-state-in-effect` for a synchronous cascading update).
- Read the relevant guide under `node_modules/next/dist/docs/01-app/` before using an unfamiliar API.

## Design system (design.md) — governs look/behavior, never overrides a spec's functional scenarios

- **Minimal, calm, mobile-first.** Predictability over flair; touch targets ≥44px; no hover-only
  affordances.
- **Color tokens** (CSS custom properties in `app/globals.css`, `@theme inline`): `--background`,
  `--surface`, `--foreground`, `--muted`, `--border`, `--accent` (teal, the one accent color),
  `--danger`, `--warning`, `--success`. Use tokens (`bg-[var(--surface)]` or the canonical
  `bg-(--surface)` form), never hardcoded hex/zinc literals.
- **Typography**: Geist sans + Geist Mono (already wired). Numbers (currency, dates, day counts) use
  `font-mono`. Headings `text-xl`/`text-2xl font-semibold`; body `text-sm`/`text-base`; helper text
  `text-xs text-[var(--muted)]`. Currency format is fixed: `CODE amount`, e.g. `SGD 12.50`.
- **Spacing/shape**: `rounded-lg` for cards/inputs/buttons, `rounded-full` only for pills/badges.
  `gap-2`/`gap-4` inside components, `px-4` page gutters, `max-w-2xl mx-auto` container. Prefer
  `divide-y divide-(--border)` for lists over per-row cards.
- **No icon library installed** — text labels by default; don't add an icon package without asking.
- **Forms**: label above input, helper text present even when empty, error text below the field,
  `role="alert"` for blocking errors, `role="status"` for non-blocking warnings/confirmations,
  `gap-2` per input block.
- **Buttons**: one primary action per screen. Use the shared `globals.css` component classes —
  `btn-primary` (accent fill), `btn-secondary` (outline), `btn-danger` (destructive) — which already
  encode the token colors, `rounded-lg`, 44px min height, and `active:scale-[0.98]` feedback. Do not
  restyle buttons inline.
- **Fields & focus**: base styles in `globals.css` already give inputs/selects/textareas the
  `rounded-lg` surface/border/padding treatment and give every interactive element an accent
  `:focus-visible` ring. Error messages use `role="alert"` (auto-colored `--danger`); non-blocking
  warnings/confirmations use `role="status"` and need an explicit `text-(--warning)` / `text-(--success)`.
- **Empty states**: every list gets a short plain sentence saying what to do next.
- **Errors**: storage failures surface inline in plain language, per `SaveResult`'s contract — never a
  raw exception.
- **Copy tone**: plain, functional sentences; no filler verbs. **No em dash (—) or en-dash-as-separator
  in UI copy** — use a period, comma, or hyphen instead. No fake-precise example numbers.
- **Motion**: CSS `transition-colors`/`transition-transform` on hover/active/focus only. Nothing
  animates on load or scroll.

## Workflow essentials

- Build order (not file order): 012 → 004 → 010 → 015 → 001 → 002 → 003 → 005 → 006 → 011 → 007 → 008
  → 009 → 013 → 014.
- Progress lives in `git log` (`feat(NNN)` prefixes), not a status file.
- `REFERENCE.md` states "if it contradicts the code, the code wins; fix this file in the same change"
  — update its relevant section in the same commit/task that changes the tree, a storage key/public
  API, or a Next.js-version fact it documents.
