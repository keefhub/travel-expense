import type { Trip, SharedTripLink, JoinedTrip } from "@/lib/types";

export type TripRole = "own" | "created" | "joined";

export interface SwitcherEntry {
  role: TripRole;
  label: string;
  href: string;
  shareToken?: string;
}

// The device's own trip first (unshared or created), then joined trips in the
// order storage holds them. Never sorted.
export function getSwitcherEntries(
  trip: Trip | null,
  sharedLink: SharedTripLink | null,
  joined: JoinedTrip[],
): SwitcherEntry[] {
  const entries: SwitcherEntry[] = [];

  if (trip !== null) {
    entries.push({
      role: sharedLink !== null ? "created" : "own",
      label: trip.destinationCountry,
      href: "/",
    });
  }

  for (const jt of joined) {
    entries.push({
      role: "joined",
      label: jt.trip.destinationCountry,
      href: `/trips/${jt.shareToken}`,
      shareToken: jt.shareToken,
    });
  }

  return entries;
}
