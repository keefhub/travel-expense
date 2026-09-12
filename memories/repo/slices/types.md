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
```

Rules:

- A type change is its own task, landing before any Data/Domain task that consumes it.
- Widening an interface is safe; narrowing one breaks every consumer — check all of `lib/` and
  `components/` before changing a field's type or optionality.
- Persisted shapes: `Trip`, `Category[]`, `Expense[]`, `ExchangeRate[]` are serialized to
  `localStorage` as-is. Adding a required field means old stored data no longer satisfies the type.
  Tolerate missing values on read rather than assuming a migration ran.
