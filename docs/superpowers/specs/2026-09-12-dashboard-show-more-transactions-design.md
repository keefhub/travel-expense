# Dashboard: Show More / Show Less Recent Transactions

## Problem

The homepage dashboard's "Recent transactions" section always caps at the 5 most recent
expenses (`RECENT_EXPENSE_LIMIT` in `lib/expenses.ts`), with no way to see older ones from the
dashboard. For an expense recorder, that's a traceability gap — a user reviewing their trip
spending has no path from the dashboard to their full history.

There is currently no "all expenses" list view anywhere in the app (only a single-expense
detail page at `app/expenses/[id]/page.tsx`).

## Decision

Expand the existing list **in place** on the dashboard, rather than linking to a new route.
Reveal additional transactions in batches via a "Show more" control, and allow collapsing back
via "Show less". No new page/route is introduced.

## Behavior

- `components/Dashboard.tsx` holds a `visibleCount` state value, initialized to
  `RECENT_EXPENSE_LIMIT` (5).
- The transaction list renders `getRecentExpenses(expenses, visibleCount)` — this function
  already sorts newest-to-oldest and slices to a limit, so no new sorting logic is needed.
- A new constant, `EXPENSE_BATCH_SIZE = 10`, is added to `lib/expenses.ts`.
- **Show more**: rendered when `visibleCount < expenses.length`. Clicking increases
  `visibleCount` by `EXPENSE_BATCH_SIZE`, capped at `expenses.length`.
- **Show less**: rendered when `visibleCount > RECENT_EXPENSE_LIMIT`. Clicking resets
  `visibleCount` back to `RECENT_EXPENSE_LIMIT`.
- Both controls can render simultaneously (e.g., after one "Show more" click, if more than 10
  remain beyond the initial 5).
- `visibleCount` is component-local state — it resets to 5 on navigation away and back (no
  persistence). This is not user-visible data, so it isn't a `lib/storage` concern.
- No change to the empty state (0 expenses) or the already-covered "fewer than 5" case — no
  buttons render in either case, since there's nothing to expand or collapse.

## Out of scope

- No new route/page for a full expense history list.
- No change to how a single transaction's detail page works.
- No persistence of the expanded/collapsed state across page loads.
- No change to `getRecentExpenses`'s existing signature or sort behavior.

## Spec / test impact

- `features/009.home-dashboard.md` gets one new Gherkin scenario documenting expand/collapse.
  Existing scenarios ("last five transactions", "fewer than five transactions") are unchanged —
  they describe the initial view, which is unaffected.
- A Playwright scenario is needed per this repo's rule that Playwright is the sole behavioral
  gate: seed more than 15 expenses, verify only 5 show initially, click "Show more" and verify
  10 more appear (15 total capped at however many exist), click "Show less" and verify it
  collapses back to 5.
