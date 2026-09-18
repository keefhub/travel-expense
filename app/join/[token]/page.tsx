"use client";

import { use } from "react";
import JoinTrip from "@/components/JoinTrip";

export default function JoinPage(props: PageProps<"/join/[token]">) {
  const { token } = use(props.params);
  return <JoinTrip token={token} />;
}
