"use client";

import { useRef, useState } from "react";
import type { SharedTripLink, Trip } from "@/lib/types";
import { getSharedTripLink } from "@/lib/storage";
import {
  buildShareUrl,
  generateShareLink,
  regenerateShareLink,
} from "@/lib/sharedTrip";

export default function ShareTripLink({ trip }: { trip: Trip }) {
  const [link, setLink] = useState<SharedTripLink | null>(() =>
    getSharedTripLink(),
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);

  async function handleGenerate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsPending(true);
    setError(null);
    try {
      const result = await generateShareLink(trip);
      if (result.ok) {
        setLink(result.link);
      } else {
        setError(result.error);
      }
    } finally {
      inFlight.current = false;
      setIsPending(false);
    }
  }

  async function handleRegenerate() {
    if (inFlight.current) return;
    inFlight.current = true;
    setIsPending(true);
    setError(null);
    try {
      const result = await regenerateShareLink(link as SharedTripLink);
      if (result.ok) {
        setLink(result.link);
        setCopied(false);
      } else {
        setError(result.error);
      }
    } finally {
      inFlight.current = false;
      setIsPending(false);
    }
  }

  async function handleCopy() {
    try {
      const url = buildShareUrl((link as SharedTripLink).shareToken);
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Could not copy the link. Copy it manually instead.");
    }
  }

  if (link === null) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Invite friends</h2>

        {error && <p role="alert">{error}</p>}

        <button
          type="button"
          className="btn-primary"
          disabled={isPending}
          onClick={handleGenerate}
        >
          Invite friends
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Invite friends</h2>

      <p className="font-mono text-sm break-all">
        {buildShareUrl(link.shareToken)}
      </p>

      {error && <p role="alert">{error}</p>}
      {copied && (
        <p role="status" className="text-sm text-(--success-text)">
          Link copied.
        </p>
      )}

      <div className="flex gap-4">
        <button
          type="button"
          className="btn-secondary"
          disabled={isPending}
          onClick={handleCopy}
        >
          Copy link
        </button>
        <button
          type="button"
          className="btn-text"
          disabled={isPending}
          onClick={handleRegenerate}
        >
          Generate new link
        </button>
      </div>
    </div>
  );
}
