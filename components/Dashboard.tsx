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
import Skeleton from "@/components/Skeleton";

/** Shaped like the real dashboard, so the entry point never paints blank on a cold load. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-(--border) bg-(--surface) p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}

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
    <div className="flex flex-col gap-6 p-4">
      {showSavedMessage && (
        <p role="status" className="text-sm text-(--success-text)">
          Expense saved.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Home</h1>
        <p className="text-sm text-(--muted)">
          Trip to {trip.destinationCountry} ({trip.startDate} to {trip.endDate},{" "}
          {durationDays} {durationDays === 1 ? "day" : "days"})
        </p>
        <Link href="/trip/edit" className="link text-sm self-start">
          Edit trip
        </Link>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-(--border) bg-(--surface) p-4">
        <h2 className="text-sm font-medium text-(--muted)">Total spending</h2>
        <p className="font-mono text-2xl font-semibold">
          {trip.currency} {convertedTotals.convertedTotal.toFixed(2)}
        </p>
        {currencyTotals.length > 0 && (
          <ul className="flex flex-col divide-y divide-(--border) text-sm">
            {currencyTotals.map((total) => (
              <li key={total.currency} className="font-mono py-1 text-(--muted)">
                {total.currency} {total.amount.toFixed(2)}
              </li>
            ))}
          </ul>
        )}
        {!convertedTotals.isComplete && (
          <p role="status" className="text-sm text-(--warning-text)">
            Converted total is incomplete. Missing a rate for{" "}
            {convertedTotals.missingCurrencies.join(", ")}.
          </p>
        )}
      </div>

      {trip.budget !== undefined && (
        <div className="flex flex-col gap-1">
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
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">Spending by category</h2>
          <CategoryPieChart categoryTotals={categoryTotals} />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Recent transactions</h2>
        {recentExpenses.length === 0 ? (
          <p className="text-sm text-(--muted)">
            No expenses recorded yet. Add one from the Add Expense tab.
          </p>
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
