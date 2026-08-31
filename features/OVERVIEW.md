# Travel Expense Tracker — Feature Specification

## 1. Product Overview

The Travel Expense Tracker is a mobile-first, browser-responsive web application that helps users track expenses during a trip.

The app stores all data in browser local storage. It does not use a backend service, SQL database, or external database.

The app supports one active trip at a time. When a new trip is created, the previous trip and its related data will be deleted after user confirmation.

---

## 2. Confirmed Requirements

- The app is mainly used on mobile.
- The app must also be responsive on desktop browsers.
- The app is a web app only, not a Progressive Web App.
- Data is stored in browser local storage.
- The app works offline after it has been loaded.
- The app supports one active trip at a time.
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
