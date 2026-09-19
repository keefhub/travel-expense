"use client";

import { useEffect, useRef, useState } from "react";
// React 19's types no longer declare a global JSX namespace, so the return type
// below is imported from "react" rather than referenced bare (same reason as
// components/ManageParticipants.tsx and components/SharedExpenseForm.tsx).
import type { JSX } from "react";
import { useRouter } from "next/navigation";
import { getSharedTripLink, getJoinedTrips } from "@/lib/storage";
import { findJoinedTrip } from "@/lib/join";
import { getParticipants, type ParticipantAuth } from "@/lib/participants";
import {
  TRIP_CREATOR_ID,
  buildAttributionOptions,
  validateAttribution,
  toSharesPayload,
  getSharedExpense,
  updateSharedExpenseAttribution,
  type AttributionOption,
  type SplitMethod,
} from "@/lib/sharedExpenses";
import type { SharedExpense } from "@/lib/types";
import AttributionFields from "@/components/AttributionFields";

// The viewing device's role on this shared trip, resolved from localStorage on
// mount (same resolution as components/ManageParticipants.tsx).
type ResolvedContext = {
  tripId: string;
  auth: ParticipantAuth;
};

// View-only for every field the expense was recorded with; only the payer and
// the split can be changed here, by swapping AttributionFields in behind the
// "Edit split" button and PATCHing those two things alone.
export default function SharedExpenseDetail({
  token,
  expenseId,
}: {
  token: string;
  expenseId: string;
}): JSX.Element | null {
  const router = useRouter();

  // A synchronous in-flight guard, not state: it is checked and set before any
  // await so a double-tap on "Save split" on a slow connection cannot fire two
  // PATCH requests (same guard shape as components/SharedExpenseForm.tsx).
  // Reset in a finally, so a retry after a failed save is still possible.
  const savingRef = useRef(false);

  const [context, setContext] = useState<ResolvedContext | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "error" | "ready">(
    "loading"
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expense, setExpense] = useState<SharedExpense | null>(null);
  const [options, setOptions] = useState<AttributionOption[]>([]);
  const [editing, setEditing] = useState(false);
  const [payerId, setPayerId] = useState("");
  // True only when the loaded expense's payer is no longer among the trip's
  // current participants. Blocks "Save split" until the user explicitly picks a
  // new payer, so a departed payer is never silently swapped for "Trip creator"
  // without the user noticing.
  const [payerNeedsReselection, setPayerNeedsReselection] = useState(false);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>("exact");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [splitError, setSplitError] = useState<string | undefined>(undefined);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadDetail() {
      const sharedLink = getSharedTripLink();

      let resolved: ResolvedContext | null = null;

      if (sharedLink !== null && sharedLink.shareToken === token) {
        resolved = {
          tripId: sharedLink.tripId,
          auth: { role: "creator", token: sharedLink.creatorToken },
        };
      } else {
        const joined = findJoinedTrip(getJoinedTrips(), token);
        if (joined !== null) {
          resolved = {
            tripId: joined.tripId,
            auth: { role: "participant", token: joined.participantToken },
          };
        }
      }

      if (resolved === null) {
        router.replace("/");
        return;
      }

      setContext(resolved);

      const [expenseResult, participantsResult] = await Promise.all([
        getSharedExpense(resolved.tripId, expenseId, resolved.auth),
        getParticipants(resolved.tripId, resolved.auth),
      ]);

      if (!expenseResult.ok) {
        setLoadError(expenseResult.error);
        setLoadState("error");
        return;
      }

      if (!participantsResult.ok) {
        setLoadError(participantsResult.error);
        setLoadState("error");
        return;
      }

      setExpense(expenseResult.expense);

      const opts = buildAttributionOptions(participantsResult.participants);
      setOptions(opts);

      // Initialize the edit-mode state from the loaded expense, filtered to the
      // options that still exist: a departed member keeps their name and amount
      // in the view-mode split list above (it comes from the expense's own
      // snapshots), but is never offered as a selectable option here.
      const currentIds = opts.map((o) => o.id);
      const loadedPayerId =
        expenseResult.expense.payerParticipantId ?? TRIP_CREATOR_ID;
      const payerStillCurrent = currentIds.includes(loadedPayerId);
      setPayerId(payerStillCurrent ? loadedPayerId : opts[0].id);
      setPayerNeedsReselection(!payerStillCurrent);
      const loadedSelected = expenseResult.expense.shares
        .map((s) => s.participantId ?? TRIP_CREATOR_ID)
        .filter((id) => currentIds.includes(id));
      setSelectedIds(loadedSelected.length > 0 ? loadedSelected : currentIds);
      const loadedAmounts: Record<string, string> = {};
      expenseResult.expense.shares.forEach((s) => {
        const id = s.participantId ?? TRIP_CREATOR_ID;
        if (currentIds.includes(id)) loadedAmounts[id] = s.amount.toFixed(2);
      });
      setExactAmounts(loadedAmounts);
      // splitMethod stays at its initial value, "exact": the persisted shares are
      // always reconstructable as an exact split, and there is no stored record
      // of which method was originally used to create them.

      setLoadState("ready");
    }

    loadDetail();
  }, [token, expenseId, router]);

  function handleSplitMethodChange(method: SplitMethod) {
    setSplitMethod(method);
    if (method === "exact") setExactAmounts({});
  }

  // Any explicit payer choice clears the reselection requirement, including
  // re-selecting the very option the user started with; only an unmodified
  // auto-defaulted value stays blocked.
  function handlePayerChange(id: string) {
    setPayerId(id);
    setPayerNeedsReselection(false);
  }

  async function handleSaveAttribution() {
    if (context === null || expense === null) return;

    // Checked before validateAttribution: a departed payer that was never
    // re-selected must block saving even when the split itself is valid.
    if (payerNeedsReselection) {
      setSplitError("Choose who paid - the previous payer has left the trip.");
      setSaveError(null);
      return;
    }

    const { errors } = validateAttribution(
      selectedIds,
      splitMethod,
      expense.amount,
      exactAmounts
    );

    if (errors.split !== undefined) {
      setSplitError(errors.split);
      setSaveError(null);
      return;
    }

    setSplitError(undefined);

    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);

    const payerPayload = payerId === TRIP_CREATOR_ID ? null : payerId;
    const shares = toSharesPayload(
      selectedIds,
      splitMethod,
      expense.amount,
      exactAmounts
    );

    try {
      const result = await updateSharedExpenseAttribution(
        context.tripId,
        expenseId,
        payerPayload,
        shares,
        context.auth
      );

      if (!result.ok) {
        setSaveError(result.error);
        return;
      }

      setExpense(result.expense);
      setEditing(false);
      setSaveError(null);
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  if (context === null || loadState === "loading") return null;

  if (loadState === "error") {
    return (
      <div className="flex flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">Expense details</h1>
        <p role="alert">{loadError}</p>
      </div>
    );
  }

  // The plan's ready branch is conditioned on `loadState === "ready" && expense
  // !== null`; this guard is that condition, and it is what lets the render
  // below treat `expense` as loaded.
  if (expense === null) return null;

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Expense details</h1>
        <p className="font-mono text-2xl font-semibold">
          {expense.currency} {expense.amount.toFixed(2)}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-(--border)">
        {[
          { label: "Category", value: expense.category },
          { label: "Date", value: expense.date, mono: true },
          { label: "Payment method", value: expense.paymentMethod },
          { label: "Location", value: expense.location },
          {
            label: "Description",
            value: expense.description ?? "No description entered.",
          },
          { label: "Payer", value: expense.payerName },
        ].map((field) => (
          <li key={field.label} className="flex justify-between gap-4 py-2">
            <span className="shrink-0 text-sm text-(--muted)">
              {field.label}
            </span>
            <span
              className={`min-w-0 text-right break-words ${
                field.mono ? "font-mono" : ""
              }`}
            >
              {field.value}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <span>Split</span>
        <ul className="flex flex-col divide-y divide-(--border)">
          {expense.shares.map((share) => (
            <li
              key={share.participantId ?? "creator"}
              className="flex justify-between gap-4 py-2"
            >
              <span>{share.name}</span>
              <span className="font-mono">{share.amount.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
      {!editing && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setEditing(true)}
        >
          Edit split
        </button>
      )}
      {editing && (
        <>
          <AttributionFields
            options={options}
            totalAmount={expense.amount}
            payerId={payerId}
            onPayerChange={handlePayerChange}
            splitMethod={splitMethod}
            onSplitMethodChange={handleSplitMethodChange}
            selectedIds={selectedIds}
            onSelectedIdsChange={setSelectedIds}
            exactAmounts={exactAmounts}
            onExactAmountsChange={setExactAmounts}
            error={splitError}
          />
          {saveError && <p role="alert">{saveError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={handleSaveAttribution}
              disabled={isSaving}
            >
              Save split
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
