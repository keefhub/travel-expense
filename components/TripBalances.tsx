"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
// React 19's types no longer declare a global JSX namespace, so the return type
// below is imported from "react" rather than referenced bare (same reason as
// components/TripSwitcher.tsx).
import type { JSX } from "react";
import type { TripBalancesResult } from "@/lib/types";
import { getSharedTripLink, getJoinedTrips } from "@/lib/storage";
import { findJoinedTrip } from "@/lib/join";
import { fetchTripBalances } from "@/lib/balances";
import type { ParticipantAuth } from "@/lib/participants";

type ResolvedRole =
  | { kind: "creator"; tripId: string; token: string }
  | { kind: "participant"; tripId: string; token: string };

export default function TripBalances({
  token,
}: {
  token: string;
}): JSX.Element | null {
  const router = useRouter();
  const [role, setRole] = useState<ResolvedRole | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">(
    "loading"
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [balances, setBalances] = useState<TripBalancesResult | null>(null);
  const [tripCurrency, setTripCurrency] = useState<string>("");

  useEffect(() => {
    async function load() {
      const sharedLink = getSharedTripLink();
      let resolved: ResolvedRole | null = null;

      if (sharedLink !== null && sharedLink.shareToken === token) {
        resolved = {
          kind: "creator",
          tripId: sharedLink.tripId,
          token: sharedLink.creatorToken,
        };
      } else {
        const joined = findJoinedTrip(getJoinedTrips(), token);
        if (joined !== null) {
          resolved = {
            kind: "participant",
            tripId: joined.tripId,
            token: joined.participantToken,
          };
        }
      }

      if (resolved === null) {
        router.replace("/");
        return;
      }

      setRole(resolved);

      const auth: ParticipantAuth =
        resolved.kind === "creator"
          ? { role: "creator", token: resolved.token }
          : { role: "participant", token: resolved.token };

      const result = await fetchTripBalances(resolved.tripId, auth);

      if (!result.ok) {
        setLoadError(result.error);
        setLoadState("error");
        return;
      }

      setBalances(result.balances);
      setTripCurrency(result.tripCurrency);
      setLoadState("ready");
    }

    load();
  }, [token, router]);

  if (role === null || loadState === "loading") return null;

  if (loadState === "error") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">Balances</h1>
        <p role="alert">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Balances</h1>
      {balances !== null &&
        (balances.isComplete === false ? (
          <p role="status">
            {`Balances are incomplete. Missing a rate for ${balances.missingCurrencies.join(
              ", "
            )}.`}
          </p>
        ) : balances.lines.length === 0 ? (
          <p role="status">Everyone is settled up.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-(--border)">
            {balances.lines.map((line) => (
              <li key={`${line.fromId}-${line.toId}`} className="py-2">
                {`${line.fromName} owes ${line.toName} `}
                <span className="font-mono">
                  {`${tripCurrency} ${line.amount.toFixed(2)}`}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
