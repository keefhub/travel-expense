"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
// React 19's types no longer declare a global JSX namespace, so the return type
// below is imported from "react" rather than referenced bare (same reason as
// components/ManageParticipants.tsx and components/AttributionFields.tsx).
import type { JSX } from "react";
import { useRouter } from "next/navigation";
import { getSharedTripLink, getJoinedTrips, getTrip } from "@/lib/storage";
import { findJoinedTrip } from "@/lib/join";
import { getParticipants, type ParticipantAuth } from "@/lib/participants";
import {
  TRIP_CREATOR_ID,
  buildAttributionOptions,
  validateAttribution,
  toSharesPayload,
  createSharedExpense,
  type AttributionOption,
  type SplitMethod,
} from "@/lib/sharedExpenses";
import { getSupportedCurrencies } from "@/lib/countries";
import { getAllCategories } from "@/lib/categories";
import {
  validateExpenseForm,
  PAYMENT_METHODS,
  type ExpenseFormValues,
} from "@/lib/expenses";
import AttributionFields from "@/components/AttributionFields";
import useUnsavedChangesWarning from "@/hooks/useUnsavedChangesWarning";

// The viewing device's role on this shared trip, resolved from localStorage on
// mount. Mirrors components/ManageParticipants.tsx's own ResolvedRole, plus the
// two trip facts this form needs (the date range validateExpenseForm checks
// against, and the currency the new expense defaults to).
type ResolvedContext = {
  tripId: string;
  auth: ParticipantAuth;
  myOptionId: string;
  tripDates: { startDate: string; endDate: string };
  tripCurrency: string;
};

