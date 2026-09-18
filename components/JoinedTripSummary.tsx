"use client";

import Link from "next/link";
import type { JoinedTrip } from "@/lib/types";

export default function JoinedTripSummary({
  joinedTrip,
  storageWarning,
}: {
  joinedTrip: JoinedTrip;
  storageWarning?: string | null;
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">
        {joinedTrip.trip.destinationCountry}
      </h1>
      <p>
        {joinedTrip.trip.startDate} to {joinedTrip.trip.endDate}
      </p>
      <p>Joined as {joinedTrip.participantName}.</p>
      {storageWarning && (
        <p role="status" className="text-sm text-(--warning-text)">
          {storageWarning}
        </p>
      )}
      <Link href="/" className="link self-start">
        Back to home
      </Link>
    </div>
  );
}
