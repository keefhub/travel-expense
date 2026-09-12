"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Trip } from "@/lib/types";
import { SUPPORTED_COUNTRIES, getCurrencyForCountry } from "@/lib/countries";
import { saveTrip } from "@/lib/storage";
import {
  calculateTripDurationDays,
  getTripFormValues,
  submitTripSetup,
  type TripFormValues,
  type TripValidationResult,
} from "@/lib/trip";
import DateField from "@/components/DateField";

export default function TripEditForm({ trip }: { trip: Trip }) {
  const router = useRouter();
  const [values, setValues] = useState<TripFormValues>(() =>
    getTripFormValues(trip),
  );
  const [errors, setErrors] = useState<TripValidationResult["errors"]>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const durationDays = calculateTripDurationDays(
    values.startDate,
    values.endDate,
  );
  const currency = getCurrencyForCountry(values.destinationCountry);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = submitTripSetup(values, { getCurrencyForCountry, saveTrip });
    if (result.status === "invalid") {
      setErrors(result.errors);
      setSaveError(null);
      return;
    }
    if (result.status === "storage-error") {
      setErrors({});
      setSaveError(result.error);
      return;
    }
    setErrors({});
    setSaveError(null);
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Trip settings</h1>

      <div className="flex flex-col gap-1">
        <label htmlFor="destinationCountry">Destination country</label>
        <select
          id="destinationCountry"
          value={values.destinationCountry}
          onChange={(e) =>
            setValues({ ...values, destinationCountry: e.target.value })
          }
        >
          <option value="">Select a country</option>
          {SUPPORTED_COUNTRIES.map((c) => (
            <option key={c.code} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.destinationCountry && (
          <p role="alert">{errors.destinationCountry}</p>
        )}
      </div>

      <DateField
        id="startDate"
        label="Start date"
        value={values.startDate}
        onChange={(startDate) => setValues({ ...values, startDate })}
        error={errors.startDate}
        hint="Tap the field to pick a date from the calendar."
      />

      <DateField
        id="endDate"
        label="End date"
        value={values.endDate}
        onChange={(endDate) => setValues({ ...values, endDate })}
        error={errors.endDate}
        hint="Tap the field to pick a date from the calendar."
      />

      <p className="font-mono text-sm text-(--muted)">
        {Number.isFinite(durationDays) && durationDays > 0
          ? `${durationDays} ${durationDays === 1 ? "day" : "days"}`
          : "-"}
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor="budget">Budget (optional)</label>
        <input
          id="budget"
          type="text"
          inputMode="decimal"
          value={values.budget}
          onChange={(e) => setValues({ ...values, budget: e.target.value })}
        />
        {errors.budget && <p role="alert">{errors.budget}</p>}
      </div>

      <p className="font-mono text-sm text-(--muted)">
        Trip currency: {currency ?? "-"}
      </p>

      {saveError && <p role="alert">{saveError}</p>}

      <button type="submit" className="btn-primary">
        Save changes
      </button>
      <Link href="/trip/new" className="btn-secondary text-center">
        Start a new trip
      </Link>
    </form>
  );
}
