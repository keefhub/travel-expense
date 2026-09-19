import { db } from "@/lib/db";
import { getTripBalances } from "@/lib/balances";
import type { BalanceExpenseInput } from "@/lib/balances";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
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

    // `orderBy` on shares is required, not cosmetic: getTripBalances assigns
    // any rounding remainder to whichever share is last in the array it gets,
    // and Postgres guarantees no row order without an explicit ORDER BY.
    const expenses = await db.expense.findMany({
      where: { tripId: id },
      include: { shares: { orderBy: { id: "asc" } } },
    });

    const rates = await db.exchangeRate.findMany({ where: { tripId: id } });

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

    const balances = getTripBalances(
      balanceExpenses,
      trip.currency,
      rates.map((r) => ({ currency: r.currency, rate: r.rate }))
    );

    return Response.json(
      { balances, tripCurrency: trip.currency },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/trips/[id]/balances failed:", error);
    return Response.json({ error: "Could not load balances." }, { status: 500 });
  }
}
