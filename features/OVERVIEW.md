# Travel Expense Tracker — Feature Specification

## 1. Product Overview

The Travel Expense Tracker is a mobile-first, browser-responsive web application that helps users track expenses during a trip.

The app stores all data in browser local storage for trips that are not shared. Starting with
feature 16, a trip a creator has generated a shareable link for is instead stored server-side,
backed by an API and a database, so the friends who join it see the same data. A trip that is
never shared stays on local storage exactly as before, with no backend involved.

The app supports one active trip at a time. When a new trip is created, the previous trip and its related data will be deleted after user confirmation.

---

## 2. Confirmed Requirements

- The app is mainly used on mobile.
- The app must also be responsive on desktop browsers.
- The app is a web app only, not a Progressive Web App.
- Data is stored in browser local storage, unless the trip has been shared (see below).
- The app works offline after it has been loaded, for trips that have not been shared.
- The app supports one active trip at a time.
- A trip becomes server-backed the moment its creator generates a shareable link (feature 16);
  an unshared trip remains in local storage exclusively.
- Generating or regenerating a shared trip's link requires connectivity; it is not available offline.
- Only the trip creator can generate or regenerate a shared trip's link.
- Joining a shared trip via link also requires connectivity; it is not available offline.
- Joining a trip is identity-by-device: the joining browser is remembered as that participant for
  that trip, with no login, password, or account system.
- There is no cap on the number of participants who can join a shared trip via one link.
- Participant display names are not required to be unique and are limited to 50 characters.
- A participant who joins via link has no elevated permissions beyond being listed on the trip;
  only the trip creator can edit trip details or manage the share link.
- A user's set of trips is the union of their own solo trip, shared trips they created, and shared
  trips they joined; a trip switcher lets them view and switch between all of these, shown only
  when they belong to more than one trip.
- Creating a new solo trip only replaces the solo trip; it never removes shared-trip memberships.
- Only the trip creator can remove other participants from a shared trip; any non-creator
  participant can leave voluntarily, but the creator cannot leave their own trip.
- Removing or leaving does not rewrite past recorded expenses; they keep the departed
  participant's name, consistent with the deleted-custom-category precedent in §3.
- Shared-trip expenses support attributing a payer and splitting among participants, either
  evenly or by exact amount (no percentage splits in v2); solo trips have no payer/split fields.
- Trip balances (who owes whom) are always shown converted into the trip currency and simplified
  to the minimum number of settlements; they are incomplete if any used currency lacks a rate.
- Either party to a balance can mark it settled (fully or partially) unilaterally; settling
  records that payment happened outside the app and does not move real money.
- Trip setup appears on first launch.
- Users can edit trip details after setup.
- Users can create a new trip, which deletes the existing trip.
- Users select a supported country from a fixed country list.
- The app maps the selected country to the expected trip currency.
- Unsupported countries cannot be selected.
- Travel duration is entered using start date and end date.
- The app calculates and displays the number of travel days.
- Budget is optional.
- Budget is set in the trip currency.
- Expenses can be recorded in currencies other than the trip currency.
- Exchange rates are fixed and manually provided by the user.
- Currency display uses currency codes, for example `SGD 12.50`.
- Dashboard shows:
  - Trip summary
  - Total spend
  - Budget and remaining budget, if budget is provided
  - Pie chart by category
  - Last 5 transactions
- Last 5 transactions are sorted by expense date.
- Users can tap or click a transaction to view details.
- Record expense form requires:
  - Amount
  - Category
  - Date
  - Currency
  - Payment method
  - Location
