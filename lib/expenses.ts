import type { Trip } from "@/lib/types";
import { getSupportedCurrencies } from "@/lib/countries";

export interface ExpenseFormValues {
  amount: string;
  currency: string;
  category: string;
  date: string;
  paymentMethod: string;
  location: string;
  description: string;
}

export const PAYMENT_METHODS: readonly string[] = [
  "Cash",
  "Credit Card",
  "Debit Card",
  "Mobile Payment",
  "Other",
];

export const EXPENSE_SAVED_FLAG_KEY = "travel-expense:expense-saved";

export function getInitialExpenseFormValues(trip: Trip, today: string): ExpenseFormValues {
  return {
    amount: "",
    currency: trip.currency,
    category: "",
    date: today,
    paymentMethod: "",
    location: "",
    description: "",
  };
}

export interface ExpenseValidationResult {
  errors: Partial<Record<keyof ExpenseFormValues, string>>;
  warnings: Partial<Record<keyof ExpenseFormValues, string>>;
}

export function validateExpenseForm(
  values: ExpenseFormValues,
  trip: { startDate: string; endDate: string },
  categoryNames: string[]
): ExpenseValidationResult {
  const errors: ExpenseValidationResult["errors"] = {};
  const warnings: ExpenseValidationResult["warnings"] = {};

  const trimmedAmount = values.amount.trim();
  if (trimmedAmount === "") {
    errors.amount = "Enter an amount.";
  } else {
    const parsed = Number(trimmedAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.amount = "Enter an amount greater than 0.";
    }
  }

  if (!getSupportedCurrencies().includes(values.currency)) {
    errors.currency = "Select a valid currency.";
  }

  if (!categoryNames.includes(values.category)) {
    errors.category = "Select a valid category.";
  }

  if (values.date.trim() === "") {
    errors.date = "Enter a date.";
  } else if (values.date < trip.startDate || values.date > trip.endDate) {
    warnings.date = "This date is outside your trip dates.";
  }

  if (!PAYMENT_METHODS.includes(values.paymentMethod)) {
    errors.paymentMethod = "Select a valid payment method.";
  }

  if (values.location.trim() === "") {
    errors.location = "Enter a location.";
  }

  return { errors, warnings };
}
