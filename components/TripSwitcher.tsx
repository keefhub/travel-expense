"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
// React 19's types no longer declare a global JSX namespace, so the return type
// below is imported from "react" rather than referenced bare.
import type { JSX } from "react";
import { getTrip, getSharedTripLink, getJoinedTrips } from "@/lib/storage";
import { getSwitcherEntries, type TripRole } from "@/lib/tripSwitcher";

const ROLE_LABEL: Record<TripRole, string> = {
  own: "Own trip",
  created: "Created",
  joined: "Joined",
};

// Hydration guard: false on the server and for the first client render, true once
// mounted. This is a mount flag only, not a data store — entries are still
// recomputed uncached in the render body below.
const subscribeMounted = () => () => {};
const getMountedSnapshot = () => true;
const getServerMountedSnapshot = () => false;

export default function TripSwitcher(): JSX.Element | null {
  const mounted = useSyncExternalStore(
    subscribeMounted,
    getMountedSnapshot,
    getServerMountedSnapshot,
  );

  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Renders nothing on the server and on the first client render, so the
  // markup that hydrates always matches what the server sent. Storage is only
  // read after that.
  if (!mounted) return null;

  // Deliberately uncached and not held in a store: this component is mounted
  // once in the root layout and never remounts across client-side navigation,
  // so a value cached at first mount would never notice a later storage change
  // (for example a joined trip pruned from storage). Recomputing on every
  // render is fresh enough because usePathname() re-renders this component on
  // every navigation, and isOpen toggles it on every open and close.
  const entries = getSwitcherEntries(getTrip(), getSharedTripLink(), getJoinedTrips());

  if (entries.length < 2) return null;

  // entries[0] is the local trip entry when one exists, which is the right
  // fallback for every route except "/trips/[token]" (matched exactly below):
  // every other route operates on the device's own local trip.
  const activeEntry = entries.find((e) => e.href === pathname) ?? entries[0];

  return (
    <header className="flex items-center justify-between border-b border-(--border) bg-(--surface) px-4 py-2">
      <button
        type="button"
        aria-label="Switch trip"
        onClick={() => setIsOpen(true)}
        className="btn-text"
      >
        {activeEntry.label} — {ROLE_LABEL[activeEntry.role]}
      </button>
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-(--background) p-4">
            <h2 className="text-xl font-semibold">Switch trip</h2>
            <ul className="flex flex-col divide-y divide-(--border)">
              {entries.map((entry) => (
                <li key={entry.href}>
                  <Link
                    href={entry.href}
                    onClick={() => setIsOpen(false)}
                    className="flex py-2"
                  >
                    {entry.label} — {ROLE_LABEL[entry.role]}
                  </Link>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="btn-secondary"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
