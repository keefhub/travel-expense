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
  if (currency === "") {
    return { error: "Select a currency." };
  }

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

export interface ConvertedTotalsResult {
  convertedTotal: number;
  isComplete: boolean;
  missingCurrencies: string[];
}

export function getConvertedTotals(
  totals: CurrencyTotal[],
  tripCurrency: string,
  rates: ExchangeRate[]
): ConvertedTotalsResult {
  let convertedTotal = 0;
  const missingCurrencies: string[] = [];

  for (const total of totals) {
    if (total.currency === tripCurrency) {
      convertedTotal += total.amount;
      continue;
    }

    const rate = rates.find((r) => r.currency === total.currency);
    if (rate === undefined) {
      missingCurrencies.push(total.currency);
      continue;
    }

    convertedTotal += total.amount * rate.rate;
  }

  return { convertedTotal, isComplete: missingCurrencies.length === 0, missingCurrencies };
}

export function getRemainingBudget(
  budget: number,
  convertedTotals: ConvertedTotalsResult
): number | null {
  return convertedTotals.isComplete ? budget - convertedTotals.convertedTotal : null;
}

// Despite the name, this returns every non-trip currency in use, including ones that
// already have a saved rate — the currency selector needs the full in-use set so an
// existing rate can still be found and edited (BR-007-05/06), not just currencies that
// are still missing one. Named for its primary purpose (surfacing what needs attention),
// not as a promise to exclude already-rated currencies.
export function getCurrenciesNeedingRates(expenses: Expense[], tripCurrency: string): string[] {
  const currencies = new Set(expenses.map((e) => e.currency));
  currencies.delete(tripCurrency);
  return Array.from(currencies).sort();
}
