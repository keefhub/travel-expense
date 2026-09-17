"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Trip } from "@/lib/types";
import { getTrip, getExpenses, resetAppData } from "@/lib/storage";
import { formatExpensesAsCsv } from "@/lib/export";
import ExchangeRateForm from "@/components/ExchangeRateForm";
import ResetAppDataConfirm from "@/components/ResetAppDataConfirm";
import ShareTripLink from "@/components/ShareTripLink";
import ThemeToggle from "@/components/ThemeToggle";

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

function downloadExpensesCsv(): void {
  const csv = formatExpensesAsCsv(getExpenses());
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "expenses.csv";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export default function SettingsPage() {
  const router = useRouter();
  const [store] = useState(createTripStore);
  const trip = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

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
    <div className="flex flex-col gap-6 p-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <ThemeToggle />
      <p className="font-mono text-sm text-(--muted)">Trip currency: {trip.currency}</p>
      <ExchangeRateForm trip={trip} />
      <ShareTripLink trip={trip} />
      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            const expenses = getExpenses();
            if (expenses.length === 0) {
              setExportMessage("You have no expenses to export.");
              return;
            }
            setExportMessage(null);
            downloadExpensesCsv();
          }}
        >
          Export expenses
        </button>
        {exportMessage && <p role="status" className="text-sm text-(--muted)">{exportMessage}</p>}
      </div>
      <div>
        <button type="button" onClick={() => setConfirmingReset(true)} className="btn-text danger">
          Reset app data
        </button>
      </div>
    </div>
  );
}
