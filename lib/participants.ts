import type { ParticipantSummary } from "@/lib/types";

export type ParticipantAuth =
  | { role: "creator"; token: string }
  | { role: "participant"; token: string };

export type ParticipantsResult =
  | { ok: true; participants: ParticipantSummary[] }
  | { ok: false; error: string };

export type RemoveParticipantResult =
  | { ok: true }
  | { ok: false; error: string };

const FRIENDLY_ERROR =
  "Could not reach the server. Check your connection and try again.";

function authHeaders(auth: ParticipantAuth): Record<string, string> {
  return auth.role === "creator"
    ? { "x-creator-token": auth.token }
    : { "x-participant-token": auth.token };
}

export async function getParticipants(
  tripId: string,
  auth: ParticipantAuth
): Promise<ParticipantsResult> {
  try {
    const response = await fetch(`/api/trips/${tripId}/participants`, {
      headers: authHeaders(auth),
    });

    if (!response.ok) {
      return { ok: false, error: FRIENDLY_ERROR };
    }

    const data = (await response.json()) as {
      participants: ParticipantSummary[];
    };

    return { ok: true, participants: data.participants };
  } catch {
    return { ok: false, error: FRIENDLY_ERROR };
  }
}

export async function removeParticipant(
  tripId: string,
  participantId: string,
  auth: ParticipantAuth
): Promise<RemoveParticipantResult> {
  try {
    const response = await fetch(
      `/api/trips/${tripId}/participants/${participantId}`,
      {
        method: "DELETE",
        headers: authHeaders(auth),
      }
    );

    if (!response.ok) {
      return { ok: false, error: FRIENDLY_ERROR };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: FRIENDLY_ERROR };
  }
}
