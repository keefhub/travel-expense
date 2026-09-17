import { db } from "@/lib/db";

// Helper to resolve a shared trip by token
async function resolveTrip(token: string) {
  return db.trip.findUnique({ where: { shareToken: token } });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  try {
    const { token } = await params;
    const trip = await resolveTrip(token);

    if (!trip) {
      return Response.json({ error: "This link isn't valid." }, { status: 404 });
    }

    return Response.json(
      {
        id: trip.id,
        destinationCountry: trip.destinationCountry,
        currency: trip.currency,
        startDate: trip.startDate.toISOString().slice(0, 10),
        endDate: trip.endDate.toISOString().slice(0, 10),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/join/[token] failed:", error);
    return Response.json(
      { error: "Could not look up this link." },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid join request." }, { status: 400 });
  }

  try {
    const { token } = await params;
    const trip = await resolveTrip(token);

    if (!trip) {
      return Response.json({ error: "This link isn't valid." }, { status: 404 });
    }

    const { name } = (body as Record<string, unknown>) ?? {};

    if (typeof name !== "string" || name.trim() === "") {
      return Response.json({ error: "Enter your name to join." }, { status: 400 });
    }

    const trimmedName = name.trim().slice(0, 50);

    const participant = await db.participant.create({
      data: {
        tripId: trip.id,
        name: trimmedName,
        participantToken: crypto.randomUUID(),
      },
    });

    return Response.json(
      {
        participantId: participant.id,
        participantToken: participant.participantToken,
        trip: {
          id: trip.id,
          destinationCountry: trip.destinationCountry,
          currency: trip.currency,
          startDate: trip.startDate.toISOString().slice(0, 10),
          endDate: trip.endDate.toISOString().slice(0, 10),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/join/[token] failed:", error);
    return Response.json({ error: "Could not join the trip." }, { status: 500 });
  }
}
