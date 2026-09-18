"use client";

import { use } from "react";
import SharedExpenseDetail from "@/components/SharedExpenseDetail";

export default function SharedExpenseDetailPage(
  props: PageProps<"/trips/[token]/expenses/[expenseId]">
) {
  const { token, expenseId } = use(props.params);
  return <SharedExpenseDetail token={token} expenseId={expenseId} />;
}
