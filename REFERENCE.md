# Repo Reference (for AI agents)

Orientation map for this repo, so an agent does not have to re-scan the tree every session.
Everything here is verified against the working tree as of 2026-08-31 — if it contradicts the
code, the code wins; fix this file in the same change.

**Read order for a new task:** this file → [features/OVERVIEW.md](features/OVERVIEW.md) §1–3 →
[design.md](design.md) (for any task touching UI) → the one `features/NNN.*.md` you are implementing.
Do not read all of `features/` at once.

---

## 1. What this project is

A **mobile-first, offline-capable travel expense tracker**. No backend, no database, no API routes —
**all state lives in browser `localStorage`**. One active trip at a time; creating a new trip deletes
the old one after confirmation. Full product context: [features/OVERVIEW.md](features/OVERVIEW.md) §1–3.
Visual/interaction rules (color, type, spacing, component states): [design.md](design.md).

## 2. Stack (from [package.json](package.json))

| Thing           | Version / choice                                                                                                                                                                                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Framework       | Next.js **16.3.3**, App Router (`app/`)                                                                                                                                                                                                                                                                                                    |
| React           | 19.2.8                                                                                                                                                                                                                                                                                                                                     |
| Language        | TypeScript 5, `strict: true`, `noEmit`                                                                                                                                                                                                                                                                                                     |
| Styling         | Tailwind CSS v4 via `@tailwindcss/postcss` (no `tailwind.config.js` — config is CSS-first)                                                                                                                                                                                                                                                 |
| Lint            | ESLint 9 flat config, `eslint-config-next` (core-web-vitals + typescript)                                                                                                                                                                                                                                                                  |
| Package manager | npm (`package-lock.json`)                                                                                                                                                                                                                                                                                                                  |
| Tests           | **No unit-test runner** — no jest/vitest. `@playwright/test` **is** installed: specs in `e2e/`, run `npx playwright test e2e/<spec>.spec.ts`. Verification = `tsc` + lint always, `build` only for route/config/dependency changes, Playwright for behavior a compiler cannot see. See [.claude/repo-profile.md](.claude/repo-profile.md). |

Runtime deps beyond `next`/`react`/`react-dom` are, as of 016 (in progress): `@neondatabase/serverless`
`1.1.0`, `@prisma/adapter-neon` `7.10.0`, `@prisma/client` `7.10.0` (all exact-pinned, no `^`/`~`
range — `prisma`'s `latest` npm dist-tag currently resolves to an `8.0.0-rc.*` release candidate
while the client packages' `latest` is `7.10.0` stable, so an unpinned install would mismatch
versions). Dev-only: `prisma` `7.10.0`, `dotenv` `17.4.2` (loads `.env.local` for the standalone
`prisma` CLI only — see below). **There is still no chart library, no date library, no form library,
no state manager, no CSV library.** Feature 009 needs a pie chart and 014 needs CSV — hand-rolled;
raise adding any further dependency with the user first, do not silently add packages.

