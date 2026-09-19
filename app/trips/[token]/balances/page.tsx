"use client";

import { use } from "react";
import TripBalances from "@/components/TripBalances";

export default function BalancesPage(
  props: PageProps<"/trips/[token]/balances">
) {
  const { token } = use(props.params);
  return <TripBalances token={token} />;
}
