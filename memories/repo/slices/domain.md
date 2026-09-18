# Slice — [Domain]

`lib/<name>.ts` — pure functions only. **No DOM, no `localStorage` access, no `Date.now()`/`new
Date()` for "today"** unless the value is passed in. Domain modules call `lib/storage.ts` for
persistence; they never reach past it.

Existing modules: `countries.ts`, `categories.ts`, `trip.ts`, `expenses.ts`, `currency.ts`,
`export.ts`, `theme.ts`, `sharedTrip.ts` (016 — see below).

## `lib/sharedTrip.ts` (016) — the pattern a new client-wrapper-around-a-server-route module copies

The one existing domain module that is *not* fully pure (it calls `fetch` and `lib/storage.ts`, not
just other pure functions) — this is the accepted shape for a module that wraps a server API for
client use, not an exception to avoid:

```ts
export type ShareLinkResult = { ok: true; link: SharedTripLink } | { ok: false; error: string };

buildShareUrl(shareToken: string): string          // pure: `${window.location.origin}/join/${shareToken}`
generateShareLink(trip: Trip): Promise<ShareLinkResult>       // POST /api/trips
regenerateShareLink(link: SharedTripLink): Promise<ShareLinkResult>  // POST /api/trips/[id]/regenerate
deleteSharedTrip(link: SharedTripLink): Promise<void>         // DELETE /api/trips/[id], best-effort, never rejects
```

Pattern to copy for any sibling module: a thrown `fetch`/non-2xx response becomes a friendly-text
`{ ok: false, error }` result, never a thrown exception out of the module; a successful mutating
call writes through to `lib/storage.ts` itself (the module owns persisting its own result) rather
than making the caller do it; the friendly error text
`"Could not reach the server. Check your connection and try again."` is this repo's one standard
network-failure message — reuse it verbatim in any new client wrapper rather than inventing a new
string.

## Domain facts that cut across features

- **Trip** — destination country (fixed supported list), start/end date, derived travel-days,
  derived currency, optional budget. One active trip only.
- **Country → currency** — fixed supported list; unsupported countries are not selectable; currency
  is derived, never chosen.
- **Expense** — amount, currency, category, date, payment method, location all mandatory;
  description optional. Date defaults to today. Future dates allowed. Dates outside the trip range
  are allowed but warn. Amount must be a positive number.
- **Categories** — defaults are Food, Transport, Accommodation, Shopping, Activities, Others: not
  renamable, not deletable. Custom: add/rename/delete, names unique (case-insensitive). Rename
  rewrites existing expenses; delete leaves existing expenses' category name intact.
- **Currency display** — always `CODE amount`, e.g. `SGD 12.50`.
- **Exchange rates** — fixed, manually entered, one per non-trip currency. Missing a rate ⇒ still
  show per-currency totals and flag converted totals incomplete. **Never guess a rate.**
- **Budget** — optional, in trip currency. Remaining budget computed only when *every* non-trip
  currency has a rate.
- **Export** — CSV only, no import. Columns: date, category, currency, amount, payment method,
  location, description.

Mutation functions return a discriminated result (`{ ok: true } | { ok: false; reason: ... }`), not
a thrown error. Map each `reason` to its own user-facing message at the UI layer.
