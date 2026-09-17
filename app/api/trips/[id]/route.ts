import { db } from "@/lib/db";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await params;
    const creatorToken = request.headers.get("x-creator-token");

    const trip = await db.trip.findUnique({ where: { id } });

    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 });
    }

    if (!creatorToken || creatorToken !== trip.creatorToken) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    await db.trip.delete({ where: { id } });

    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/trips/[id] failed:", error);
    return Response.json(
      { error: "Could not delete the trip." },
      { status: 500 }
    );
  }
}
