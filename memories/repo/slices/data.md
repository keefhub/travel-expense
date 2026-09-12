# Slice — [Data]

`lib/storage.ts` is the whole data layer. No other file may touch `localStorage` directly.

```ts
STORAGE_KEYS = {
  trip:          "travel-expense:trip",
  expenses:      "travel-expense:expenses",
  categories:    "travel-expense:categories",
  exchangeRates: "travel-expense:exchange-rates",
}

type SaveResult = { ok: true } | { ok: false; error: string }

isStorageAvailable(): boolean   // false during SSR, or storage unavailable/full
getTrip(): Trip | null          / saveTrip(trip): SaveResult
getCategories(): Category[]     / saveCategories(categories): SaveResult
getExpenses(): Expense[]        / saveExpenses(expenses): SaveResult
getExchangeRates(): ExchangeRate[] / saveExchangeRates(rates): SaveResult
resetAppData(): SaveResult      // removes all four keys
```

Contract every function here honors:

- **Getters never throw.** Wrap read + `JSON.parse` in try/catch and return the empty fallback
  (`null` / `[]`) for missing, corrupt, or SSR-time reads. A corrupt value behaves exactly like a
  never-populated one.
- **Setters never throw.** Catch write failures (quota, private mode) and return
  `{ ok: false, error }` with a friendly, user-showable message — never a raw exception.
- After a successful `resetAppData()`, every getter returns its empty fallback.

Rules:

- A new storage key or a change to any signature above is a **module-boundary change**: record it in
  `REFERENCE.md` §6 in the same commit, and it gets two review gates.
- Callers branch on `result.ok`; they never assume a write succeeded.
- Multi-write operations order their writes so a partial failure stays recoverable — e.g. a category
  rename writes the expense cascade *before* the category list, so a retry can still find the old
  name.
