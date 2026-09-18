"use client";

import { use } from "react";
import SharedTripView from "@/components/SharedTripView";

export default function TripPage(props: PageProps<"/trips/[token]">) {
  const { token } = use(props.params);
  return <SharedTripView token={token} />;
}
