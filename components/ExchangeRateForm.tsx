"use client";

import { useState, type FormEvent } from "react";
import type { Trip } from "@/lib/types";
import {
  getExpenses,
  getExchangeRates,
  saveExchangeRates,
} from "@/lib/storage";
import {
  validateExchangeRateInput,
  setExchangeRate,
  getCurrenciesNeedingRates,
} from "@/lib/currency";

function RateInput({
  currency,
  tripCurrency,
}: {
  currency: string;
  tripCurrency: string;
}) {
  const [rateInput, setRateInput] = useState(() => {
    const existing = getExchangeRates().find((r) => r.currency === currency);
    return existing ? String(existing.rate) : "";
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const { error: validationError } = validateExchangeRateInput(
      currency,
      rateInput,
      tripCurrency,
    );
    if (validationError) {
      setError(validationError);
      setSaved(false);
      return;
    }

    const result = saveExchangeRates(
      setExchangeRate(getExchangeRates(), currency, Number(rateInput.trim())),
    );
    if (!result.ok) {
      setError(result.error);
      setSaved(false);
      return;
    }

    setError(null);
    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="rateValue">
          Rate (1 {currency} = ? {tripCurrency})
        </label>
        <input
          id="rateValue"
          type="text"
          inputMode="decimal"
          value={rateInput}
          onChange={(e) => setRateInput(e.target.value)}
        />
      </div>

      {error && <p role="alert">{error}</p>}
      {saved && (
        <p role="status" className="text-(--success)">
          Exchange rate saved.
        </p>
      )}

      <button type="submit" className="btn-primary">
        Save exchange rate
      </button>
    </form>
  );
}

export default function ExchangeRateForm({ trip }: { trip: Trip }) {
  const currencyOptions = getCurrenciesNeedingRates(
    getExpenses(),
    trip.currency,
  );
  const [currency, setCurrency] = useState(currencyOptions[0] ?? "");

  if (currencyOptions.length === 0) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h2 className="text-xl font-semibold">Exchange rate</h2>
        <p>No other currencies recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">Exchange rate</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="rateCurrency">Currency</label>
        <select
          id="rateCurrency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {currencyOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <RateInput
        key={currency}
        currency={currency}
        tripCurrency={trip.currency}
      />
    </div>
  );
}
