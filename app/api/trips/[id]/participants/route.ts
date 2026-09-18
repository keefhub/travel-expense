import { db } from "@/lib/db";

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

    const participants = await db.participant.findMany({
      where: { tripId: id },
      orderBy: { createdAt: "asc" },
    });

    return Response.json(
      { participants: participants.map((p) => ({ id: p.id, name: p.name })) },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/trips/[id]/participants failed:", error);
    return Response.json(
      { error: "Could not load participants." },
      { status: 500 }
    );
  }
}
