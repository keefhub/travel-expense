import { db } from "@/lib/db";
import { getTripBalances } from "@/lib/balances";
import type { BalanceExpenseInput, BalanceSettlementInput } from "@/lib/balances";
import { TRIP_CREATOR_ID } from "@/lib/sharedExpenses";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid settlement." }, { status: 400 });
  }

  try {
    const body = (rawBody ?? {}) as Record<string, unknown>;
    const { id } = await params;

    const trip = await db.trip.findUnique({ where: { id } });

    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 });
    }

    const creatorToken = request.headers.get("x-creator-token");
    const participantToken = request.headers.get("x-participant-token");

    let authorized =
      creatorToken !== null && creatorToken === trip.creatorToken;

    if (!authorized && participantToken !== null) {
      const match = await db.participant.findFirst({
        where: { tripId: id, participantToken },
      });

      authorized = match !== null;
    }

    if (!authorized) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    if (
      body.fromId !== null &&
      (typeof body.fromId !== "string" || body.fromId === "")
    ) {
      return Response.json({ error: "Invalid settlement." }, { status: 400 });
    }

    if (
      body.toId !== null &&
      (typeof body.toId !== "string" || body.toId === "")
    ) {
      return Response.json({ error: "Invalid settlement." }, { status: 400 });
    }

    const fromKey = (body.fromId as string | null) ?? TRIP_CREATOR_ID;
    const toKey = (body.toId as string | null) ?? TRIP_CREATOR_ID;

    if (fromKey === toKey) {
      return Response.json({ error: "Invalid settlement." }, { status: 400 });
    }

    if (
      typeof body.amount !== "number" ||
      !Number.isFinite(body.amount) ||
      (body.amount as number) <= 0
    ) {
      return Response.json(
        { error: "Enter a valid amount greater than zero." },
        { status: 400 }
      );
    }

    // `orderBy` on shares is required, not cosmetic: getTripBalances assigns
    // any rounding remainder to whichever share is last in the array it gets,
    // and Postgres guarantees no row order without an explicit ORDER BY.
    const expenses = await db.expense.findMany({
      where: { tripId: id },
      include: { shares: { orderBy: { id: "asc" } } },
    });

    const rates = await db.exchangeRate.findMany({ where: { tripId: id } });

    const existingSettlements = await db.settlement.findMany({
      where: { tripId: id },
    });

    // Read the snapshot columns rather than the live foreign keys: a departed
    // participant's FK is null but their snapshot survives.
    const balanceExpenses: BalanceExpenseInput[] = expenses.map((expense) => ({
      amount: expense.amount,
      currency: expense.currency,
      payerId: expense.payerParticipantIdSnapshot,
      payerName: expense.payerName,
      shares: expense.shares.map((share) => ({
        id: share.participantIdSnapshot,
        name: share.name,
        amount: share.amount,
      })),
    }));

    const priorSettlements: BalanceSettlementInput[] = existingSettlements.map(
      (s) => ({
        fromId: s.fromId,
        toId: s.toId,
        amount: s.amount,
      })
    );

    const ratePairs = rates.map((r) => ({ currency: r.currency, rate: r.rate }));

    const currentBalances = getTripBalances(
      balanceExpenses,
      trip.currency,
      ratePairs,
      priorSettlements
    );

    const matchingLine = currentBalances.lines.find(
      (line) => line.fromId === fromKey && line.toId === toKey
    );
    const requestedAmount = body.amount as number;

    const amountCents = Math.round(requestedAmount * 100);
    const outstandingCents =
      matchingLine === undefined ? 0 : Math.round(matchingLine.amount * 100);

    if (amountCents <= 0) {
      return Response.json(
        { error: "Enter a valid amount greater than zero." },
        { status: 400 }
      );
    }

    if (amountCents > outstandingCents) {
      return Response.json(
        { error: "This amount is more than the outstanding balance." },
        { status: 400 }
      );
    }

    const amount = amountCents / 100;

    await db.settlement.create({
      data: {
        tripId: id,
        fromId: body.fromId as string | null,
        toId: body.toId as string | null,
        amount,
      },
    });

    const updatedBalances = getTripBalances(
      balanceExpenses,
      trip.currency,
      ratePairs,
      [
        ...priorSettlements,
        {
          fromId: body.fromId as string | null,
          toId: body.toId as string | null,
          amount,
        },
      ]
    );

    return Response.json(
      { balances: updatedBalances, tripCurrency: trip.currency },
      { status: 200 }
    );
  } catch (error) {
    console.error("POST /api/trips/[id]/settlements failed:", error);
    return Response.json(
      { error: "Could not settle the balance." },
      { status: 500 }
    );
  }
}
