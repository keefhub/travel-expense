"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Trip } from "@/lib/types";
import { getTrip, saveExpenses, saveExchangeRates } from "@/lib/storage";
import { submitNewTrip } from "@/lib/trip";
import TripSetupForm from "@/components/TripSetupForm";
import NewTripConfirm from "@/components/NewTripConfirm";

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

export default function NewTripPage() {
  const router = useRouter();
  const [store] = useState(createTripStore);
  const trip = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (trip === null) {
      router.replace("/");
    }
  }, [trip, router]);

  if (trip === undefined || trip === null) {
    return null;
  }

  if (!confirmed) {
    return (
      <NewTripConfirm
        onConfirm={() => setConfirmed(true)}
        onCancel={() => router.push("/trip/edit")}
      />
    );
  }

  return (
    <TripSetupForm
      onSaved={() => router.push("/")}
      submit={(values, deps) =>
        submitNewTrip(values, { ...deps, saveExpenses, saveExchangeRates })
      }
    />
  );
}
