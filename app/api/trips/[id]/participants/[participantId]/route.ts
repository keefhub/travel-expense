import { db } from "@/lib/db";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; participantId: string }> }
): Promise<Response> {
  try {
    const { id, participantId } = await params;

    const trip = await db.trip.findUnique({ where: { id } });

    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 });
    }

    const target = await db.participant.findUnique({
      where: { id: participantId },
    });

    if (!target || target.tripId !== id) {
      return Response.json({ error: "Participant not found." }, { status: 404 });
    }

    const creatorToken = request.headers.get("x-creator-token");
    const participantToken = request.headers.get("x-participant-token");

    const isCreator =
      creatorToken !== null && creatorToken === trip.creatorToken;
    const isSelf =
      participantToken !== null &&
      participantToken === target.participantToken;

    if (!isCreator && !isSelf) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    await db.participant.delete({ where: { id: participantId } });

    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error(
      "DELETE /api/trips/[id]/participants/[participantId] failed:",
      error
    );
    return Response.json(
      { error: "Could not remove the participant." },
      { status: 500 }
    );
  }
}
