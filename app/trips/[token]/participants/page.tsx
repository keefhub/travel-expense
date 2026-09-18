"use client";

import { use } from "react";
import ManageParticipants from "@/components/ManageParticipants";

export default function ParticipantsPage(
  props: PageProps<"/trips/[token]/participants">
) {
  const { token } = use(props.params);
  return <ManageParticipants token={token} />;
}
