# Repo Reference (for AI agents)

Orientation map for this repo, so an agent does not have to re-scan the tree every session.
Everything here is verified against the working tree as of 2026-08-31 — if it contradicts the
code, the code wins; fix this file in the same change.

**Read order for a new task:** this file → [features/OVERVIEW.md](features/OVERVIEW.md) §1–3 →
the one `features/NNN.*.md` you are implementing. Do not read all of `features/` at once.

---

## 1. What this project is

A **mobile-first, offline-capable travel expense tracker**. No backend, no database, no API routes —
**all state lives in browser `localStorage`**. One active trip at a time; creating a new trip deletes
the old one after confirmation. Full product context: [features/OVERVIEW.md](features/OVERVIEW.md) §1–3.

## 2. Stack (from [package.json](package.json))

| Thing | Version / choice |
|---|---|
| Framework | Next.js **16.3.3**, App Router (`app/`) |
| React | 19.2.8 |
| Language | TypeScript 5, `strict: true`, `noEmit` |
| Styling | Tailwind CSS v4 via `@tailwindcss/postcss` (no `tailwind.config.js` — config is CSS-first) |
| Lint | ESLint 9 flat config, `eslint-config-next` (core-web-vitals + typescript) |
| Package manager | npm (`package-lock.json`) |
| Tests | **none installed** — no jest/vitest/playwright. Verification = lint + build. |

Runtime deps are only `next`, `react`, `react-dom`. **There is no chart library, no date library, no
form library, no state manager, no CSV library.** Feature 009 needs a pie chart and 014 needs CSV —
hand-roll them or raise adding a dependency with the user first; do not silently add packages.

## 3. Commands

```bash
npm run dev     # next dev
npm run build   # next build — this is also the type-check gate
npm run lint    # eslint (flat config, no args/paths)
npm start       # next start
```

There is no separate `typecheck` script; `npm run build` is what catches type errors.

## 4. Current file layout

