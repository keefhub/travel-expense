"use client";

import { useState, useSyncExternalStore } from "react";
import type { Trip } from "@/lib/types";
import { getTrip } from "@/lib/storage";
import { calculateTripDurationDays } from "@/lib/trip";
import TripSetupForm from "@/components/TripSetupForm";

// `undefined` = not yet determined (server render, and the client's first
// paint before hydration settles) — rendered as nothing, avoiding a
// hydration mismatch. `null` = determined, no trip saved. `Trip` = determined,
// trip saved. useSyncExternalStore (not useEffect+setState) is what lets this
// resolve without a hydration-unsafe synchronous read during the initial render.
//
// The store is created fresh per component instance (via useState(createTripStore)
// below), not held at module scope: a module-scope cache would keep returning a
// stale Trip after a remount once features 002/003 (edit/replace the trip) land,
// since nothing outside this file could ever invalidate it. Scoping it per-mount
// means navigating away and back to "/" always re-reads storage.
type TripSnapshot = Trip | null | undefined;

function createTripStore() {
  let cached: TripSnapshot;
  let hasRead = false;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): TripSnapshot {
      if (!hasRead) {
        cached = getTrip();
        hasRead = true;
      }
      return cached;
    },
    getServerSnapshot(): TripSnapshot {
      return undefined;
    },
    setSnapshot(trip: Trip) {
      cached = trip;
      hasRead = true;
      listeners.forEach((listener) => listener());
    },
  };
}

export default function Home() {
  const [store] = useState(createTripStore);
  const trip = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  if (trip === undefined) {
    return null;
  }

  if (trip === null) {
    return <TripSetupForm onSaved={store.setSnapshot} />;
  }

  const durationDays = calculateTripDurationDays(trip.startDate, trip.endDate);

  // Placeholder — replaced by feature 009 (home dashboard).
  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold">Home</h1>
      <p>
        Trip to {trip.destinationCountry} ({trip.startDate} – {trip.endDate},{" "}
        {durationDays} {durationDays === 1 ? "day" : "days"})
      </p>
    </div>
  );
}
