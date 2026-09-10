"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { Trip } from "@/lib/types";
import { getTrip } from "@/lib/storage";
import { calculateTripDurationDays } from "@/lib/trip";
import { EXPENSE_SAVED_FLAG_KEY } from "@/lib/expenses";
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

// Reads the one-time post-save flag and clears it on the same call, so a
// later reload of "/" never re-shows the message. Modeled as a
// useSyncExternalStore snapshot (not useEffect+setState) for the same reason
// createTripStore is: setting state from inside an effect body is a
// synchronous cascading re-render the react-hooks/set-state-in-effect rule
// rejects, and this needs the read to happen exactly once regardless of how
// many times React calls getSnapshot for comparison.
function createSavedMessageStore() {
  let cached = false;
  let hasRead = false;

  return {
    subscribe(): () => void {
      return () => {};
    },
    getSnapshot(): boolean {
      if (!hasRead) {
        try {
          cached = window.sessionStorage.getItem(EXPENSE_SAVED_FLAG_KEY) !== null;
          if (cached) {
            window.sessionStorage.removeItem(EXPENSE_SAVED_FLAG_KEY);
          }
        } catch {
          cached = false;
        }
        hasRead = true;
      }
      return cached;
    },
    getServerSnapshot(): boolean {
      return false;
    },
  };
}

export default function Home() {
  const [store] = useState(createTripStore);
  const trip = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [savedMessageStore] = useState(createSavedMessageStore);
  const showSavedMessage = useSyncExternalStore(
    savedMessageStore.subscribe,
    savedMessageStore.getSnapshot,
    savedMessageStore.getServerSnapshot
  );

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
      {showSavedMessage && <p role="status">Expense saved.</p>}
      <h1 className="text-xl font-semibold">Home</h1>
      <p>
        Trip to {trip.destinationCountry} ({trip.startDate} – {trip.endDate},{" "}
        {durationDays} {durationDays === 1 ? "day" : "days"})
      </p>
      <Link href="/trip/edit">Edit trip</Link>
    </div>
  );
}