```
app/
  layout.tsx      # root layout: Geist + Geist_Mono via next/font/google, html.h-full, body.min-h-full flex flex-col; wraps children in a max-w-2xl pb-20 div and renders BottomNav after it (015)
  page.tsx        # setup/dashboard decision (001, complete; edit link 002, complete) — 'use client'; useSyncExternalStore over a per-instance store (createTripStore via useState) reads lib/storage's getTrip() without a hydration mismatch: renders null until determined, TripSetupForm when no trip is saved, else a placeholder trip summary with an "Edit trip" link to /trip/edit; placeholder replaced by feature 009 (home dashboard)
  globals.css     # @import "tailwindcss"; :root color vars; @theme inline; prefers-color-scheme dark block
  favicon.ico
  expenses/new/page.tsx  # placeholder (015) — single <h1>Add Expense</h1>; replaced by feature 005 (record-expense)
  categories/page.tsx    # placeholder (015) — single <h1>Categories</h1>; replaced by the (unassigned) category-management UI feature — see doc/spec/010.manage-expense-categories.md §7 Open Question 1
  settings/page.tsx      # placeholder (015) — single <h1>Settings</h1>; replaced by feature 007 (exchange-rate management)
  trip/edit/page.tsx     # trip edit route (002, complete) — 'use client'; useSyncExternalStore over a per-instance store (createTripStore via useState), mirroring app/page.tsx's hydration-safe pattern: renders null until determined, redirects to "/" via router.replace in a useEffect when no trip is saved, else mounts components/TripEditForm.tsx
  trip/new/page.tsx      # new-trip route (003, complete) — 'use client'; useSyncExternalStore over a per-instance store (createTripStore via useState), mirroring app/trip/edit/page.tsx's hydration-safe pattern: renders null until determined, redirects to "/" via router.replace in a useEffect when no trip is saved, else shows components/NewTripConfirm.tsx first and only after onConfirm renders components/TripSetupForm.tsx wired to a submit closure that adapts lib/trip.ts's submitNewTrip (adding saveExpenses/saveExchangeRates to the deps TripSetupForm already supplies) to TripSetupForm's submit prop signature; both onSaved and onCancel use router.push (not router.replace) to "/" and "/trip/edit" respectively
public/           # scaffold SVGs only (next.svg, vercel.svg, file.svg, globe.svg, window.svg)
features/         # the specs — OVERVIEW.md + 001..015 (source of truth)
.claude/skills/   # feature-spec, spec-review, writing-plans, git-commit
doc/              # agent-generated artifacts: doc/spec/ (specs), doc/plans/ (standalone plans)
output/ .spec-review/   # agent scratch dirs; output/ is gitignored
lib/
  types.ts        # shared domain interfaces: Trip, Category, Expense, ExchangeRate
  storage.ts      # localStorage persistence layer (012) — trip/category/expense/exchangeRate accessors
  countries.ts    # fixed country→currency mapping (004) — SUPPORTED_COUNTRIES + getCurrencyForCountry/isSupportedCountry/searchSupportedCountries/getSupportedCurrencies (005 — deduplicated, sorted list of currencies across SUPPORTED_COUNTRIES, for the expense-form currency dropdown)
  categories.ts   # expense categories (010, complete) — DEFAULT_CATEGORIES (frozen), getAllCategories/isDefaultCategoryName, addCategory/renameCategory/deleteCategory (CategoryMutationResult)
  trip.ts         # trip setup domain logic (001, complete) — calculateTripDurationDays, validateTripForm, submitTripSetup (TripFormValues/TripValidationResult/SubmitTripResult), getTripFormValues (002, complete — converts a stored Trip back into TripFormValues for pre-filling the edit form); submitNewTrip (003 — validates, clears saved expenses and exchange rates, then builds and saves a new trip via the same buildAndSaveTrip internals as submitTripSetup); pure, dependency-injected, wired up by components/TripSetupForm.tsx and app/page.tsx
components/
  BottomNav.tsx     # mobile-responsive nav (015, complete) — plain Server Component (no 'use client'), four next/link items via exported NAV_ITEMS; wired into app/layout.tsx
  TripSetupForm.tsx # trip setup form UI (001, complete; 003, complete — optional injectable submit prop) — 'use client'; form state over TripFormValues, native <select> of SUPPORTED_COUNTRIES, calls an injectable `submit` prop (defaults to submitTripSetup) and reports via onSaved(trip); rendered by app/page.tsx when no trip is saved, and by app/trip/new/page.tsx (with a submitNewTrip-adapting submit prop) after the new-trip confirmation
  TripEditForm.tsx  # trip edit form UI (002, complete; 003, complete — "Start a new trip" link) — 'use client'; pre-fills TripFormValues from a stored Trip via getTripFormValues, shows live-recalculated travel days and trip currency, calls the same submitTripSetup on submit and router.push("/") after saving, and renders a plain "Start a new trip" next/link to /trip/new as a secondary action after the submit button; mounted at /trip/edit
  NewTripConfirm.tsx # new-trip warning/confirm panel (003, complete) — plain component (no 'use client' needed), takes onConfirm/onCancel props, renders a warning message plus a danger-styled confirm button and a cancel button; mounted at /trip/new, shown before TripSetupForm until the traveller confirms
```

`/expenses/new`, `/categories`, and `/settings` are temporary placeholders (015) — each renders only
a heading and exists so BottomNav's links resolve to real content instead of 404ing; each is replaced
outright by the feature noted next to it in the file tree above. `/trip/edit` (002) and `/trip/new`
(003) are real, complete routes, not placeholders. `lib/types.ts`, `lib/storage.ts`, `lib/countries.ts`, `lib/categories.ts`,
`lib/trip.ts`, `components/BottomNav.tsx`, `components/TripSetupForm.tsx`, `components/TripEditForm.tsx`,
and `components/NewTripConfirm.tsx` are the only other implemented pieces so far.

- Path alias: `@/*` → repo root ([tsconfig.json](tsconfig.json)), e.g. `@/lib/storage`.
- Git default branch for PRs is `main`; work currently sits on `master`.

## 5. Next.js 16 gotchas (this version ≠ your training data)

Per [AGENTS.md](AGENTS.md), read the relevant file under `node_modules/next/dist/docs/` before using
an API you are unsure of. Confirmed facts for this version:

