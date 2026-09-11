import type { Expense } from "@/lib/types";

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatExpensesAsCsv(expenses: Expense[]): string {
  const header = "Date,Category,Currency,Amount,Payment Method,Location,Description";
  const rows = expenses.map((expense) =>
    [
      expense.date,
      expense.category,
      expense.currency,
      expense.amount.toFixed(2),
      expense.paymentMethod,
      expense.location,
      expense.description ?? "",
    ]
      .map(escapeCsvField)
      .join(",")
  );
  return [header, ...rows].join("\r\n");
}
