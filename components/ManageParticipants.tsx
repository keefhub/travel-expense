"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
// React 19's types no longer declare a global JSX namespace, so the return type
// below is imported from "react" rather than referenced bare (same reason as
// components/TripSwitcher.tsx).
import type { JSX } from "react";
import type { ParticipantSummary } from "@/lib/types";
import { getSharedTripLink, getJoinedTrips, saveJoinedTrips } from "@/lib/storage";
import { findJoinedTrip } from "@/lib/join";
import { getParticipants, removeParticipant } from "@/lib/participants";
import type { ParticipantAuth } from "@/lib/participants";
import ConfirmParticipantAction from "@/components/ConfirmParticipantAction";

type ResolvedRole =
  | { kind: "creator"; tripId: string; token: string }
  | {
      kind: "participant";
      tripId: string;
      token: string;
      myParticipantId: string;
    };

export default function ManageParticipants({
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
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [confirmTarget, setConfirmTarget] = useState<{
    id: string;
    name: string;
    actionLabel: "Remove" | "Leave";
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    async function loadParticipants() {
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
            myParticipantId: joined.participantId,
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

      const result = await getParticipants(resolved.tripId, auth);

      if (!result.ok) {
        setLoadError(result.error);
        setLoadState("error");
        return;
      }

      setParticipants(result.participants);
      setLoadState("ready");
    }

    loadParticipants();
  }, [token, router]);

  async function handleConfirm() {
    if (role === null || confirmTarget === null) return;

    const auth: ParticipantAuth =
      role.kind === "creator"
        ? { role: "creator", token: role.token }
        : { role: "participant", token: role.token };

    const result = await removeParticipant(role.tripId, confirmTarget.id, auth);

    if (!result.ok) {
      setActionError(result.error);
      setConfirmTarget(null);
      return;
    }

    setActionError(null);

    const removedId = confirmTarget.id;
    setParticipants((prev) => prev.filter((p) => p.id !== removedId));
    setConfirmTarget(null);

    if (role.kind === "participant" && removedId === role.myParticipantId) {
      saveJoinedTrips(
        getJoinedTrips().filter((jt) => jt.shareToken !== token)
      );
      router.push("/");
    }
  }

  if (role === null || loadState === "loading") return null;

  if (loadState === "error") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">Participants</h1>
        <p role="alert">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Participants</h1>
      {actionError && <p role="alert">{actionError}</p>}
      <ul className="flex flex-col divide-y divide-(--border)">
        <li className="flex items-center justify-between gap-2 py-2">
          <span>Trip creator</span>
        </li>
        {participants.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 py-2">
            <span>{p.name}</span>
            {role.kind === "creator" && (
              <button
                type="button"
                className="btn-text danger"
                onClick={() =>
                  setConfirmTarget({ id: p.id, name: p.name, actionLabel: "Remove" })
                }
              >
                Remove
              </button>
            )}
            {role.kind === "participant" && role.myParticipantId === p.id && (
              <button
                type="button"
                className="btn-text danger"
                onClick={() =>
                  setConfirmTarget({ id: p.id, name: p.name, actionLabel: "Leave" })
                }
              >
                Leave
              </button>
            )}
          </li>
        ))}
      </ul>
      {confirmTarget && (
        <ConfirmParticipantAction
          actionLabel={confirmTarget.actionLabel}
          participantName={confirmTarget.name}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