- Description is optional.
- Expense date defaults to today.
- Future-dated expenses are allowed.
- Receipt or photo attachment is not required.
- After saving an expense, the app shows a success message and redirects to the dashboard.
- If the user has unsaved input on the record expense page, the app warns them before refresh or navigation.
- Unsaved input is discarded on refresh.
- Standard browser refresh warning is acceptable.
- Categories include default categories.
- Default categories are available for selection.
- Users can add custom categories.
- Users can rename and delete custom categories.
- Default categories cannot be renamed or deleted.
- Export is supported.
- Import is not supported.
- Reset app data is supported.
- Local storage errors should show a user-friendly error message.
- The app uses a minimal design style.
- Mobile view should include bottom navigation.

---

## 3. Assumptions to Confirm

The following assumptions are included to complete the feature specification. They should be confirmed before build.

1. Default categories cannot be renamed or deleted.
2. Custom categories can be added, renamed, and deleted.
3. When a custom category is renamed, existing expenses using that category are updated.
4. When a custom category is deleted, existing expenses keep the deleted category name, but the category is removed from future selection.
5. Transaction detail page is view-only unless edit or delete is added later.
6. Payment method is a dropdown with an `Other` option.
7. Location is a free text field.
8. Expenses outside the trip date range are allowed, but the app shows a warning.
9. Exchange rates are managed in a Settings page.
10. Remaining budget is only calculated when all non-trip currencies have exchange rates.
11. Export format is CSV.
12. Country selection uses a fixed dropdown list of supported countries.

---

## 4. Features

Each feature's Gherkin scenarios live in its own file under `features/`:

| # | Feature | File |
|---|---------|------|
| 1 | First-Time Travel Setup | [001.first-time-travel-setup.md](001.first-time-travel-setup.md) |
| 2 | Edit Active Trip | [002.edit-active-trip.md](002.edit-active-trip.md) |
| 3 | Create New Trip | [003.create-new-trip.md](003.create-new-trip.md) |
| 4 | Country and Currency Mapping | [004.country-and-currency-mapping.md](004.country-and-currency-mapping.md) |
| 5 | Record Expense | [005.record-expense.md](005.record-expense.md) |
| 6 | Multi-Currency Expense Tracking | [006.multi-currency-expense-tracking.md](006.multi-currency-expense-tracking.md) |
| 7 | Exchange Rate Management | [007.exchange-rate-management.md](007.exchange-rate-management.md) |
| 8 | Optional Trip Budget | [008.optional-trip-budget.md](008.optional-trip-budget.md) |
| 9 | Home Dashboard | [009.home-dashboard.md](009.home-dashboard.md) |
| 10 | Manage Expense Categories | [010.manage-expense-categories.md](010.manage-expense-categories.md) |
| 11 | Unsaved Expense Warning | [011.unsaved-expense-warning.md](011.unsaved-expense-warning.md) |
| 12 | Local Storage Persistence | [012.local-storage-persistence.md](012.local-storage-persistence.md) |
| 13 | Reset App Data | [013.reset-app-data.md](013.reset-app-data.md) |
| 14 | Export Expenses | [014.export-expenses.md](014.export-expenses.md) |
| 15 | Mobile Responsive Navigation | [015.mobile-responsive-navigation.md](015.mobile-responsive-navigation.md) |
| 16 | Generate Shareable Trip Link | [016.generate-shareable-trip-link.md](016.generate-shareable-trip-link.md) |
| 17 | Join a Shared Trip via Link | [017.join-a-shared-trip-via-link.md](017.join-a-shared-trip-via-link.md) |
| 18 | Switch Between Multiple Trips | [018.switch-between-multiple-trips.md](018.switch-between-multiple-trips.md) |
| 19 | Manage Trip Participants | [019.manage-trip-participants.md](019.manage-trip-participants.md) |
| 20 | Attribute an Expense to Payer and Split | [020.attribute-an-expense-to-payer-and-split.md](020.attribute-an-expense-to-payer-and-split.md) |
| 21 | View Trip Balances | [021.view-trip-balances.md](021.view-trip-balances.md) |
| 22 | Settle Up a Balance | [022.settle-up-a-balance.md](022.settle-up-a-balance.md) |
