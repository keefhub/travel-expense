import { useState } from "react";
import type { JSX } from "react";

import type { BalanceLine } from "@/lib/types";
import { validateSettlementAmount } from "@/lib/balances";

export default function ConfirmSettleBalance({
  line,
  tripCurrency,
  onConfirm,
  onCancel,
}: {
  line: BalanceLine;
  tripCurrency: string;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}): JSX.Element {
  const [amountInput, setAmountInput] = useState(line.amount.toFixed(2));
  const [error, setError] = useState<string | null>(null);

  function handleSettle() {
    const result = validateSettlementAmount(amountInput, line.amount);
    if (!result.valid) {
      setError(result.error);
      return;
    }
    onConfirm(result.amount);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="flex flex-col gap-4 rounded bg-(--background) p-6">
        <p>
          {`${line.fromName} owes ${line.toName} `}
          <span className="font-mono">{`${tripCurrency} ${line.amount.toFixed(2)}`}</span>
        </p>
        <label className="flex flex-col gap-1">
          <span>Amount to settle</span>
          <input
            type="text"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            className="font-mono"
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-primary" onClick={handleSettle}>
            Settle
          </button>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