**v2 (016+) adds the first database dependency**, per the above. Shared trips are server-backed —
see §6 "Shared trips" below for the connection model. **Prisma 7 breaking change from training
data**: `schema.prisma`'s `datasource` block no longer accepts a `url` field — the connection string
now lives in a `prisma.config.ts` at the repo root (`datasource: { url: env("DATABASE_URL") }`),
loaded via an explicit `dotenv` call, since Prisma 7's config system does not auto-load any env file
on its own. This file is read only by the standalone `prisma` CLI (`generate`, `migrate`); it is
never imported by the Next.js app. Confirmed against the installed
`node_modules/@prisma/config/dist/index.d.ts` and by a real `prisma generate` failure
(`P1012: The datasource property 'url' is no longer supported in schema files`) against the old
shape. Also note: `@prisma/adapter-neon`'s `PrismaNeon` constructor takes a `neon.PoolConfig` object
(`{ connectionString }`) directly, not a separately-constructed `Pool` instance.

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
  page.tsx        # setup/dashboard decision (001, complete; edit link 002, complete; 009, in progress) — 'use client'; useSyncExternalStore over a per-instance store (createTripStore via useState) reads lib/storage's getTrip() without a hydration mismatch: renders null until determined, components/TripSetupForm.tsx when no trip is saved, else mounts components/Dashboard.tsx passing it the resolved trip; also mounts a second useSyncExternalStore store that reads and clears lib/expenses.ts's EXPENSE_SAVED_FLAG_KEY from sessionStorage on first getSnapshot() and passes the result to Dashboard.tsx as its showSavedMessage prop; a thin trip-gate shell only — all dashboard rendering (trip summary, total spending, per-currency breakdown, budget, spending-by-category chart, recent transactions) lives in components/Dashboard.tsx, not here
  globals.css     # @import "tailwindcss"; :root color vars; @theme inline; prefers-color-scheme dark block
  favicon.ico
  expenses/new/page.tsx  # record-expense route (005, in progress) — 'use client'; useSyncExternalStore over a per-instance store (createTripStore via useState), mirroring app/trip/edit/page.tsx's hydration-safe pattern: renders null until determined, redirects to "/" via router.replace in a useEffect when no trip is saved, else mounts components/ExpenseForm.tsx
  expenses/[id]/page.tsx # view-only expense detail route (009, complete) — this app's first dynamic route segment; 'use client'; unwraps the Promise-based params via React's use() to get id, then useSyncExternalStore over a per-instance store (createExpensesStore via useState) reads lib/storage's getExpenses(): renders null until determined, else finds the expense with that id and shows its full detail (currency/amount, category, date, payment method, location, description — falling back to "No description entered." when absent) with a "Back to home" link, or an "Expense not found." message with the same link when no match exists; linked to from components/Dashboard.tsx's "Recent transactions" rows
  categories/page.tsx    # category-management route (010, complete) — 'use client'; useSyncExternalStore over a per-instance store (createTripStore via useState), mirroring app/settings/page.tsx's and app/trip/edit/page.tsx's hydration-safe pattern: renders null until determined, redirects to "/" via router.replace in a useEffect when no trip is saved, else mounts components/CategoryManager.tsx with no props — trip is read only to gate the redirect, since categories aren't trip-scoped data
  settings/page.tsx      # exchange-rate-settings route (006, complete), reset-app-data route (013, complete), export-expenses route (014, complete), and invite-friends route (016, in progress) — 'use client'; useSyncExternalStore over a per-instance store (createTripStore via useState), mirroring app/trip/edit/page.tsx's hydration-safe pattern: renders null until determined, redirects to "/" via router.replace in a useEffect when no trip is saved, else mounts components/ExchangeRateForm.tsx, components/ShareTripLink.tsx, an "Export expenses" button, and a "Reset app data" trigger button, in that order; the export button reads getExpenses() on click — an empty list sets an `exportMessage` state rendered as a role="status" "You have no expenses to export." paragraph and triggers no download, otherwise it calls a local `downloadExpensesCsv` helper that runs lib/export.ts's formatExpensesAsCsv(getExpenses()) and saves the result as a Blob-based download named expenses.csv (an `<a>` with a `URL.createObjectURL` href, clicked programmatically then revoked); a `confirmingReset` boolean toggles between the normal page and components/ResetAppDataConfirm.tsx, whose onConfirm calls resetAppData() — success navigates home via router.push("/"), failure shows a role="alert" error and stays on the confirm panel — while onCancel just flips confirmingReset back off with no storage write
  trip/edit/page.tsx     # trip edit route (002, complete) — 'use client'; useSyncExternalStore over a per-instance store (createTripStore via useState), mirroring app/page.tsx's hydration-safe pattern: renders null until determined, redirects to "/" via router.replace in a useEffect when no trip is saved, else mounts components/TripEditForm.tsx
  trip/new/page.tsx      # new-trip route (003, complete) — 'use client'; useSyncExternalStore over a per-instance store (createTripStore via useState), mirroring app/trip/edit/page.tsx's hydration-safe pattern: renders null until determined, redirects to "/" via router.replace in a useEffect when no trip is saved, else shows components/NewTripConfirm.tsx first and only after onConfirm renders components/TripSetupForm.tsx wired to a submit closure that adapts lib/trip.ts's submitNewTrip (adding saveExpenses/saveExchangeRates, and — 016, in progress — getSharedTripLink/clearSharedTripLink/deleteSharedTrip, to the deps TripSetupForm already supplies) to TripSetupForm's submit prop signature; both onSaved and onCancel use router.push (not router.replace) to "/" and "/trip/edit" respectively
  api/trips/route.ts     # (016) POST — the app's first Route Handler; creates the server-side Trip snapshot the first time a link is generated: a malformed JSON body responds 400 "Invalid trip data." on its own (kept separate from server-side failures); validates destinationCountry/currency/startDate/endDate are non-empty strings with parseable dates, and budget (if present) is a number — any violation responds 400 "Invalid trip data."; on success generates shareToken/creatorToken via crypto.randomUUID(), db.trip.create()s the row, responds 201 { id, shareToken, creatorToken }; a genuine DB/logic failure is logged via console.error and responds 500 "Could not create the trip."; no auth — nothing exists yet to authenticate against for a trip's first call
  api/trips/[id]/regenerate/route.ts  # (016) POST — creator-authenticated share-token rotation; this app's first dynamic Route Handler segment (params is a Promise, awaited for id, same as the existing app/expenses/[id]/page.tsx dynamic page segment); reads the "x-creator-token" header, 404 "Trip not found." if no Trip row matches id, 403 "Not authorized." if the header is missing or doesn't match the row's creatorToken, otherwise rotates shareToken via crypto.randomUUID() and db.trip.update()s it, responds 200 { shareToken } — creatorToken itself is never rotated or returned; ignores any request body; a genuine DB/logic failure is logged via console.error and responds 500 "Could not regenerate the link."
  api/trips/[id]/route.ts  # (016) DELETE — creator-authenticated teardown, used by the new-trip flow to invalidate the outgoing trip's link; same auth pattern as the sibling regenerate route (x-creator-token header, 404 "Trip not found.", 403 "Not authorized."), then db.trip.delete()s the row and responds 200 { ok: true }; a second DELETE against an already-deleted id correctly 404s rather than succeeding twice; ignores any request body; a genuine DB/logic failure is logged via console.error and responds 500 "Could not delete the trip."
  api/join/[token]/route.ts  # (017, in progress) GET/POST — resolves a share token to public trip fields, or lets a friend join as a named participant; a local, unexported resolveTrip(token) helper (db.trip.findUnique by shareToken) is shared by both verbs so their 404 behavior can't drift apart; GET: not found -> 404 "This link isn't valid.", else 200 with { id, destinationCountry, currency, startDate, endDate } (dates as plain YYYY-MM-DD via .toISOString().slice(0, 10); budget deliberately omitted — never displayed, out of scope); POST: malformed JSON -> 400 "Invalid join request." (checked before the trip lookup), not-found trip -> 404 identical to GET, blank/non-string name -> 400 "Enter your name to join.", otherwise trims and caps the name to 50 characters and db.participant.create()s a row, responding 201 { participantId, participantToken, trip: <same summary shape as GET> }; a genuine DB/logic failure on either verb is logged via console.error and responds 500; no auth — this is a public join endpoint, consistent with there being no participant-side credential system in this feature (see features/017.join-a-shared-trip-via-link.md)
