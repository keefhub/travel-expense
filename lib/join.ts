import type { SharedTripSummary, JoinedTrip } from "@/lib/types";
import { getJoinedTrips, saveJoinedTrips } from "@/lib/storage";

export type ResolveResult =
  | { ok: true; trip: SharedTripSummary }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "offline" };

export type JoinResult =
  | { ok: true; joined: JoinedTrip; persisted: boolean }
  | { ok: false; error: string };

const FRIENDLY_ERROR =
  "Could not reach the server. Check your connection and try again.";

export function findJoinedTrip(
  joinedTrips: JoinedTrip[],
  token: string
): JoinedTrip | null {
  return joinedTrips.find((trip) => trip.shareToken === token) ?? null;
}

export function validateJoinName(name: string): { error?: string } {
  if (name.trim() === "") {
    return { error: "Enter your name to join." };
  }
  return {};
}

export async function resolveTripByToken(
  token: string
): Promise<ResolveResult> {
  let response: Response;
  try {
    response = await fetch(`/api/join/${token}`);
  } catch {
    return { ok: false, reason: "offline" };
  }

  if (!response.ok) {
    return { ok: false, reason: "not-found" };
  }

  try {
    const trip = (await response.json()) as SharedTripSummary;
    return { ok: true, trip };
  } catch {
    return { ok: false, reason: "not-found" };
  }
}

export async function joinTrip(
  token: string,
  name: string
): Promise<JoinResult> {
  try {
    const response = await fetch(`/api/join/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      return { ok: false, error: FRIENDLY_ERROR };
    }

    const data = (await response.json()) as {
      participantId: string;
      participantToken: string;
      trip: SharedTripSummary;
    };

    const joined: JoinedTrip = {
      tripId: data.trip.id,
      shareToken: token,
      participantId: data.participantId,
      participantToken: data.participantToken,
      participantName: name.trim().slice(0, 50),
      trip: data.trip,
    };

    const saveResult = saveJoinedTrips([...getJoinedTrips(), joined]);

    return { ok: true, joined, persisted: saveResult.ok };
  } catch {
    return { ok: false, error: FRIENDLY_ERROR };
  }
}
