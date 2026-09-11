"use client";

import Link from "next/link";
import type { Trip } from "@/lib/types";
import { getExpenses, getExchangeRates } from "@/lib/storage";
import { calculateTripDurationDays } from "@/lib/trip";
import {
  getExpenseTotalsByCurrency,
  getConvertedTotals,
  getRemainingBudget,
  getCategoryTotals,
} from "@/lib/currency";
import { getRecentExpenses } from "@/lib/expenses";
import CategoryPieChart from "@/components/CategoryPieChart";

export default function Dashboard({
  trip,
  showSavedMessage,
}: {
  trip: Trip;
  showSavedMessage: boolean;
}) {
  const durationDays = calculateTripDurationDays(trip.startDate, trip.endDate);

  // Plain synchronous storage reads, not useSyncExternalStore: this component is only ever
  // mounted by app/page.tsx after ITS useSyncExternalStore gate has already resolved past
  // `undefined`/`null`, so there is no server render or hydration pass of Dashboard itself
  // to mismatch. Do not "fix" this with useEffect — that would add a data pop-in flash.
  const expenses = getExpenses();
  const rates = getExchangeRates();
  const currencyTotals = getExpenseTotalsByCurrency(expenses);
  const convertedTotals = getConvertedTotals(currencyTotals, trip.currency, rates);
  const remainingBudget =
    trip.budget !== undefined ? getRemainingBudget(trip.budget, convertedTotals) : null;
  const categoryTotals = getCategoryTotals(expenses, trip.currency, rates).categoryTotals;
  const recentExpenses = getRecentExpenses(expenses);

  return (
    <div className="p-4">
      {showSavedMessage && <p role="status">Expense saved.</p>}
      <h1 className="text-xl font-semibold">Home</h1>
      <p>
        Trip to {trip.destinationCountry} ({trip.startDate} to {trip.endDate},{" "}
        {durationDays} {durationDays === 1 ? "day" : "days"})
      </p>
      <Link href="/trip/edit">Edit trip</Link>

      <div className="flex flex-col gap-1 pt-4">
        <h2 className="text-xl font-semibold">Total spending</h2>
        <p className="font-mono">
          {trip.currency} {convertedTotals.convertedTotal.toFixed(2)}
        </p>
        {currencyTotals.length > 0 && (
          <ul className="flex flex-col divide-y divide-(--border)">
            {currencyTotals.map((total) => (
              <li key={total.currency} className="font-mono py-1">
                {total.currency} {total.amount.toFixed(2)}
              </li>
            ))}
          </ul>
        )}
        {!convertedTotals.isComplete && (
          <p role="status">
            Converted total is incomplete. Missing a rate for{" "}
            {convertedTotals.missingCurrencies.join(", ")}.
          </p>
        )}
      </div>

      {trip.budget !== undefined && (
        <div className="flex flex-col gap-1 pt-4">
          <h2 className="text-xl font-semibold">Budget</h2>
          <p className="font-mono">
            Budget: {trip.currency} {trip.budget.toFixed(2)}
          </p>
          {remainingBudget !== null ? (
            <p className={`font-mono ${remainingBudget < 0 ? "text-(--danger)" : ""}`}>
              Remaining: {trip.currency} {remainingBudget.toFixed(2)}
            </p>
          ) : (
            <p role="status">Remaining budget cannot be fully calculated yet.</p>
          )}
        </div>
      )}

      {categoryTotals.length > 0 && (
        <div className="flex flex-col gap-1 pt-4">
          <h2 className="text-xl font-semibold">Spending by category</h2>
          <CategoryPieChart categoryTotals={categoryTotals} />
        </div>
      )}

      <div className="flex flex-col gap-1 pt-4">
        <h2 className="text-xl font-semibold">Recent transactions</h2>
        {recentExpenses.length === 0 ? (
          <p>No expenses recorded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-(--border)">
            {recentExpenses.map((expense) => (
              <li key={expense.id}>
                <Link
                  href={`/expenses/${expense.id}`}
                  className="flex justify-between gap-2 py-2"
                >
                  <span>
                    {expense.date} · {expense.category}
                  </span>
                  <span className="font-mono">
                    {expense.currency} {expense.amount.toFixed(2)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
