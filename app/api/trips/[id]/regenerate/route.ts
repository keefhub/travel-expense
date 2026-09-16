import { db } from "@/lib/db";

export async function POST(
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

    const shareToken = crypto.randomUUID();

    await db.trip.update({
      where: { id },
      data: { shareToken },
    });

    return Response.json({ shareToken }, { status: 200 });
  } catch (error) {
    console.error("POST /api/trips/[id]/regenerate failed:", error);
    return Response.json(
      { error: "Could not regenerate the link." },
      { status: 500 }
    );
  }
}
