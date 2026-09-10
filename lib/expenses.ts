import type { Trip } from "@/lib/types";

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
