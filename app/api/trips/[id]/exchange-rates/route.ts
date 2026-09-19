import { db } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid exchange rate." }, { status: 400 });
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
      typeof body.currency !== "string" ||
      (body.currency as string).trim() === ""
    ) {
      return Response.json({ error: "Invalid exchange rate." }, { status: 400 });
    }

    if (
      typeof body.rate !== "number" ||
      !Number.isFinite(body.rate) ||
      (body.rate as number) <= 0
    ) {
      return Response.json({ error: "Invalid exchange rate." }, { status: 400 });
    }

    const currency = (body.currency as string).trim();
    const rate = body.rate as number;

    const exchangeRate = await db.exchangeRate.upsert({
      where: { tripId_currency: { tripId: id, currency } },
      update: { rate },
      create: { tripId: id, currency, rate },
    });

    return Response.json(
      {
        exchangeRate: {
          id: exchangeRate.id,
          tripId: exchangeRate.tripId,
          currency: exchangeRate.currency,
          rate: exchangeRate.rate,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("PUT /api/trips/[id]/exchange-rates failed:", error);
    return Response.json(
      { error: "Could not save the exchange rate." },
      { status: 500 }
    );
  }
}
