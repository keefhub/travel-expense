import type {
  SharedExchangeRate,
  BalanceLine,
  TripBalancesResult,
} from "@/lib/types";
import { TRIP_CREATOR_ID } from "@/lib/sharedExpenses";
import type { ParticipantAuth } from "@/lib/participants";

export interface BalanceExpenseInput {
  amount: number;
  currency: string;
  payerId: string | null; // null = trip creator, same convention as SharedExpense.payerParticipantId
  payerName: string;
  shares: { id: string | null; name: string; amount: number }[];
}

export interface BalanceSettlementInput {
  fromId: string | null; // null = trip creator, same convention as BalanceExpenseInput.payerId
  toId: string | null; // null = trip creator
  amount: number; // trip-currency; a settlement is never expressed in another currency
}

export function getTripBalances(
  expenses: BalanceExpenseInput[],
  tripCurrency: string,
  rates: Pick<SharedExchangeRate, "currency" | "rate">[],
  settlements: BalanceSettlementInput[] = []
): TripBalancesResult {
  const usedCurrencies = Array.from(
    new Set(expenses.map((e) => e.currency).filter((c) => c !== tripCurrency))
  );
  const missingCurrencies = usedCurrencies
    .filter(
      (c) =>
        !rates.some((r) => r.currency === c && Number.isFinite(r.rate) && r.rate > 0)
    )
    .sort();

  if (missingCurrencies.length > 0) {
    return { lines: [], isComplete: false, missingCurrencies };
  }

  const netCents = new Map<string, number>();
  const names = new Map<string, string>();

  function addNet(id: string, name: string, deltaCents: number): void {
    netCents.set(id, (netCents.get(id) ?? 0) + deltaCents);
    if (!names.has(id)) names.set(id, name);
  }

  for (const expense of expenses) {
    const rate =
      expense.currency === tripCurrency
        ? 1
        : rates.find((r) => r.currency === expense.currency)!.rate;
    const convertedTotalCents = Math.round(expense.amount * rate * 100);
    const originalTotalCents = Math.round(expense.amount * 100);

    const payerId = expense.payerId ?? TRIP_CREATOR_ID;
    addNet(payerId, expense.payerName, convertedTotalCents);

    let assignedCents = 0;
    expense.shares.forEach((share, index) => {
      const shareId = share.id ?? TRIP_CREATOR_ID;
      const isLast = index === expense.shares.length - 1;
      let shareCents: number;
      if (isLast) {
        shareCents = convertedTotalCents - assignedCents;
      } else {
        const originalShareCents = Math.round(share.amount * 100);
        shareCents =
          originalTotalCents === 0
            ? 0
            : Math.round(
                (originalShareCents / originalTotalCents) * convertedTotalCents
              );
        assignedCents += shareCents;
      }
      addNet(shareId, share.name, -shareCents);
    });
  }

  for (const settlement of settlements) {
    const fromId = settlement.fromId ?? TRIP_CREATOR_ID;
    const toId = settlement.toId ?? TRIP_CREATOR_ID;
    const cents = Math.round(settlement.amount * 100);
    addNet(fromId, names.get(fromId) ?? "", cents);
    addNet(toId, names.get(toId) ?? "", -cents);
  }

  const creditors = Array.from(netCents.entries())
    .filter(([, cents]) => cents > 0)
    .map(([id, cents]) => ({ id, name: names.get(id)!, cents }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));

  const debtors = Array.from(netCents.entries())
    .filter(([, cents]) => cents < 0)
    .map(([id, cents]) => ({ id, name: names.get(id)!, cents: -cents }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));

  const lines: BalanceLine[] = [];
  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const amountCents = Math.min(creditors[i].cents, debtors[j].cents);
    lines.push({
      fromId: debtors[j].id,
      fromName: debtors[j].name,
      toId: creditors[i].id,
      toName: creditors[i].name,
      amount: amountCents / 100,
    });
    creditors[i].cents -= amountCents;
    debtors[j].cents -= amountCents;
    if (!(creditors[i].cents > 0)) i += 1;
    if (!(debtors[j].cents > 0)) j += 1;
  }

  lines.sort(
    (a, b) =>
      a.fromName.localeCompare(b.fromName) || a.toName.localeCompare(b.toName)
  );

  return { lines, isComplete: true, missingCurrencies: [] };
}

export type TripBalancesFetchResult =
  | { ok: true; balances: TripBalancesResult; tripCurrency: string }
  | { ok: false; error: string };

const FRIENDLY_ERROR =
  "Could not reach the server. Check your connection and try again.";

function authHeaders(auth: ParticipantAuth): Record<string, string> {
  return auth.role === "creator"
    ? { "x-creator-token": auth.token }
    : { "x-participant-token": auth.token };
}

export async function fetchTripBalances(
  tripId: string,
  auth: ParticipantAuth
): Promise<TripBalancesFetchResult> {
  try {
    const response = await fetch(`/api/trips/${tripId}/balances`, {
      headers: authHeaders(auth),
    });

    if (!response.ok) {
      return { ok: false, error: FRIENDLY_ERROR };
    }

    const data = (await response.json()) as {
      balances: TripBalancesResult;
      tripCurrency: string;
    };

    return {
      ok: true,
      balances: data.balances,
      tripCurrency: data.tripCurrency,
    };
  } catch {
    return { ok: false, error: FRIENDLY_ERROR };
  }
}

export type SettlementAmountValidation =
  | { valid: true; amount: number }
  | { valid: false; error: string };

export function validateSettlementAmount(
  amountInput: string,
  outstandingAmount: number
): SettlementAmountValidation {
  const trimmed = amountInput.trim();
  const amount = Number(trimmed);

  if (trimmed === "" || !Number.isFinite(amount) || amount <= 0) {
    return { valid: false, error: "Enter a valid amount greater than zero." };
  }

  if (Math.round(amount * 100) > Math.round(outstandingAmount * 100)) {
    return {
      valid: false,
      error: "This amount is more than the outstanding balance.",
    };
  }

  return { valid: true, amount };
}

export interface SettleBalanceInput {
  fromId: string | null;
  toId: string | null;
  amount: number;
}

export type SettleBalanceResult =
  | { ok: true; balances: TripBalancesResult; tripCurrency: string }
  | { ok: false; error: string };

export async function settleBalance(
  tripId: string,
  input: SettleBalanceInput,
  auth: ParticipantAuth
): Promise<SettleBalanceResult> {
  try {
    const response = await fetch(`/api/trips/${tripId}/settlements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(auth) },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      return { ok: false, error: FRIENDLY_ERROR };
    }

    const data = (await response.json()) as {
      balances: TripBalancesResult;
      tripCurrency: string;
    };

    return {
      ok: true,
      balances: data.balances,
      tripCurrency: data.tripCurrency,
    };
  } catch {
    return { ok: false, error: FRIENDLY_ERROR };
  }
}
