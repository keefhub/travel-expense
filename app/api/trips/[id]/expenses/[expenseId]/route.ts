import { db } from "@/lib/db";

type ShareInput = { participantId: string | null; amount: number };

function serialize(expense: {
  id: string;
  tripId: string;
  amount: number;
  currency: string;
  category: string;
  date: Date;
  paymentMethod: string;
  location: string;
  description: string | null;
  payerParticipantId: string | null;
  payerName: string;
  shares: { participantId: string | null; name: string; amount: number }[];
}) {
  return {
    id: expense.id,
    tripId: expense.tripId,
    amount: expense.amount,
    currency: expense.currency,
    category: expense.category,
    date: expense.date.toISOString().slice(0, 10),
    paymentMethod: expense.paymentMethod,
    location: expense.location,
    ...(expense.description !== null ? { description: expense.description } : {}),
    payerParticipantId: expense.payerParticipantId,
    payerName: expense.payerName,
    shares: expense.shares.map((s) => ({
      participantId: s.participantId,
      name: s.name,
      amount: s.amount,
    })),
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
): Promise<Response> {
  try {
    const { id, expenseId } = await params;

    const trip = await db.trip.findUnique({ where: { id } });

    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 });
    }

    const expense = await db.expense.findUnique({
      where: { id: expenseId },
      include: { shares: true },
    });

    if (!expense || expense.tripId !== id) {
      return Response.json({ error: "Expense not found." }, { status: 404 });
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

    return Response.json({ expense: serialize(expense) }, { status: 200 });
  } catch (error) {
    console.error("GET /api/trips/[id]/expenses/[expenseId] failed:", error);
    return Response.json(
      { error: "Could not load the expense." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; expenseId: string }> }
): Promise<Response> {
  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid expense data." }, { status: 400 });
  }

  try {
    const { id, expenseId } = await params;

    const trip = await db.trip.findUnique({ where: { id } });

    if (!trip) {
      return Response.json({ error: "Trip not found." }, { status: 404 });
    }

    const existing = await db.expense.findUnique({ where: { id: expenseId } });

    if (!existing || existing.tripId !== id) {
      return Response.json({ error: "Expense not found." }, { status: 404 });
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

    // Field validation, checked in order. This endpoint updates only the
    // payer and the split; every other expense field is ignored if sent.
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

    // The split must still sum to the expense's stored amount, which this
    // endpoint never changes.
    const sharesCents = shares.reduce(
      (sum, s) => sum + Math.round(s.amount * 100),
      0
    );

    if (sharesCents !== Math.round(existing.amount * 100)) {
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
      name:
        s.participantId === null ? "Trip creator" : nameById.get(s.participantId)!,
      amount: s.amount,
    }));

    const updated = await db.$transaction(async (tx) => {
      await tx.expenseShare.deleteMany({ where: { expenseId } });
      return tx.expense.update({
        where: { id: expenseId },
        data: {
          payerParticipantId,
          payerName,
          shares: { create: shareRows },
        },
        include: { shares: true },
      });
    });

    return Response.json({ expense: serialize(updated) }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/trips/[id]/expenses/[expenseId] failed:", error);
    return Response.json(
      { error: "Could not update the expense." },
      { status: 500 }
    );
  }
}