public/           # scaffold SVGs only (next.svg, vercel.svg, file.svg, globe.svg, window.svg)
prisma/schema.prisma  # Trip model (016: id, destinationCountry, currency, startDate, endDate,
                  #   budget, shareToken, creatorToken, createdAt, participants relation);
                  #   Participant model (017, in progress: id, tripId (indexed via @@index —
                  #   Postgres does not auto-index FK columns), trip relation with onDelete:
                  #   Cascade, name, participantToken (unique), createdAt); datasource has no `url`
                  #   field (Prisma 7 — see §2) — the connection string lives in prisma.config.ts
prisma/migrations/    # applied migration history, generated by `prisma migrate dev`
                  #   (20260916041447_init_trip (016), 20260917150532_add_participant and
                  #   20260917151200_add_participant_trip_index (017, in progress))
prisma.config.ts  # (016, in progress) repo-root config the standalone `prisma` CLI reads for the
                  #   connection string (loads .env.local via dotenv); not imported by the app itself
e2e/              # Playwright specs — the behavioral gate for anything tsc cannot see
playwright.config.ts  # testDir ./e2e, baseURL localhost:3000, chromium, webServer runs `npm run dev`
features/         # the specs — OVERVIEW.md + 001..015 (source of truth)
.claude/skills/   # feature-spec, spec-review, writing-plans, sdd, git-commit
.claude/repo-profile.md  # verification commands, behavioral gate, layer slices, known-dirty paths,
                  #   gate risk tiers — the source the pipeline skills cite
