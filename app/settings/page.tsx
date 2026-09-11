"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Trip } from "@/lib/types";
import { getTrip } from "@/lib/storage";
import ExchangeRateForm from "@/components/ExchangeRateForm";

type TripSnapshot = Trip | null | undefined;

function createTripStore() {
  let cached: TripSnapshot;
  let hasRead = false;

  return {
    subscribe(): () => void {
      return () => {};
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
  };
}

export default function SettingsPage() {
  const router = useRouter();
  const [store] = useState(createTripStore);
  const trip = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

  useEffect(() => {
    if (trip === null) {
      router.replace("/");
    }
  }, [trip, router]);

  if (trip === undefined || trip === null) {
    return null;
  }

  return (
    <div>
      <h1 className="text-xl font-semibold p-4">Settings</h1>
      <p className="px-4 font-mono text-sm text-[var(--muted)]">Trip currency: {trip.currency}</p>
      <ExchangeRateForm trip={trip} />
    </div>
  );
}
