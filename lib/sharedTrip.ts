import type { Trip, SharedTripLink } from "@/lib/types";
import { saveSharedTripLink } from "@/lib/storage";

export type ShareLinkResult =
  | { ok: true; link: SharedTripLink }
  | { ok: false; error: string };

const FRIENDLY_ERROR =
  "Could not reach the server. Check your connection and try again.";

export function buildShareUrl(shareToken: string): string {
  return `${window.location.origin}/join/${shareToken}`;
}

export async function generateShareLink(trip: Trip): Promise<ShareLinkResult> {
  try {
    const response = await fetch("/api/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destinationCountry: trip.destinationCountry,
        currency: trip.currency,
        startDate: trip.startDate,
        endDate: trip.endDate,
        budget: trip.budget,
      }),
    });

    if (!response.ok) {
      return { ok: false, error: FRIENDLY_ERROR };
    }

    const data = (await response.json()) as {
      id: string;
      shareToken: string;
      creatorToken: string;
    };
    const link: SharedTripLink = {
      tripId: data.id,
      shareToken: data.shareToken,
      creatorToken: data.creatorToken,
    };
    const saveResult = saveSharedTripLink(link);
    if (!saveResult.ok) {
      return { ok: false, error: saveResult.error };
    }
    return { ok: true, link };
  } catch {
    return { ok: false, error: FRIENDLY_ERROR };
  }
}

export async function regenerateShareLink(
  link: SharedTripLink
): Promise<ShareLinkResult> {
  try {
    const response = await fetch(`/api/trips/${link.tripId}/regenerate`, {
      method: "POST",
      headers: { "x-creator-token": link.creatorToken },
    });

    if (!response.ok) {
      return { ok: false, error: FRIENDLY_ERROR };
    }

    const data = (await response.json()) as { shareToken: string };
    const updated: SharedTripLink = { ...link, shareToken: data.shareToken };
    const saveResult = saveSharedTripLink(updated);
    if (!saveResult.ok) {
      return { ok: false, error: saveResult.error };
    }
    return { ok: true, link: updated };
  } catch {
    return { ok: false, error: FRIENDLY_ERROR };
  }
}

export async function deleteSharedTrip(link: SharedTripLink): Promise<void> {
  try {
    await fetch(`/api/trips/${link.tripId}`, {
      method: "DELETE",
      headers: { "x-creator-token": link.creatorToken },
    });
  } catch {
    // best-effort; swallow all failures
  }
}