doc/              # agent-generated decision trail: doc/features/<NNN>-<slug>/{spec,plan}.md +
                  #   log.txt, and doc/workflow/ for pipeline work. See doc/README.md
output/ .spec-review/   # agent scratch dirs; output/ is gitignored
lib/
  types.ts        # shared domain interfaces: Trip, Category, Expense, ExchangeRate, SharedTripLink (016), SharedTripSummary, JoinedTrip (017, in progress)
  storage.ts      # localStorage persistence layer (012) — trip/category/expense/exchangeRate accessors; resetAppData() (013) clears all six keys; sharedTripLink accessors (016) — the creator device's pointer to its trip's server-side row; joinedTrips accessors (017, in progress) — every shared trip this device has joined, and as which participant
  countries.ts    # fixed country→currency mapping (004) — SUPPORTED_COUNTRIES + getCurrencyForCountry/isSupportedCountry/searchSupportedCountries/getSupportedCurrencies (005 — deduplicated, sorted list of currencies across SUPPORTED_COUNTRIES, for the expense-form currency dropdown)
  categories.ts   # expense categories (010, complete) — DEFAULT_CATEGORIES (frozen), getAllCategories/isDefaultCategoryName, addCategory/renameCategory/deleteCategory (CategoryMutationResult)
  trip.ts         # trip setup domain logic (001, complete) — calculateTripDurationDays, validateTripForm, submitTripSetup (TripFormValues/TripValidationResult/SubmitTripResult), getTripFormValues (002, complete — converts a stored Trip back into TripFormValues for pre-filling the edit form); submitNewTrip (003 — validates, then (016, in progress) if the outgoing trip had a generated share link, best-effort deletes it server-side via the injected deleteSharedTrip and clears the local pointer via clearSharedTripLink, before clearing saved expenses and exchange rates and building/saving a new trip via the same buildAndSaveTrip internals as submitTripSetup — the server delete is fired without awaiting it, since deleteSharedTrip never rejects and submitNewTrip stays fully synchronous); pure, dependency-injected, wired up by components/TripSetupForm.tsx and app/page.tsx
  expenses.ts     # record-expense domain logic (005, in progress) — ExpenseFormValues, PAYMENT_METHODS, EXPENSE_SAVED_FLAG_KEY, getInitialExpenseFormValues(trip, today) (defaults currency to the trip's currency and date to today); mirrors lib/trip.ts's shape, not yet wired to any route; getRecentExpenses(expenses, limit?) (009) returns the newest expenses by date, newest first, defaulting to the last RECENT_EXPENSE_LIMIT (5); EXPENSE_BATCH_SIZE (10) — how many additional transactions a single dashboard "Show more" click reveals
  currency.ts     # multi-currency domain logic (006) — CurrencyTotal, getExpenseTotalsByCurrency(expenses) (sums Expense.amount grouped by Expense.currency into a Map, then returns entries sorted alphabetically by currency code); validateExchangeRateInput(currency, rateInput, tripCurrency) and setExchangeRate(rates, currency, rate) (replaces any existing entry for currency, so at most one rate per currency); getConvertedTotals(totals, tripCurrency, rates) sums each CurrencyTotal into the trip currency (the trip's own currency counts at face value, other currencies are multiplied by their stored ExchangeRate.rate when one exists) and returns ConvertedTotalsResult = { convertedTotal, isComplete, missingCurrencies } (missingCurrencies lists currencies with no stored rate, excluded from convertedTotal; isComplete is true only when that list is empty); getCurrenciesNeedingRates(expenses, tripCurrency) returns the sorted, deduplicated set of non-trip currencies appearing in expenses (including ones that already have a saved rate, so an existing rate can still be found and edited); getRemainingBudget(budget, convertedTotals) (008) returns budget - convertedTotals.convertedTotal when convertedTotals.isComplete, else null; getCategoryTotals(expenses, tripCurrency, rates) (009) mirrors getConvertedTotals's conversion (trip currency at face value, other currencies multiplied by their stored ExchangeRate.rate when one exists, otherwise excluded) but groups by Expense.category instead of by currency, returning CategoryTotalsResult = { categoryTotals, isComplete, missingCurrencies } with categoryTotals sorted by amount descending; not yet wired to any route
  export.ts       # export-expenses domain logic (014, in progress) — formatExpensesAsCsv(expenses) builds a CSV string (header row plus one row per expense, in Date,Category,Currency,Amount,Payment Method,Location,Description order, amount formatted to two decimal places, description blank when absent), with fields individually escaped (RFC 4180: quoted and internal quotes doubled) whenever they contain a comma, quote, or newline; not yet wired to any route
  sharedTrip.ts   # (016, in progress) client-side wrapper around the trip-link API — ShareLinkResult = { ok: true; link: SharedTripLink } | { ok: false; error: string }; buildShareUrl(shareToken) (pure — `${window.location.origin}/join/${shareToken}`); generateShareLink(trip) POSTs to /api/trips, saves the returned SharedTripLink via lib/storage's saveSharedTripLink on success, returns a friendly-error result on any non-2xx/thrown failure without touching storage; regenerateShareLink(link) POSTs to /api/trips/[id]/regenerate with the x-creator-token header, saves the rotated link on success, leaves the existing link untouched on failure; deleteSharedTrip(link) is best-effort — DELETEs /api/trips/[id], never rejects, swallows all failures; not yet wired to any component
  db.ts           # (016, in progress) server-only Prisma client singleton — new PrismaNeon({ connectionString: process.env.DATABASE_URL }) passed as { adapter } to new PrismaClient({ adapter }), cached on globalThis.__prismaClient outside production so next dev's hot-reload doesn't open a new client per edit; construction never throws even when DATABASE_URL is unset (PrismaNeon connects lazily, on first query); imported only by files under app/api/**, mirroring the boundary lib/storage.ts keeps around localStorage
