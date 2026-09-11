"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Trip } from "@/lib/types";
import { getSupportedCurrencies } from "@/lib/countries";
import { getAllCategories } from "@/lib/categories";
import { getExpenses, saveExpenses } from "@/lib/storage";
import useUnsavedChangesWarning from "@/hooks/useUnsavedChangesWarning";
import {
  getInitialExpenseFormValues,
  validateExpenseForm,
  submitExpense,
  PAYMENT_METHODS,
  EXPENSE_SAVED_FLAG_KEY,
  type ExpenseFormValues,
  type ExpenseValidationResult,
} from "@/lib/expenses";

export default function ExpenseForm({ trip }: { trip: Trip }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState<ExpenseFormValues>(() =>
    getInitialExpenseFormValues(trip, today)
  );
  const [initialValues] = useState(values);
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  useUnsavedChangesWarning(isDirty);
  const [errors, setErrors] = useState<ExpenseValidationResult["errors"]>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const [categories] = useState(() => getAllCategories());
  const categoryNames = categories.map((c) => c.name);
  const dateWarning = validateExpenseForm(values, trip, categoryNames).warnings.date;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = submitExpense(values, trip, categoryNames, {
      getExpenses,
      saveExpenses,
      generateId: () => crypto.randomUUID(),
    });
    if (result.status === "invalid") {
      setErrors(result.errors);
      setSaveError(null);
      return;
    }
    if (result.status === "storage-error") {
      setErrors({});
      setSaveError(result.error);
      return;
    }
    setErrors({});
    setSaveError(null);
    window.sessionStorage.setItem(EXPENSE_SAVED_FLAG_KEY, "1");
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Record an expense</h1>

      <div className="flex flex-col gap-1">
        <label htmlFor="amount">Amount</label>
        <input
          id="amount"
          type="text"
          inputMode="decimal"
          value={values.amount}
          onChange={(e) => setValues({ ...values, amount: e.target.value })}
        />
        {errors.amount && <p role="alert">{errors.amount}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="currency">Currency</label>
        <select
          id="currency"
          value={values.currency}
          onChange={(e) => setValues({ ...values, currency: e.target.value })}
        >
          <option value="">Select a currency</option>
          {getSupportedCurrencies().map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        {errors.currency && <p role="alert">{errors.currency}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="category">Category</label>
        <select
          id="category"
          value={values.category}
          onChange={(e) => setValues({ ...values, category: e.target.value })}
        >
          <option value="">Select a category</option>
          {categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.category && <p role="alert">{errors.category}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="date">Date</label>
        <input
          id="date"
          type="date"
          value={values.date}
          onChange={(e) => setValues({ ...values, date: e.target.value })}
        />
        {errors.date && <p role="alert">{errors.date}</p>}
        {!errors.date && dateWarning && <p role="status">{dateWarning}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="paymentMethod">Payment method</label>
        <select
          id="paymentMethod"
          value={values.paymentMethod}
          onChange={(e) => setValues({ ...values, paymentMethod: e.target.value })}
        >
          <option value="">Select a payment method</option>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        {errors.paymentMethod && <p role="alert">{errors.paymentMethod}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="location">Location</label>
        <input
          id="location"
          type="text"
          value={values.location}
          onChange={(e) => setValues({ ...values, location: e.target.value })}
        />
        {errors.location && <p role="alert">{errors.location}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description">Description (optional)</label>
        <input
          id="description"
          type="text"
          value={values.description}
          onChange={(e) => setValues({ ...values, description: e.target.value })}
        />
      </div>

      {saveError && <p role="alert">{saveError}</p>}

      <button type="submit">Save expense</button>
    </form>
  );
}
