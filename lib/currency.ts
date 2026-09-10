import type { Expense, ExchangeRate } from "@/lib/types";

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

export function validateExchangeRateInput(
  currency: string,
  rateInput: string,
  tripCurrency: string
): { error?: string } {
  if (currency === tripCurrency) {
    return { error: "Exchange rate is not needed for the trip's own currency." };
  }

  const trimmed = rateInput.trim();
  if (trimmed === "") {
    return { error: "Enter an exchange rate." };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { error: "Enter an exchange rate greater than 0." };
  }

  return {};
}

export function setExchangeRate(
  rates: ExchangeRate[],
  currency: string,
  rate: number
): ExchangeRate[] {
  const withoutCurrency = rates.filter((r) => r.currency !== currency);
  return [...withoutCurrency, { currency, rate }];
}