components/
  ShareTripLink.tsx # (016, in progress) invite/generate/regenerate/copy UI — 'use client'; lazily reads getSharedTripLink() once for initial state, then every write goes through lib/sharedTrip.ts's generateShareLink/regenerateShareLink (never calls saveSharedTripLink directly); a useRef in-flight guard (checked/set synchronously before any await, reset in a finally) makes a double-tap on either button produce only one request; no link yet renders an "Invite friends" btn-primary button, a link renders the built share URL (font-mono, break-all) plus a btn-secondary "Copy link" and a btn-text "Generate new link", both disabled while pending; role="alert" errors and a role="status" "Link copied." confirmation mirror components/ExchangeRateForm.tsx's pattern; regenerating clears a stale "copied" confirmation since the string changed; mounted at /settings
  BottomNav.tsx     # mobile-responsive nav (015, complete) — plain Server Component (no 'use client'), four next/link items via exported NAV_ITEMS; wired into app/layout.tsx
  TripSetupForm.tsx # trip setup form UI (001, complete; 003, complete — optional injectable submit prop) — 'use client'; form state over TripFormValues, native <select> of SUPPORTED_COUNTRIES, calls an injectable `submit` prop (defaults to submitTripSetup) and reports via onSaved(trip); rendered by app/page.tsx when no trip is saved, and by app/trip/new/page.tsx (with a submitNewTrip-adapting submit prop) after the new-trip confirmation
  TripEditForm.tsx  # trip edit form UI (002, complete; 003, complete — "Start a new trip" link) — 'use client'; pre-fills TripFormValues from a stored Trip via getTripFormValues, shows live-recalculated travel days and trip currency, calls the same submitTripSetup on submit and router.push("/") after saving, and renders a plain "Start a new trip" next/link to /trip/new as a secondary action after the submit button; mounted at /trip/edit
  NewTripConfirm.tsx # new-trip warning/confirm panel (003, complete) — plain component (no 'use client' needed), takes onConfirm/onCancel props, renders a warning message plus a danger-styled confirm button and a cancel button; mounted at /trip/new, shown before TripSetupForm until the traveller confirms
  ExpenseForm.tsx   # record-expense form UI (005, in progress) — 'use client'; renders all seven ExpenseFormValues fields (amount, currency, category, date, payment method, location, optional description), pre-filled via getInitialExpenseFormValues(trip, today), live-recomputes the trip-period date warning via validateExpenseForm on every render, calls submitExpense on submit and sets EXPENSE_SAVED_FLAG_KEY in sessionStorage before router.push("/"); mirrors TripEditForm.tsx's live-derived-fields pattern; not yet wired to a route; calls useUnsavedChangesWarning(isDirty) (011, in progress), where isDirty compares current values against a useState-captured snapshot of the values it started with; the category list is held in useState(() => getAllCategories()) rather than a one-shot read, so it can be refreshed after a category is added; the category <select>'s first <option> is a "+ Add New" entry (value "__add_new_category__", used only as a stable option value, not compared against); its onChange handler detects that entry by position (e.target.selectedIndex === 0, since it's always rendered first) rather than by value, so a real category can never collide with it even if named the same as the sentinel string — detecting it opens components/AddCategoryModal.tsx instead of writing the selection into values.category, so the controlled <select> always reflects a real (or empty) category, never the sentinel; the modal is rendered as a sibling of the expense <form> (both inside a top-level fragment), never nested inside it, since AddCategoryModal.tsx renders its own internal <form> and nested <form> elements are invalid HTML; on AddCategoryModal's onAdded(name), the component re-reads getAllCategories() into state and sets values.category to the newly added name
  ExchangeRateForm.tsx # exchange-rate management screen (006/007, in progress) — 'use client'; currency <select> built from getCurrenciesNeedingRates(getExpenses(), trip.currency) — the non-trip currencies actually used in recorded expenses — with an early return (placed after all useState calls, to satisfy react-hooks/rules-of-hooks) rendering a "No other currencies recorded yet." message when that set is empty, else mounts a child `RateInput` (defined in the same file) as `<RateInput key={currency} .../>`: keying on currency forces React to unmount/remount RateInput whenever the selected currency changes, so its `rateInput` state — lazily initialized from a getExchangeRates() lookup for that currency (existing rate as a string, else blank) — re-reads fresh on every currency switch with no useEffect involved, letting a previously-entered rate be seen and edited rather than blindly overwritten; RateInput's own submit calls validateExchangeRateInput then setExchangeRate(getExchangeRates(), currency, rate) and saveExchangeRates (fresh storage reads on every submit, not cached in state); a validation or SaveResult error renders role="alert" and preserves rateInput, a successful save keeps rateInput and currency as-is and shows a role="status" "Exchange rate saved." confirmation; mirrors ExpenseForm.tsx's error-preserves-input pattern; mounted at /settings
  CategoryPieChart.tsx # category spending chart (009, in progress) — plain component (no 'use client' needed), takes `categoryTotals: CategoryTotal[]`, computes each category's percentage of the total and renders a `conic-gradient` circle (`role="img"` with an `aria-label` summarizing the breakdown) plus a text legend listing each category's color swatch and percentage; mounted transitively via components/Dashboard.tsx, which app/page.tsx mounts
  Dashboard.tsx     # home dashboard body (009, in progress) — 'use client'; takes `{ trip: Trip, showSavedMessage: boolean }`, does plain synchronous getExpenses()/getExchangeRates() reads (safe here because it is only ever mounted by app/page.tsx after that route's own useSyncExternalStore gate has already resolved), and renders the trip summary (destination/dates/duration, "Edit trip" link), an always-visible "Total spending" section (BR-009-02 — shown even when zero, unlike the prior page.tsx placeholder which hid the whole section), the per-currency breakdown and missing-rate role="status" note, a "Budget" section when trip.budget is set, a "Spending by category" section mounting CategoryPieChart.tsx when any category has spend, and a "Recent transactions" list via lib/expenses.ts's getRecentExpenses with each row linking to /expenses/:id, plus "Show more"/"Show less" controls (009) that expand the list in batches of EXPENSE_BATCH_SIZE (10) up to all expenses and collapse it back to RECENT_EXPENSE_LIMIT (5); absorbs everything previously inlined in app/page.tsx; mounted by app/page.tsx
  ResetAppDataConfirm.tsx # reset-app-data warning/confirm panel (013, in progress) — plain component (no 'use client' needed), takes onConfirm/onCancel props, renders a warning naming what will be deleted (trip, expenses, categories, and exchange rates) plus a danger-styled confirm button and a cancel button, mirroring components/NewTripConfirm.tsx's shape; not yet mounted anywhere
  AddCategoryModal.tsx # add-custom-category modal (010, in progress) — 'use client'; takes onAdded(name)/onCancel props, renders a fixed-position `role="dialog"` overlay (z-50, so it paints above app/layout.tsx's sibling BottomNav) containing a form with a single category-name input; calls lib/categories.ts's addCategory directly on submit, mapping its three failure reasons to an inline role="alert" message ("invalid" → "Enter a category name.", "duplicate" → "This category already exists.", "storage" → the result's own error string) and calling onAdded(name.trim()) on success; mirrors components/ExchangeRateForm.tsx's RateInput pattern (self-contained data entry validated directly against a domain function); not yet mounted anywhere
  CategoryManager.tsx # manage-expense-categories list/rename/delete UI (010, in progress) — 'use client'; lists every category from getAllCategories(), showing no actions for default categories (isDefaultCategoryName) and, for custom ones, an inline Rename (renameCategory) and a direct no-confirmation, danger-styled Delete (deleteCategory); shows a "No custom categories yet." message when there are no custom categories; a successful rename or delete clears any stale error left over from the other mutation; not yet mounted in any route
