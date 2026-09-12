"use client";

import { use, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { Expense } from "@/lib/types";
import { getExpenses } from "@/lib/storage";

type ExpensesSnapshot = Expense[] | undefined;

function createExpensesStore() {
  let cached: ExpensesSnapshot;
  let hasRead = false;

  return {
    subscribe(): () => void {
      return () => {};
    },
    getSnapshot(): ExpensesSnapshot {
      if (!hasRead) {
        cached = getExpenses();
        hasRead = true;
      }
      return cached;
    },
    getServerSnapshot(): ExpensesSnapshot {
      return undefined;
    },
  };
}

export default function ExpenseDetailPage(props: PageProps<"/expenses/[id]">) {
  const { id } = use(props.params);
  const [store] = useState(createExpensesStore);
  const expenses = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  if (expenses === undefined) {
    return null;
  }

  const expense = expenses.find((e) => e.id === id);

  if (!expense) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <p>Expense not found.</p>
        <Link href="/" className="link self-start">
          Back to home
        </Link>
      </div>
    );
  }

  const fields: { label: string; value: string; mono?: boolean }[] = [
    { label: "Category", value: expense.category },
    { label: "Date", value: expense.date, mono: true },
    { label: "Payment method", value: expense.paymentMethod },
    { label: "Location", value: expense.location },
    { label: "Description", value: expense.description ?? "No description entered." },
  ];

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Expense details</h1>
        <p className="font-mono text-2xl font-semibold">
          {expense.currency} {expense.amount.toFixed(2)}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-(--border)">
        {fields.map((field) => (
          <li key={field.label} className="flex justify-between gap-4 py-2">
            <span className="shrink-0 text-sm text-(--muted)">{field.label}</span>
            <span className={`min-w-0 text-right break-words ${field.mono ? "font-mono" : ""}`}>
              {field.value}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/" className="link self-start">
        Back to home
      </Link>
    </div>
  );
}
