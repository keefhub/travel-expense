import type {
  ParticipantSummary,
  SharedExpense,
  SharedExpenseShare,
} from "@/lib/types";
import type { ParticipantAuth } from "@/lib/participants";

export const TRIP_CREATOR_ID = "__creator__";
// Never collides with a Prisma cuid. Represents the trip creator (who has no
// Participant row) in the attribution UI and domain layer. Converted to/from `null`
// only inside the three fetch wrappers below — nowhere else in this module.

export interface AttributionOption {
  id: string; // TRIP_CREATOR_ID, or a real Participant.id
  name: string;
}

export type SplitMethod = "even" | "exact";

export function buildAttributionOptions(
  participants: ParticipantSummary[]
): AttributionOption[] {
  return [
    { id: TRIP_CREATOR_ID, name: "Trip creator" },
    ...participants.map((p) => ({ id: p.id, name: p.name })),
  ];
}

export function calculateEvenSplit(
  totalAmount: number,
  selectedIds: string[]
): Record<string, number> {
  if (selectedIds.length === 0) return {};
  const totalCents = Math.round(totalAmount * 100);
  const n = selectedIds.length;
  const baseCents = Math.floor(totalCents / n);
  const remainderCents = totalCents - baseCents * n;
  const result: Record<string, number> = {};
  selectedIds.forEach((id, index) => {
    const cents =
      index === selectedIds.length - 1 ? baseCents + remainderCents : baseCents;
    result[id] = cents / 100;
  });
  return result;
}

export interface ExactSplitValidation {
  valid: boolean;
  error?: string;
}

export function validateExactSplit(
  totalAmount: number,
  amounts: Record<string, string>,
  selectedIds: string[]
): ExactSplitValidation {
  for (const id of selectedIds) {
    const raw = amounts[id];
    if (
      raw === undefined ||
      raw.trim() === "" ||
      !Number.isFinite(Number(raw.trim())) ||
      Number(raw.trim()) < 0
    ) {
      return {
        valid: false,
        error: "Enter an amount for every selected participant.",
      };
    }
  }

  const sumCents = selectedIds.reduce(
    (sum, id) => sum + Math.round(Number(amounts[id].trim()) * 100),
    0
  );
  const totalCents = Math.round(totalAmount * 100);

  if (sumCents !== totalCents) {
    return { valid: false, error: "The amounts must add up to the total." };
  }

  return { valid: true };
}

export function validateAttribution(
  selectedIds: string[],
  splitMethod: SplitMethod,
  totalAmount: number,
  exactAmounts: Record<string, string>
): { errors: { split?: string } } {
  if (selectedIds.length === 0) {
    return {
      errors: { split: "Select at least one participant for the split." },
    };
  }

  if (splitMethod === "exact") {
    const result = validateExactSplit(totalAmount, exactAmounts, selectedIds);
    if (!result.valid) {
      return { errors: { split: result.error } };
    }
  }

  return { errors: {} };
}

// Structurally identical to the plan's `{ participantId: string | null; amount: number }`
// (a `SharedExpenseShare` without the server-supplied `name` snapshot), expressed via
// Pick so the input shape stays tied to the shared type.
type ShareInput = Pick<SharedExpenseShare, "participantId" | "amount">;

export function toSharesPayload(
  selectedIds: string[],
  splitMethod: SplitMethod,
  totalAmount: number,
  exactAmounts: Record<string, string>
): ShareInput[] {
  const amounts =
    splitMethod === "even"
      ? calculateEvenSplit(totalAmount, selectedIds)
      : Object.fromEntries(
          selectedIds.map((id) => [id, Number(exactAmounts[id].trim())])
        );

  return selectedIds.map((id) => ({
    participantId: id === TRIP_CREATOR_ID ? null : id,
    amount: amounts[id],
  }));
}

export interface CreateSharedExpensePayload {
  amount: number;
  currency: string;
  category: string;
  date: string;
  paymentMethod: string;
  location: string;
  description?: string;
  payerParticipantId: string | null;
  shares: ShareInput[];
}

export type SharedExpenseResult =
  | { ok: true; expense: SharedExpense }
  | { ok: false; error: string };

const FRIENDLY_ERROR =
  "Could not reach the server. Check your connection and try again.";

function authHeaders(auth: ParticipantAuth): Record<string, string> {
  return auth.role === "creator"
    ? { "x-creator-token": auth.token }
    : { "x-participant-token": auth.token };
}

export async function createSharedExpense(
  tripId: string,
  payload: CreateSharedExpensePayload,
  auth: ParticipantAuth
): Promise<SharedExpenseResult> {
  try {
    const response = await fetch(`/api/trips/${tripId}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(auth) },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { ok: false, error: FRIENDLY_ERROR };
    }

    const data = (await response.json()) as { expense: SharedExpense };
    return { ok: true, expense: data.expense };
  } catch {
    return { ok: false, error: FRIENDLY_ERROR };
  }
}

export async function getSharedExpense(
  tripId: string,
  expenseId: string,
  auth: ParticipantAuth
): Promise<SharedExpenseResult> {
  try {
    const response = await fetch(`/api/trips/${tripId}/expenses/${expenseId}`, {
      headers: authHeaders(auth),
    });

    if (!response.ok) {
      return { ok: false, error: FRIENDLY_ERROR };
    }

    const data = (await response.json()) as { expense: SharedExpense };
    return { ok: true, expense: data.expense };
  } catch {
    return { ok: false, error: FRIENDLY_ERROR };
  }
}

export async function updateSharedExpenseAttribution(
  tripId: string,
  expenseId: string,
  payerParticipantId: string | null,
  shares: ShareInput[],
  auth: ParticipantAuth
): Promise<SharedExpenseResult> {
  try {
    const response = await fetch(`/api/trips/${tripId}/expenses/${expenseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(auth) },
      body: JSON.stringify({ payerParticipantId, shares }),
    });

    if (!response.ok) {
      return { ok: false, error: FRIENDLY_ERROR };
    }

    const data = (await response.json()) as { expense: SharedExpense };
    return { ok: true, expense: data.expense };
  } catch {
    return { ok: false, error: FRIENDLY_ERROR };
  }
}
