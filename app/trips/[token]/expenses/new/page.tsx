"use client";

import { use } from "react";
import SharedExpenseForm from "@/components/SharedExpenseForm";

export default function NewSharedExpensePage(
  props: PageProps<"/trips/[token]/expenses/new">
) {
  const { token } = use(props.params);
  return <SharedExpenseForm token={token} />;
}