export default function SharedExpenseForm({
  token,
}: {
  token: string;
}): JSX.Element | null {
  const router = useRouter();

  // A synchronous in-flight guard, not state: it is checked and set before any
  // await so a double-tap on "Save expense" on a slow connection cannot fire two
  // POST requests and create two Expense rows (same guard as
  // components/ShareTripLink.tsx). Reset in a finally, so a retry after a failed
  // save is still possible.
  const submittingRef = useRef(false);

  const [context, setContext] = useState<ResolvedContext | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">(
    "loading"
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [options, setOptions] = useState<AttributionOption[]>([]);
  const [values, setValues] = useState<ExpenseFormValues>({
    amount: "",
    currency: "",
    category: "",
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: "",
    location: "",
    description: "",
  });
  // The snapshot isDirty is measured against. Seeded from the same initial
  // values object the form started from (same line as
  // components/ExpenseForm.tsx) so the two cannot drift apart on the first
  // render, and it stays settable so the mount effect can re-snapshot after it
  // hydrates the currency.
  const [initialValues, setInitialValues] =
    useState<ExpenseFormValues>(values);
  const [payerId, setPayerId] = useState("");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("even");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<
    Partial<Record<keyof ExpenseFormValues, string>>
  >({});
  const [splitError, setSplitError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Tracks the seven base fields only, exactly as components/ExpenseForm.tsx
  // tracks its own seven — attribution selections are not part of this check.
  const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);
  useUnsavedChangesWarning(isDirty);

  useEffect(() => {
    async function loadContext() {
      const sharedLink = getSharedTripLink();

      let resolved: ResolvedContext | null = null;

      if (sharedLink !== null && sharedLink.shareToken === token) {
        const localTrip = getTrip();
        if (localTrip !== null) {
          resolved = {
            tripId: sharedLink.tripId,
            auth: { role: "creator", token: sharedLink.creatorToken },
            myOptionId: TRIP_CREATOR_ID,
            tripDates: {
              startDate: localTrip.startDate,
              endDate: localTrip.endDate,
            },
            tripCurrency: localTrip.currency,
          };
        }
      } else {
        const joined = findJoinedTrip(getJoinedTrips(), token);
        if (joined !== null) {
          resolved = {
            tripId: joined.tripId,
            auth: { role: "participant", token: joined.participantToken },
            myOptionId: joined.participantId,
            tripDates: {
              startDate: joined.trip.startDate,
              endDate: joined.trip.endDate,
            },
            tripCurrency: joined.trip.currency,
          };
        }
      }

      if (resolved === null) {
        router.replace("/");
        return;
      }

      setContext(resolved);
      // Hydrate the resolved currency into the form and re-snapshot the
      // baseline with the same change in the same pass. The form's initial
      // currency is "" while the resolved trip currency is not, so hydrating
      // `values` alone would leave the two differing by construction and pin
      // isDirty to true — firing the leave warning on a form the user has not
      // touched, including on the load-error branch, which contradicts
      // features/011.unsaved-expense-warning.md scenario 1.
      setValues((v) => ({ ...v, currency: resolved.tripCurrency }));
      setInitialValues((v) => ({ ...v, currency: resolved.tripCurrency }));

      const result = await getParticipants(resolved.tripId, resolved.auth);

      if (!result.ok) {
        setLoadError(result.error);
        setLoadState("error");
        return;
      }

      const opts = buildAttributionOptions(result.participants);
      setOptions(opts);
      setPayerId(resolved.myOptionId);
      setSelectedIds(opts.map((o) => o.id));
      setLoadState("ready");
    }

    loadContext();
  }, [token, router]);

  function handleSplitMethodChange(method: SplitMethod) {
    setSplitMethod(method);
    if (method === "exact") setExactAmounts({});
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (context === null) return;

    const categoryNames = getAllCategories().map((c) => c.name);
    const { errors: fieldErrors } = validateExpenseForm(
      values,
      context.tripDates,
      categoryNames
    );

    const totalAmount = Number(values.amount.trim());
    const { errors: attributionErrors } = validateAttribution(
      selectedIds,
      splitMethod,
      totalAmount,
      exactAmounts
    );

    if (
      Object.keys(fieldErrors).length > 0 ||
      attributionErrors.split !== undefined
    ) {
      setErrors(fieldErrors);
      setSplitError(attributionErrors.split);
      setSaveError(null);
      return;
    }

    setErrors({});
    setSplitError(undefined);

    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    const trimmedDescription = values.description.trim();
    const payload = {
      amount: totalAmount,
      currency: values.currency,
      category: values.category,
      date: values.date,
      paymentMethod: values.paymentMethod,
      location: values.location,
      ...(trimmedDescription !== "" ? { description: trimmedDescription } : {}),
      payerParticipantId: payerId === TRIP_CREATOR_ID ? null : payerId,
      shares: toSharesPayload(
        selectedIds,
        splitMethod,
        totalAmount,
        exactAmounts
      ),
    };

    try {
      const result = await createSharedExpense(
        context.tripId,
        payload,
        context.auth
      );

      if (!result.ok) {
        setSaveError(result.error);
        return;
      }

      router.push(`/trips/${token}/expenses/${result.expense.id}`);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  if (context === null || loadState === "loading") return null;

  if (loadState === "error") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">Record an expense</h1>
        <p role="alert">{loadError}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">Record an expense</h1>

      <div className="flex flex-col gap-1">
        <label htmlFor="amount">Amount</label>
        <input
          id="amount"
          type="text"
          inputMode="decimal"
          value={values.amount}
          onChange={(e) => setValues({ ...values, amount: e.target.value })}
        />
        {errors.amount && <p role="alert">{errors.amount}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="currency">Currency</label>
        <select
          id="currency"
          value={values.currency}
          onChange={(e) => setValues({ ...values, currency: e.target.value })}
        >
          <option value="">Select a currency</option>
          {getSupportedCurrencies().map((currency) => (
            <option key={currency} value={currency}>
              {currency}
            </option>
          ))}
        </select>
        {errors.currency && <p role="alert">{errors.currency}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="category">Category</label>
        <select
          id="category"
          value={values.category}
          onChange={(e) => setValues({ ...values, category: e.target.value })}
        >
          <option value="">Select a category</option>
          {getAllCategories().map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.category && <p role="alert">{errors.category}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="date">Date</label>
        <input
          id="date"
          type="date"
          value={values.date}
          onChange={(e) => setValues({ ...values, date: e.target.value })}
        />
        {errors.date && <p role="alert">{errors.date}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="paymentMethod">Payment method</label>
        <select
          id="paymentMethod"
          value={values.paymentMethod}
          onChange={(e) =>
            setValues({ ...values, paymentMethod: e.target.value })
          }
        >
          <option value="">Select a payment method</option>
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
        {errors.paymentMethod && <p role="alert">{errors.paymentMethod}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="location">Location</label>
        <input
          id="location"
          type="text"
          value={values.location}
          onChange={(e) => setValues({ ...values, location: e.target.value })}
        />
        {errors.location && <p role="alert">{errors.location}</p>}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="description">Description (optional)</label>
        <input
          id="description"
          type="text"
          value={values.description}
          onChange={(e) => setValues({ ...values, description: e.target.value })}
        />
      </div>

      <AttributionFields
        options={options}
        totalAmount={Number(values.amount.trim()) || 0}
        payerId={payerId}
        onPayerChange={setPayerId}
        splitMethod={splitMethod}
        onSplitMethodChange={handleSplitMethodChange}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        exactAmounts={exactAmounts}
        onExactAmountsChange={setExactAmounts}
        error={splitError}
      />

      {saveError && <p role="alert">{saveError}</p>}

      <button type="submit" className="btn-primary" disabled={isSubmitting}>
        Save expense
      </button>
    </form>
  );
}
