"use client";

// React 19's types no longer declare a global JSX namespace, so the return type
// below is imported from "react" rather than referenced bare (same reason as
// components/ManageParticipants.tsx and components/TripSwitcher.tsx).
import type { JSX } from "react";
import type { AttributionOption, SplitMethod } from "@/lib/sharedExpenses";
import { calculateEvenSplit } from "@/lib/sharedExpenses";

// Fully controlled: payerId, splitMethod, selectedIds and exactAmounts are all
// owned by the parent (components/SharedExpenseForm.tsx / SharedExpenseDetail.tsx)
// and only ever changed through the callbacks below, so this component holds no
// state of its own. Even-split amounts are never stored either; they are computed
// fresh on every render, which is why switching split method cannot show a stale
// amount.
export default function AttributionFields(props: {
  options: AttributionOption[];
  totalAmount: number;
  payerId: string;
  onPayerChange: (id: string) => void;
  splitMethod: SplitMethod;
  onSplitMethodChange: (method: SplitMethod) => void;
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  exactAmounts: Record<string, string>;
  onExactAmountsChange: (amounts: Record<string, string>) => void;
  error?: string;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="payer">Payer</label>
        <select
          id="payer"
          value={props.payerId}
          onChange={(e) => props.onPayerChange(e.target.value)}
        >
          {props.options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend>Split method</legend>
        <label>
          <input
            type="radio"
            name="splitMethod"
            value="even"
            checked={props.splitMethod === "even"}
            onChange={() => props.onSplitMethodChange("even")}
          />
          Even
        </label>
        <label>
          <input
            type="radio"
            name="splitMethod"
            value="exact"
            checked={props.splitMethod === "exact"}
            onChange={() => props.onSplitMethodChange("exact")}
          />
          Exact amount
        </label>
      </fieldset>

      <div className="flex flex-col gap-2">
        <span>Split among</span>
        {(() => {
          const evenAmounts =
            props.splitMethod === "even"
              ? calculateEvenSplit(props.totalAmount, props.selectedIds)
              : {};
          return props.options.map((option) => {
            const checked = props.selectedIds.includes(option.id);
            return (
              <div
                key={option.id}
                className="flex items-center justify-between gap-2"
              >
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        props.onSelectedIdsChange([
                          ...props.selectedIds,
                          option.id,
                        ]);
                      } else {
                        props.onSelectedIdsChange(
                          props.selectedIds.filter((id) => id !== option.id)
                        );
                      }
                    }}
                  />
                  {option.name}
                </label>
                {checked && props.splitMethod === "even" && (
                  <span className="font-mono">
                    {evenAmounts[option.id].toFixed(2)}
                  </span>
                )}
                {checked && props.splitMethod === "exact" && (
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`${option.name} share`}
                    value={props.exactAmounts[option.id] ?? ""}
                    onChange={(e) =>
                      props.onExactAmountsChange({
                        ...props.exactAmounts,
                        [option.id]: e.target.value,
                      })
                    }
                  />
                )}
              </div>
            );
          });
        })()}
      </div>

      {props.error && <p role="alert">{props.error}</p>}
    </div>
  );
}
