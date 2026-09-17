import type { Trip, Expense, ExchangeRate, SharedTripLink } from "@/lib/types";
import type { SaveResult } from "@/lib/storage";
import { isSupportedCountry } from "@/lib/countries";

export interface TripFormValues {
  destinationCountry: string;
  startDate: string;
  endDate: string;
  budget: string;
}

export interface TripValidationResult {
  errors: Partial<Record<keyof TripFormValues, string>>;
}

export function calculateTripDurationDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00Z").getTime();
  const end = new Date(endDate + "T00:00:00Z").getTime();
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end - start) / msPerDay) + 1;
}

export function validateTripForm(values: TripFormValues): TripValidationResult {
  const errors: TripValidationResult["errors"] = {};

  if (values.destinationCountry.trim() === "" || !isSupportedCountry(values.destinationCountry)) {
    errors.destinationCountry = "Select a supported destination country.";
  }

  if (values.startDate.trim() === "") {
    errors.startDate = "Enter a start date.";
  }

  if (values.endDate.trim() === "") {
    errors.endDate = "Enter an end date.";
  } else if (values.startDate.trim() !== "" && values.endDate < values.startDate) {
    errors.endDate = "End date cannot be earlier than the start date.";
  }

  const trimmedBudget = values.budget.trim();
  if (trimmedBudget !== "") {
    const parsed = Number(trimmedBudget);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.budget = "Enter a budget greater than 0.";
    }
  }

  return { errors };
}

export function getTripFormValues(trip: Trip): TripFormValues {
  return {
    destinationCountry: trip.destinationCountry,
    startDate: trip.startDate,
    endDate: trip.endDate,
    budget: trip.budget !== undefined ? String(trip.budget) : "",
  };
}

export type SubmitTripResult =
  | { status: "invalid"; errors: TripValidationResult["errors"] }
  | { status: "saved"; trip: Trip }
  | { status: "storage-error"; error: string };

function buildAndSaveTrip(
  values: TripFormValues,
  deps: {
    getCurrencyForCountry: (country: string) => string | null;
    saveTrip: (trip: Trip) => SaveResult;
  }
): SubmitTripResult {
  const currency = deps.getCurrencyForCountry(values.destinationCountry);
  const trimmedBudget = values.budget.trim();

  const trip: Trip = {
    destinationCountry: values.destinationCountry,
    currency: currency ?? "",
    startDate: values.startDate,
    endDate: values.endDate,
    ...(trimmedBudget !== "" ? { budget: Number(trimmedBudget) } : {}),
  };

  const result = deps.saveTrip(trip);
  if (!result.ok) {
    return { status: "storage-error", error: result.error };
  }

  return { status: "saved", trip };
}

export function submitTripSetup(
  values: TripFormValues,
  deps: {
    getCurrencyForCountry: (country: string) => string | null;
    saveTrip: (trip: Trip) => SaveResult;
  }
): SubmitTripResult {
  const { errors } = validateTripForm(values);
  if (Object.keys(errors).length > 0) {
    return { status: "invalid", errors };
  }
  return buildAndSaveTrip(values, deps);
}

export function submitNewTrip(
  values: TripFormValues,
  deps: {
    getCurrencyForCountry: (country: string) => string | null;
    saveTrip: (trip: Trip) => SaveResult;
    saveExpenses: (expenses: Expense[]) => SaveResult;
    saveExchangeRates: (rates: ExchangeRate[]) => SaveResult;
    getSharedTripLink: () => SharedTripLink | null;
    clearSharedTripLink: () => SaveResult;
    deleteSharedTrip: (link: SharedTripLink) => Promise<void>;
  }
): SubmitTripResult {
  const { errors } = validateTripForm(values);
  if (Object.keys(errors).length > 0) {
    return { status: "invalid", errors };
  }

  const link = deps.getSharedTripLink();
  if (link) {
    void deps.deleteSharedTrip(link);
    deps.clearSharedTripLink();
  }

  const clearedExpenses = deps.saveExpenses([]);
  if (!clearedExpenses.ok) {
    return { status: "storage-error", error: clearedExpenses.error };
  }

  const clearedRates = deps.saveExchangeRates([]);
  if (!clearedRates.ok) {
    return { status: "storage-error", error: clearedRates.error };
  }

  return buildAndSaveTrip(values, deps);
}
