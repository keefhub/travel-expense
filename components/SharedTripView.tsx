"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { JoinedTrip } from "@/lib/types";
import { getJoinedTrips, saveJoinedTrips } from "@/lib/storage";
import { resolveTripByToken, findJoinedTrip } from "@/lib/join";
import JoinedTripSummary from "@/components/JoinedTripSummary";

type ViewState =
  | { status: "loading" }
  | { status: "offline" }
  | { status: "gone" }
  | { status: "found"; joinedTrip: JoinedTrip };

export default function SharedTripView({ token }: { token: string }) {
  const router = useRouter();
  const [state, setState] = useState<ViewState>({ status: "loading" });

  useEffect(() => {
    async function loadTrip() {
      const result = await resolveTripByToken(token);

      if (!result.ok) {
        if (result.reason === "offline") {
          setState({ status: "offline" });
          return;
        }

        saveJoinedTrips(
          getJoinedTrips().filter((trip) => trip.shareToken !== token)
        );
        setState({ status: "gone" });
        return;
      }

      const local = findJoinedTrip(getJoinedTrips(), token);
      if (local === null) {
        router.replace("/");
        return;
      }

      const updated: JoinedTrip = { ...local, trip: result.trip };
      saveJoinedTrips(
        getJoinedTrips().map((trip) =>
          trip.shareToken === token ? updated : trip
        )
      );
      setState({ status: "found", joinedTrip: updated });
    }

    loadTrip();
  }, [token, router]);

  if (state.status === "loading") {
    return null;
  }

  if (state.status === "offline") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">Trip</h1>
        <p>
          Viewing this trip requires an internet connection. Check your
          connection and try again.
        </p>
      </div>
    );
  }

  if (state.status === "gone") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">Trip</h1>
        <p>This trip is no longer available.</p>
        <Link href="/" className="link self-start">
          Back to home
        </Link>
      </div>
    );
  }

  return <JoinedTripSummary joinedTrip={state.joinedTrip} />;
}