hooks/
  useUnsavedChangesWarning.ts # unsaved-expense-warning hook (011, in progress) — plain function (no 'use client' needed of its own), registers a window "beforeunload" listener only while its isDirty argument is true, calling event.preventDefault() and setting event.returnValue to prompt the browser's native leave-confirmation on refresh/close; also registers a document-level capture-phase "click" listener (while isDirty) that finds the nearest enclosing same-origin, same-tab anchor via target.closest("a[href]") (skipping middle-click/Ctrl/Cmd/Shift-click and target="_blank"-style anchors so the browser's native new-tab/window gesture is preserved, and skipping anchors whose href resolves to the current pathname), calls preventDefault/stopImmediatePropagation to beat Next.js <Link>'s bubble-phase handler, shows a window.confirm() prompt, and on confirmation sets isDiscardingRef.current before window.location.assign(destination.href) so the still-attached beforeunload listener doesn't also fire a native dialog for that same navigation; not yet wired to any component
```

`/expenses/new` and `/categories` are temporary placeholders (015) — each renders only
a heading and exists so BottomNav's links resolve to real content instead of 404ing; each is replaced
outright by the feature noted next to it in the file tree above. `/trip/edit` (002), `/trip/new`
(003), and `/settings` (006) are real, complete routes, not placeholders. `lib/types.ts`, `lib/storage.ts`, `lib/countries.ts`, `lib/categories.ts`,
`lib/trip.ts`, `lib/expenses.ts`, `lib/currency.ts`, `components/BottomNav.tsx`, `components/TripSetupForm.tsx`, `components/TripEditForm.tsx`,
`components/NewTripConfirm.tsx`, `components/ExchangeRateForm.tsx`, and `components/CategoryPieChart.tsx` are the only other implemented pieces so far.

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

| Topic                                                                          | File                                                                             |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Layouts, pages, routing                                                        | `01-getting-started/03-layouts-and-pages.md`                                     |
| `<Link>` / navigation                                                          | `01-getting-started/04-linking-and-navigating.md`                                |
| Server vs client components                                                    | `01-getting-started/05-server-and-client-components.md`                          |
| CSS / Tailwind                                                                 | `01-getting-started/11-css.md`                                                   |
| Fonts, images, metadata                                                        | `01-getting-started/13-fonts.md`, `12-images.md`, `14-metadata-and-og-images.md` |
| Error handling                                                                 | `01-getting-started/10-error-handling.md`                                        |
| File conventions (`page`/`layout`/`error`/`loading`/`not-found`, route groups) | `03-api-reference/03-file-conventions/`                                          |
| Directives (`use client`, `use server`, `use cache`)                           | `03-api-reference/01-directives/`                                                |

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
- **Shared trips / database connection** (v2, 016+): a shared trip's data lives in **Neon serverless
  Postgres**, accessed via `@neondatabase/serverless` (HTTP-based queries — no persistent TCP socket,
  so it's safe to call from a short-lived serverless function without exhausting a connection limit)
  wrapped by **Prisma** (via `@prisma/adapter-neon`) for schema/migrations and type-safe queries. The
  pooled connection string lives in `DATABASE_URL` (Neon's pgbouncer-fronted pooler endpoint, not the
  direct one) as an env var — never committed, set in the hosting provider's dashboard for prod and
  `.env.local` (gitignored) for dev. A single `lib/db.ts` module owns the Prisma client instance
  (lazily instantiated, reused across invocations within the same warm function); it is imported
  **only** by Route Handlers under `app/api/*` (or Server Actions) — never by a Client Component,
  the same boundary `lib/storage.ts` keeps around `localStorage` today but mirrored for the server
  side. Solo (non-shared) trips never touch this path; they stay on `lib/storage.ts` /
  `localStorage` exactly as in v1. There is **one** database for the whole app (not one per trip) —
  a shared trip is a row, not a provisioned resource; creating one is an `INSERT`, nothing more.
  **Teardown**: the only deletion trigger is the creator starting a new trip — that cascades a
  delete of the outgoing shared trip's rows (trip, expenses, participants), not just its share
  token. No idle-time expiry and no standalone "delete this trip" action exist in v2. See
  [doc/requirements/2026-09-13-shared-trip-expense-tracking.md](doc/requirements/2026-09-13-shared-trip-expense-tracking.md)
  for the full v2 impact analysis.

`lib/storage.ts` public API (feature 012, complete):

- `STORAGE_KEYS` — `{ trip: "travel-expense:trip", expenses: "travel-expense:expenses", categories: "travel-expense:categories", exchangeRates: "travel-expense:exchange-rates", sharedTripLink: "travel-expense:shared-trip-link", joinedTrips: "travel-expense:joined-trips" }`
- `SaveResult` — `{ ok: true } | { ok: false; error: string }`
- `isStorageAvailable(): boolean` — probes `localStorage`; `false` during SSR or when storage is
  unavailable/full.
- `getTrip(): Trip | null` / `saveTrip(trip: Trip): SaveResult`
- `getCategories(): Category[]` / `saveCategories(categories: Category[]): SaveResult`
- `getExpenses(): Expense[]` / `saveExpenses(expenses: Expense[]): SaveResult`
- `getExchangeRates(): ExchangeRate[]` / `saveExchangeRates(rates: ExchangeRate[]): SaveResult`
- `getSharedTripLink(): SharedTripLink | null` / `saveSharedTripLink(link: SharedTripLink): SaveResult`
  (016) — the creator device's pointer to its trip's server-side row once a link has
  been generated: `{ tripId, shareToken, creatorToken }`. `null` until a link exists for the active
  trip. `clearSharedTripLink(): SaveResult` removes it (mirrors `resetAppData`'s try/catch shape).
- `getJoinedTrips(): JoinedTrip[]` / `saveJoinedTrips(trips: JoinedTrip[]): SaveResult` (017, in
  progress) — the joining device's record of every shared trip it has joined and as which
  participant: `{ tripId, shareToken, participantId, participantToken, participantName, trip:
  SharedTripSummary }[]`. Array fallback (`[]`), not `null` — a device can join any number of shared
  trips, distinct from `sharedTripLink`'s single-pointer shape (016 is the creator's own trip; this
  is every trip a device joined as someone else's guest).
- `resetAppData(): SaveResult` — removes all six `STORAGE_KEYS` entries; after a successful call
  every getter returns its empty fallback (`null`/`[]`) exactly as it does for a never-populated key.

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
  011 → 007 → 008 → 009 → 013 → 014 → 016 → 017 → 018 → 019 → 020 → 021 → 022. See the table in
  CLAUDE.md for why. 016 begins the v2 shared-trip initiative (see [doc/requirements/2026-09-13-shared-trip-expense-tracking.md](doc/requirements/2026-09-13-shared-trip-expense-tracking.md)),
  and 022 completes it — all seven v2 slices (016–022) are now authored.
- One feature file = one unit of work; implement all its scenarios together, nothing beyond them.
- Progress lives in `git log` (`feat(NNN)` prefixes), not a status file. Check before starting:
  `git log --oneline --grep="^feat(<NNN>)"`, and read `output/error/{feature}.md` if it exists.
- Commit via the **`/git-commit`** skill only — it owns lint → build → commit, fails closed, and
  logs failures to `output/error/{feature}.md`. Never `--no-verify`, and never silence a failure with
  `@ts-ignore` / `eslint-disable` / deleting the failing code. Max 3 attempts per feature, then stop
  and report.

Other skills: **`/feature-discovery`** (prose requirement → impact analysis and a feature breakdown
in `doc/requirements/`, then one `features/NNN.{slug}.md` per invocation — the only way new feature
files get written), **`/feature-spec`** (deep spec for one feature →
`doc/features/{NNN}-{slug}/spec.md`), **`/spec-review`** (harden an existing spec), and
**`/writing-plans`** (implementation plan → `doc/features/{NNN}-{slug}/plan.md` beside the spec).
All write under the shared `doc/` root; `/feature-discovery` (Mode B), `/feature-spec` and
`/spec-review` handle exactly one feature per invocation.
