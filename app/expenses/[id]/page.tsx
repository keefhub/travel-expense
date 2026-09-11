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
      <div className="p-4 flex flex-col gap-2">
        <p>Expense not found.</p>
        <Link href="/">Back to home</Link>
      </div>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-2">
      <h1 className="text-xl font-semibold">Expense details</h1>
      <p className="font-mono">
        {expense.currency} {expense.amount.toFixed(2)}
      </p>
      <p>Category: {expense.category}</p>
      <p className="font-mono">Date: {expense.date}</p>
      <p>Payment method: {expense.paymentMethod}</p>
      <p>Location: {expense.location}</p>
      <p>Description: {expense.description ?? "No description entered."}</p>
      <Link href="/">Back to home</Link>
    </div>
  );
}
