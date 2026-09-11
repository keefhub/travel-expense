"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Trip } from "@/lib/types";
import { getTrip, resetAppData } from "@/lib/storage";
import ExchangeRateForm from "@/components/ExchangeRateForm";
import ResetAppDataConfirm from "@/components/ResetAppDataConfirm";

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
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  useEffect(() => {
    if (trip === null) {
      router.replace("/");
    }
  }, [trip, router]);

  if (trip === undefined || trip === null) {
    return null;
  }

  if (confirmingReset) {
    return (
      <div className="flex flex-col gap-4">
        <ResetAppDataConfirm
          onConfirm={() => {
            const result = resetAppData();
            if (result.ok) {
              router.push("/");
              return;
            }
            setResetError(result.error);
          }}
          onCancel={() => {
            setConfirmingReset(false);
            setResetError(null);
          }}
        />
        {resetError && <p role="alert" className="px-4">{resetError}</p>}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold p-4">Settings</h1>
      <p className="px-4 font-mono text-sm text-[var(--muted)]">Trip currency: {trip.currency}</p>
      <ExchangeRateForm trip={trip} />
      <div className="p-4">
        <button type="button" onClick={() => setConfirmingReset(true)}>
          Reset app data
        </button>
      </div>
    </div>
  );
}