- `params` and `searchParams` are **Promises** — `await props.params`. Synchronous access is gone.
- `PageProps<'/route'>` and `LayoutProps<'/route'>` are **globally available** generated types — do
  not import them, and do not hand-write prop interfaces. [app/layout.tsx](app/layout.tsx) already
  uses `LayoutProps<"/">`.
- Everything under `app/` is a Server Component by default. `localStorage` is client-only, so every
  screen in this app is effectively a `'use client'` island — put the directive at the top of the
  file, above imports, and keep the boundary as low in the tree as practical.
- Never read `localStorage` during render/SSR; read it in `useEffect` (or a client-only hook) and
  render a loading/empty state on first paint, or hydration will mismatch.

Doc pointers (all under `node_modules/next/dist/docs/01-app/`):

| Topic | File |
|---|---|
| Layouts, pages, routing | `01-getting-started/03-layouts-and-pages.md` |
| `<Link>` / navigation | `01-getting-started/04-linking-and-navigating.md` |
| Server vs client components | `01-getting-started/05-server-and-client-components.md` |
| CSS / Tailwind | `01-getting-started/11-css.md` |
| Fonts, images, metadata | `01-getting-started/13-fonts.md`, `12-images.md`, `14-metadata-and-og-images.md` |
| Error handling | `01-getting-started/10-error-handling.md` |
| File conventions (`page`/`layout`/`error`/`loading`/`not-found`, route groups) | `03-api-reference/03-file-conventions/` |
| Directives (`use client`, `use server`, `use cache`) | `03-api-reference/01-directives/` |

> The "This is NOT the Next.js you know" block in [AGENTS.md](AGENTS.md) is **generated by `next dev`**.
> If it reappears as an uncommitted diff, commit it with your work — deleting it just re-creates it.

## 6. Domain facts that cut across features

Pulled from the specs so you do not have to open every file. The cited feature file is authoritative.

- **Trip** (001, 002): destination country (fixed supported list), start date, end date, derived
  travel-days count, derived trip currency (from country), optional budget. One active trip only.
- **Country → currency** (004): fixed supported list; unsupported countries must not be selectable;
  currency is derived, never chosen directly.
- **Expense** (005): amount, currency, category, date, payment method, location — all mandatory;
  description optional. Date defaults to today. Future dates allowed. Dates outside the trip range
  are allowed but warn. Amount must be a positive number.
- **Categories** (010): defaults are **Food, Transport, Accommodation, Shopping, Activities, Others** —
  not renamable, not deletable. Custom categories: add/rename/delete, names unique. Rename rewrites
  existing expenses; delete leaves existing expenses' category name intact.
- **Currency display** (OVERVIEW): always `CODE amount`, e.g. `SGD 12.50`.
- **Exchange rates** (006, 007): fixed, manually entered by the user, one per non-trip currency,
  managed in Settings. Missing a rate ⇒ still show per-currency totals and flag converted totals as
  incomplete; never guess a rate.
- **Budget** (008): optional, in trip currency; remaining budget only computed when **every**
  non-trip currency has a rate.
- **Dashboard** (009): trip summary, total spend, budget/remaining (if set), pie chart by category,
  last 5 transactions sorted by expense date newest-first, tap-through to a view-only detail.
- **Navigation** (015): mobile bottom nav with **Home, Add Expense, Categories, Settings**; responsive
  on desktop. This is the app shell every page renders inside.
- **Persistence** (012): trip, expenses, categories, exchange rates all persist to `localStorage`;
  storage unavailable/full must surface a friendly error, not a crash. Wrap every read/write in
  try/catch and tolerate a missing or corrupt value.
- **Reset** (013): clears trip, expenses, categories, budget, rates, then returns to setup.
- **Export** (014): CSV only, no import; columns = date, category, currency, amount, payment method,
  location, description. Empty state = "no expenses to export" message.
- **Unsaved-input warning** (011): standard `beforeunload` browser warning on the record-expense page
  when the form is dirty; in-app navigation warns too; input is discarded on refresh.

`lib/storage.ts` public API (feature 012, complete):

