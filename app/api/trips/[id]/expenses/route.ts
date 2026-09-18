import { db } from "@/lib/db";

type ShareInput = { participantId: string | null; amount: number };

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid expense data." }, { status: 400 });
  }

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

    const body = (rawBody ?? {}) as Record<string, unknown>;

    // Field validation, checked in order.
    if (
      typeof body.amount !== "number" ||
      !Number.isFinite(body.amount) ||
      body.amount <= 0
    ) {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    if (typeof body.currency !== "string" || body.currency.trim() === "") {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    if (typeof body.category !== "string" || body.category.trim() === "") {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    if (
      typeof body.date !== "string" ||
      Number.isNaN(new Date(body.date).getTime())
    ) {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    if (
      typeof body.paymentMethod !== "string" ||
      body.paymentMethod.trim() === ""
    ) {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    if (typeof body.location !== "string" || body.location.trim() === "") {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    if (body.description !== undefined && typeof body.description !== "string") {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    if (
      body.payerParticipantId !== null &&
      typeof body.payerParticipantId !== "string"
    ) {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    if (!Array.isArray(body.shares) || body.shares.length === 0) {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    const shareInputs = body.shares as unknown[];

    // Reject any non-object element (null, primitives, nested arrays) before
    // reading properties off it, so malformed input stays a 400 rather than
    // throwing into the 500 handler below.
    const shareObjects = shareInputs.filter(
      (s): s is { participantId: unknown; amount: unknown } =>
        typeof s === "object" && s !== null && !Array.isArray(s)
    );

    if (shareObjects.length !== shareInputs.length) {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    if (
      shareObjects.some(
        (s) =>
          (s.participantId !== null && typeof s.participantId !== "string") ||
          typeof s.amount !== "number" ||
          !Number.isFinite(s.amount) ||
          s.amount < 0
      )
    ) {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    const shareKeys = shareObjects.map(
      (s) => (s.participantId as string | null) ?? "__creator__"
    );

    if (new Set(shareKeys).size !== shareKeys.length) {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    const shares = shareObjects as ShareInput[];

    const sharesCents = shares.reduce(
      (sum, s) => sum + Math.round(s.amount * 100),
      0
    );
    const totalCents = Math.round((body.amount as number) * 100);

    if (sharesCents !== totalCents) {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    const payerParticipantId = body.payerParticipantId as string | null;

    // Referential validation against this trip's participants.
    const referencedIds = Array.from(
      new Set(
        [payerParticipantId, ...shares.map((s) => s.participantId)].filter(
          (pid): pid is string => pid !== null
        )
      )
    );

    const foundParticipants = await db.participant.findMany({
      where: { id: { in: referencedIds }, tripId: id },
    });

    if (foundParticipants.length !== referencedIds.length) {
      return Response.json({ error: "Invalid expense data." }, { status: 400 });
    }

    const nameById = new Map(foundParticipants.map((p) => [p.id, p.name]));

    // Resolve name snapshots.
    const payerName =
      payerParticipantId === null
        ? "Trip creator"
        : nameById.get(payerParticipantId)!;

    const shareRows = shares.map((s) => ({
      participantId: s.participantId,
      participantIdSnapshot: s.participantId,
      name:
        s.participantId === null ? "Trip creator" : nameById.get(s.participantId)!,
      amount: s.amount,
    }));

    const trimmedDescription =
      typeof body.description === "string" ? body.description.trim() : "";

    const expense = await db.expense.create({
      data: {
        tripId: id,
        amount: body.amount as number,
        currency: (body.currency as string).trim(),
        category: (body.category as string).trim(),
        date: new Date(body.date as string),
        paymentMethod: (body.paymentMethod as string).trim(),
        location: (body.location as string).trim(),
        ...(trimmedDescription !== "" ? { description: trimmedDescription } : {}),
        payerParticipantId,
        payerParticipantIdSnapshot: payerParticipantId,
        payerName,
        shares: { create: shareRows },
      },
      include: { shares: true },
    });

    return Response.json(
      {
        expense: {
          id: expense.id,
          tripId: expense.tripId,
          amount: expense.amount,
          currency: expense.currency,
          category: expense.category,
          date: expense.date.toISOString().slice(0, 10),
          paymentMethod: expense.paymentMethod,
          location: expense.location,
          ...(expense.description !== null
            ? { description: expense.description }
            : {}),
          payerParticipantId: expense.payerParticipantIdSnapshot,
          payerName: expense.payerName,
          shares: expense.shares.map((s) => ({
            participantId: s.participantIdSnapshot,
            name: s.name,
            amount: s.amount,
          })),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/trips/[id]/expenses failed:", error);
    return Response.json(
      { error: "Could not save the expense." },
      { status: 500 }
    );
  }
}
