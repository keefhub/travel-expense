import type { Trip, Category, Expense, ExchangeRate } from "@/lib/types";

export const STORAGE_KEYS = {
  trip: "travel-expense:trip",
  expenses: "travel-expense:expenses",
  categories: "travel-expense:categories",
  exchangeRates: "travel-expense:exchange-rates",
} as const;

export type SaveResult = { ok: true } | { ok: false; error: string };

const SAVE_ERROR_MESSAGE = "Your data could not be saved. Local storage may be full or unavailable.";

export function isStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probeKey = "travel-expense:__probe__";
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

function safeGetItem<T>(key: string, fallback: T): T {
  if (!isStorageAvailable()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeSetItem(key: string, value: unknown): SaveResult {
  if (!isStorageAvailable()) return { ok: false, error: SAVE_ERROR_MESSAGE };
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch {
    return { ok: false, error: SAVE_ERROR_MESSAGE };
  }
}

export function getTrip(): Trip | null {
  return safeGetItem<Trip | null>(STORAGE_KEYS.trip, null);
}

export function saveTrip(trip: Trip): SaveResult {
  return safeSetItem(STORAGE_KEYS.trip, trip);
}

export function getCategories(): Category[] {
  return safeGetItem<Category[]>(STORAGE_KEYS.categories, []);
}

export function saveCategories(categories: Category[]): SaveResult {
  return safeSetItem(STORAGE_KEYS.categories, categories);
}

export function getExpenses(): Expense[] {
  return safeGetItem<Expense[]>(STORAGE_KEYS.expenses, []);
}

export function saveExpenses(expenses: Expense[]): SaveResult {
  return safeSetItem(STORAGE_KEYS.expenses, expenses);
}

export function getExchangeRates(): ExchangeRate[] {
  return safeGetItem<ExchangeRate[]>(STORAGE_KEYS.exchangeRates, []);
}

export function saveExchangeRates(rates: ExchangeRate[]): SaveResult {
  return safeSetItem(STORAGE_KEYS.exchangeRates, rates);
}
