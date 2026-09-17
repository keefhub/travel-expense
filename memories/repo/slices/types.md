# Slice — [Types]

`lib/types.ts` holds every shared domain interface. Nothing else belongs here: no functions, no
constants, no storage access.

```ts
export interface Trip {
  destinationCountry: string;
  currency: string;      // derived from country, never chosen directly
  startDate: string;     // ISO yyyy-mm-dd
  endDate: string;
  budget?: number;       // optional, in trip currency
}

export interface Category {
  name: string;
  isDefault: boolean;
}

export interface Expense {
  id: string;
  amount: number;
  currency: string;
  category: string;
  date: string;
  paymentMethod: string;
  location: string;
  description?: string;  // the only optional expense field
}

export interface ExchangeRate {
  currency: string;
  rate: number;
}

// Added 016 — the creator device's pointer to its trip's server-side row, once a
// shareable link has been generated. null until then.
export interface SharedTripLink {
  tripId: string;
  shareToken: string;
  creatorToken: string;
}
```

Rules:

- A type change is its own task, landing before any Data/Domain task that consumes it.
- Widening an interface is safe; narrowing one breaks every consumer — check all of `lib/` and
  `components/` before changing a field's type or optionality.
- Persisted shapes: `Trip`, `Category[]`, `Expense[]`, `ExchangeRate[]`, `SharedTripLink` are
  serialized to `localStorage` as-is. Adding a required field means old stored data no longer
  satisfies the type. Tolerate missing values on read rather than assuming a migration ran.
- Since 016, a *second* kind of storage exists for shared trips: a server-side `Trip` Prisma model
  in Neon Postgres (`prisma/schema.prisma`), reachable only from `app/api/**` via `lib/db.ts` — it
  has its own field shape and is not part of this file. `SharedTripLink` above is the *local*
  pointer to it, not the server row itself.