- `STORAGE_KEYS` — `{ trip: "travel-expense:trip", expenses: "travel-expense:expenses", categories: "travel-expense:categories", exchangeRates: "travel-expense:exchange-rates" }`
- `SaveResult` — `{ ok: true } | { ok: false; error: string }`
- `isStorageAvailable(): boolean` — probes `localStorage`; `false` during SSR or when storage is
  unavailable/full.
- `getTrip(): Trip | null` / `saveTrip(trip: Trip): SaveResult`
- `getCategories(): Category[]` / `saveCategories(categories: Category[]): SaveResult`
- `getExpenses(): Expense[]` / `saveExpenses(expenses: Expense[]): SaveResult`
- `getExchangeRates(): ExchangeRate[]` / `saveExchangeRates(rates: ExchangeRate[]): SaveResult`

All getters return a safe fallback (`null` or `[]`) on SSR, a missing key, or corrupt/unparseable
JSON. All setters catch write failures (quota exceeded, storage unavailable) and return
`{ ok: false, error: "Your data could not be saved. Local storage may be full or unavailable." }`
instead of throwing.

`lib/categories.ts` public API (feature 010, complete) — the category-management layer built on
`lib/storage.ts`'s `getCategories`/`saveCategories`/`getExpenses`/`saveExpenses`:

- `CategoryMutationResult` — `{ ok: true } | { ok: false; reason: "invalid" | "duplicate" | "default" | "not-found" } | { ok: false; reason: "storage"; error: string }`
- `DEFAULT_CATEGORIES: readonly Category[]` — frozen; `{ name, isDefault: true }` for Food, Transport,
  Accommodation, Shopping, Activities, Others.
- `getAllCategories(): Category[]` — fresh copies of the defaults followed by custom categories from
  storage; safe to mutate the returned array/objects without affecting later calls.
- `isDefaultCategoryName(name): boolean` — case-insensitive match against `DEFAULT_CATEGORIES`.
- `addCategory(name): CategoryMutationResult` — trims; rejects empty (`"invalid"`) and case-insensitive
  duplicates across defaults + custom (`"duplicate"`).
- `renameCategory(oldName, newName): CategoryMutationResult` — rejects defaults (`"default"`), unknown
  `oldName` (`"not-found"`), empty `newName` (`"invalid"`), and duplicates (`"duplicate"`). Writes the
  expense cascade (renames matching expenses' `category`) **before** the category list, so a failure
  between the two writes leaves `oldName` findable for a clean retry.
- `deleteCategory(name): CategoryMutationResult` — rejects defaults (`"default"`) and unknown names
  (`"not-found"`); removes only the category entry and deliberately never touches expenses — an
  expense's `category` is a plain string, not a reference, so existing expenses keep the deleted name.

## 7. Workflow (short version)

Full rules live in [CLAUDE.md](CLAUDE.md) — this is a summary, not a replacement.

- Build order is **not** file order. It is: 012 → 004 → 010 → 015 → 001 → 002 → 003 → 005 → 006 →
  011 → 007 → 008 → 009 → 013 → 014. See the table in CLAUDE.md for why.
- One feature file = one unit of work; implement all its scenarios together, nothing beyond them.
- Progress lives in `git log` (`feat(NNN)` prefixes), not a status file. Check before starting:
  `git log --oneline --grep="^feat(<NNN>)"`, and read `output/error/{feature}.md` if it exists.
- Commit via the **`/git-commit`** skill only — it owns lint → build → commit, fails closed, and
  logs failures to `output/error/{feature}.md`. Never `--no-verify`, and never silence a failure with
  `@ts-ignore` / `eslint-disable` / deleting the failing code. Max 3 attempts per feature, then stop
  and report.

Other skills: **`/feature-spec`** (deep spec for one feature → `doc/spec/{feature}.md`),
**`/spec-review`** (harden an existing spec), and **`/writing-plans`** (implementation plan →
`doc/spec/{feature}.plan.md` beside the spec, or `doc/plans/{NNN}-{feature}/plan.md` with no spec).
All three write under the shared `doc/` root; `/feature-spec` and `/spec-review` handle exactly one
feature per invocation.
