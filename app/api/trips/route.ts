import { db } from "@/lib/db";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid trip data." }, { status: 400 });
  }

  try {
    const { destinationCountry, currency, startDate, endDate, budget } =
      (body as Record<string, unknown>) ?? {};

    if (
      typeof destinationCountry !== "string" ||
      typeof currency !== "string" ||
      typeof startDate !== "string" ||
      typeof endDate !== "string" ||
      Number.isNaN(new Date(startDate).getTime()) ||
      Number.isNaN(new Date(endDate).getTime()) ||
      (budget !== undefined && typeof budget !== "number")
    ) {
      return Response.json({ error: "Invalid trip data." }, { status: 400 });
    }

    const shareToken = crypto.randomUUID();
    const creatorToken = crypto.randomUUID();

    const trip = await db.trip.create({
      data: {
        destinationCountry,
        currency,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        budget,
        shareToken,
        creatorToken,
      },
    });

    return Response.json(
      { id: trip.id, shareToken, creatorToken },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/trips failed:", error);
    return Response.json({ error: "Could not create the trip." }, { status: 500 });
  }
}
