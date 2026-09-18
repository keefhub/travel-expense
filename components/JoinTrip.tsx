"use client";

import { useEffect, useRef, useState } from "react";
import JoinedTripSummary from "@/components/JoinedTripSummary";
import type { JoinedTrip, SharedTripSummary } from "@/lib/types";
import { getJoinedTrips } from "@/lib/storage";
import {
  findJoinedTrip,
  validateJoinName,
  resolveTripByToken,
  joinTrip,
} from "@/lib/join";

export default function JoinTrip({ token }: { token: string }) {
  const [status, setStatus] = useState<
    "loading" | "invalid" | "offline" | "ready" | "joined"
  >("loading");
  const [trip, setTrip] = useState<SharedTripSummary | null>(null);
  const [joinedTrip, setJoinedTrip] = useState<JoinedTrip | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    async function initializeJoin() {
      // Check if already joined
      const existingJoin = findJoinedTrip(getJoinedTrips(), token);
      if (existingJoin) {
        setJoinedTrip(existingJoin);
        setStatus("joined");
        return;
      }

      // Try to resolve the trip
      const resolveResult = await resolveTripByToken(token);
      if (resolveResult.ok) {
        setTrip(resolveResult.trip);
        setStatus("ready");
      } else if (resolveResult.reason === "offline") {
        setStatus("offline");
      } else {
        setStatus("invalid");
      }
    }

    initializeJoin();
  }, [token]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsPending(true);

    const validation = validateJoinName(name);
    if (validation.error) {
      setNameError(validation.error);
      setSubmitError(null);
      inFlightRef.current = false;
      setIsPending(false);
      return;
    }

    setNameError(null);
    try {
      const result = await joinTrip(token, name);
      if (result.ok) {
        setJoinedTrip(result.joined);
        setStatus("joined");
        if (!result.persisted) {
          setStorageWarning(
            "This device could not remember that you joined. If you leave this page, use the link again to rejoin."
          );
        }
      } else {
        setSubmitError(result.error);
      }
    } finally {
      inFlightRef.current = false;
      setIsPending(false);
    }
  }

  if (status === "loading") {
    return null;
  }

  if (status === "invalid") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">Join a trip</h1>
        <p>This link isn&apos;t valid or the trip is no longer available.</p>
      </div>
    );
  }

  if (status === "offline") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">Join a trip</h1>
        <p>
          Joining a trip requires an internet connection. Check your connection
          and try again.
        </p>
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">Join a trip</h1>
        <p>
          You are joining a trip to {trip!.destinationCountry}, {trip!.startDate}{" "}
          to {trip!.endDate}.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="participantName">Your name</label>
            <input
              id="participantName"
              type="text"
              maxLength={50}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          {nameError && <p role="alert">{nameError}</p>}
          {submitError && <p role="alert">{submitError}</p>}
          <button
            type="submit"
            className="btn-primary"
            disabled={isPending}
          >
            Join
          </button>
        </form>
      </div>
    );
  }

  // status === "joined"
  return (
    <JoinedTripSummary
      joinedTrip={joinedTrip!}
      storageWarning={storageWarning}
    />
  );
}
