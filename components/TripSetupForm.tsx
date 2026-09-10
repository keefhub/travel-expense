"use client";

import { useState, type FormEvent } from "react";
import type { Trip } from "@/lib/types";
import { SUPPORTED_COUNTRIES, getCurrencyForCountry } from "@/lib/countries";
import { saveTrip } from "@/lib/storage";
import { submitTripSetup, type TripFormValues, type TripValidationResult } from "@/lib/trip";

export default function TripSetupForm({ onSaved }: { onSaved: (trip: Trip) => void }) {
  const [values, setValues] = useState<TripFormValues>({
    destinationCountry: "",
    startDate: "",
    endDate: "",
    budget: "",
  });
  const [errors, setErrors] = useState<TripValidationResult["errors"]>({});
  const [saveError, setSaveError] = useState<string | null>(null);

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
    onSaved(result.trip);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Set up your trip</h1>

      <div className="flex flex-col gap-1">
        <label htmlFor="destinationCountry">Destination country</label>
        <select
          id="destinationCountry"
          value={values.destinationCountry}
          onChange={(e) => setValues({ ...values, destinationCountry: e.target.value })}
        >
          <option value="">Select a country</option>
          {SUPPORTED_COUNTRIES.map((c) => (
            <option key={c.code} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.destinationCountry && <p role="alert">{errors.destinationCountry}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="startDate">Start date</label>
        <input
          id="startDate"
          type="date"
          value={values.startDate}
          onChange={(e) => setValues({ ...values, startDate: e.target.value })}
        />
        {errors.startDate && <p role="alert">{errors.startDate}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="endDate">End date</label>
        <input
          id="endDate"
          type="date"
          value={values.endDate}
          onChange={(e) => setValues({ ...values, endDate: e.target.value })}
        />
        {errors.endDate && <p role="alert">{errors.endDate}</p>}
      </div>

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

      {saveError && <p role="alert">{saveError}</p>}

      <button type="submit">Start tracking</button>
    </form>
  );
}
