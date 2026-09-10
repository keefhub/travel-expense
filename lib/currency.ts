import type { Expense } from "@/lib/types";

export interface CurrencyTotal {
  currency: string;
  amount: number;
}

export function getExpenseTotalsByCurrency(expenses: Expense[]): CurrencyTotal[] {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    totals.set(expense.currency, (totals.get(expense.currency) ?? 0) + expense.amount);
  }
  return Array.from(totals.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
