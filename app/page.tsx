"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Trip } from "@/lib/types";
import { getTrip, getJoinedTrips } from "@/lib/storage";
import { EXPENSE_SAVED_FLAG_KEY } from "@/lib/expenses";
import TripSetupForm from "@/components/TripSetupForm";
import Dashboard, { DashboardSkeleton } from "@/components/Dashboard";

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
  const router = useRouter();
  const [store] = useState(createTripStore);
  const trip = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [savedMessageStore] = useState(createSavedMessageStore);
  const showSavedMessage = useSyncExternalStore(
    savedMessageStore.subscribe,
    savedMessageStore.getSnapshot,
    savedMessageStore.getServerSnapshot,
  );

  useEffect(() => {
    if (trip === null && getJoinedTrips().length > 0) {
      router.replace(`/trips/${getJoinedTrips()[0].shareToken}`);
    }
  }, [trip, router]);

  if (trip === undefined) {
    return <DashboardSkeleton />;
  }

  if (trip === null) {
    if (getJoinedTrips().length > 0) {
      return null;
    }
    return <TripSetupForm onSaved={store.setSnapshot} />;
  }

  return <Dashboard trip={trip} showSavedMessage={showSavedMessage} />;
}
