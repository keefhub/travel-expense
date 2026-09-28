# 020. Attribute an Expense to Payer and Split — Implementation Plan

**Status:** In Progress
**Source:** `doc/features/020-attribute-an-expense-to-payer-and-split/spec.md` (from `features/020.attribute-an-expense-to-payer-and-split.md`)
**Goal:** Let a shared trip's creator or any current participant record who paid for an expense
and how it's split (evenly or by exact amount) among current members, view that attribution later
even after a member departs, and edit an existing expense's payer/split — while a solo (unshared)
trip's expense form stays exactly as feature 005 left it.

**Architecture:**
No shared-trip expense entity exists anywhere yet — feature 019 confirmed `prisma/schema.prisma`
has only `Trip` and `Participant`, and every expense (solo or shared) still lives only in
`localStorage`. This plan adds two Prisma models, `Expense` and `ExpenseShare`, with nullable
`onDelete: SetNull` foreign keys to `Participant` plus a denormalized name snapshot on each, so a
removed/left participant (019's existing hard `db.participant.delete()`, unchanged) still shows by
name on any expense they were attributed to. The trip creator has no `Participant` row (019's
`ManageParticipants.tsx` already shows them only as a fixed "Trip creator" label); this plan
represents them with a client-side sentinel id, `TRIP_CREATOR_ID`, translated to/from `null` only
at the API boundary. A new `POST /api/trips/[id]/expenses` and a combined
`GET`/`PATCH /api/trips/[id]/expenses/[expenseId]` reuse 016/017/019's existing
`x-creator-token`/`x-participant-token` auth pattern exactly. Client-side, `lib/sharedExpenses.ts`
owns split-calculation, attribution validation, and the fetch wrappers; two new components,
`SharedExpenseForm` and `SharedExpenseDetail`, each resolve their own viewing-device role from
local storage on mount — the same technique `ManageParticipants.tsx` (019) already uses — rather
than trusting a route wrapper to hand them an identity. Two new routes,
`/trips/[token]/expenses/new` and `/trips/[token]/expenses/[expenseId]`, are two-line wrappers
mounting those components, mirroring `app/trips/[token]/participants/page.tsx`'s existing shape.
The existing `/expenses/new` route gains a one-line redirect so a creator whose local trip already
has a share link lands in the new flow instead of the untouched solo `ExpenseForm`.

Per spec.md §6 Challenge #1, this plan does **not** build any general expense-field edit
capability — `app/expenses/[id]/page.tsx` stays view-only exactly as it is today; the only editable
surface this plan adds is a shared-trip expense's payer/split attribution. Per spec.md §7 Open
Item 1, this plan does **not** touch `components/Dashboard.tsx` — a shared trip's creator will not
see server-recorded expenses on their local dashboard after this ships; that gap is explicitly
deferred to feature 021. Per spec.md §1.6, this plan does **not** add any list or browse screen for
a shared trip's expenses — the two new routes are reached only by direct URL (the record form's own
post-save redirect, or a future balances view).

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Reuses features 016/017/019's Prisma + `@prisma/adapter-neon` + `@neondatabase/serverless`
dependencies and `lib/db.ts` singleton — no new package. One schema migration (Task 2) adds
`Expense`/`ExpenseShare`. Verification: `npm run lint`, `npx tsc --noEmit`, `npm run build`
(route-touching tasks), `npx playwright test e2e/020-attribute-an-expense-to-payer-and-split.spec.ts`
(behavioral gate).

> **Infrastructure note.** This plan needs no new `DATABASE_URL` — features 016/017 already
> provisioned a real, reachable Neon database. Task 2's migration is not expected to block on
> connectivity; if it does, record it in `log.txt` exactly as 017's Task 3 documented its own
> equivalent block, and resume once resolved.

> **Methodology note on "red steps."** Several tasks below create a file with no existing TS
> consumer yet in that same task (a Route Handler invoked only over HTTP, or a component not yet
> mounted). Where no real call site exists in-task, the step is written as implement-then-verify-green
> instead, exactly as features 016/017/019 landed their own not-yet-mounted domain modules and
> components. This is noted per-task, not silently skipped.

---

### Task 1: [Types] — `lib/types.ts` gains `SharedExpense`/`SharedExpenseShare`

**Files**
- modify: `lib/types.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (foundational addition with no consumer yet in this task, mirrors 019's Task 1 for
`ParticipantSummary`).

- [x] **Step 1 — Add the types.** Append after the existing `ParticipantSummary` interface (the
      last declaration in the file):
      ```ts
      export interface SharedExpenseShare {
        participantId: string | null; // null = the trip creator
        name: string; // snapshot at attribution time; survives participant removal
        amount: number;
      }

      export interface SharedExpense {
        id: string;
        tripId: string;
        amount: number;
        currency: string;
        category: string;
        date: string; // "YYYY-MM-DD"
        paymentMethod: string;
        location: string;
        description?: string;
        payerParticipantId: string | null; // null = the trip creator
        payerName: string; // snapshot, same rationale as SharedExpenseShare.name
        shares: SharedExpenseShare[];
      }
      ```
      Do not modify any existing type in this file.

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(020): add SharedExpense and SharedExpenseShare types`

---

### Task 2: [Config] — Prisma schema gains `Expense`/`ExpenseShare`

**Files**
- modify: `prisma/schema.prisma`
- test: `npx prisma generate`, `npx prisma migrate dev --name add_expense_and_expense_share`,
  `npx tsc --noEmit`, `npm run lint`

- [x] **Step 1 — Add the relation fields to the two existing models.** Inside the existing
      `model Trip { ... }` block, add one new field as the last line before the closing brace:
      ```prisma
        expenses           Expense[]
      ```
      Inside the existing `model Participant { ... }` block, add two new fields as the last lines
      before the closing brace (after the existing `@@index([tripId])` line):
      ```prisma
        expensesPaid     Expense[]      @relation("ExpensePayer")
        expenseShares    ExpenseShare[] @relation("ExpenseShareParticipant")
      ```
      Do not modify any existing field on either model.

- [x] **Step 2 — Append the two new models**, after `Participant`'s closing brace:
      ```prisma
      model Expense {
        id                 String   @id @default(cuid())
        tripId             String
        trip               Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
        amount             Float
        currency           String
        category           String
        date               DateTime
        paymentMethod      String
        location           String
        description        String?
        payerParticipantId String?
        payer              Participant?   @relation("ExpensePayer", fields: [payerParticipantId], references: [id], onDelete: SetNull)
        payerName          String
        shares             ExpenseShare[]
        createdAt          DateTime @default(now())
        @@index([tripId])
      }

      model ExpenseShare {
        id            String       @id @default(cuid())
        expenseId     String
        expense       Expense      @relation(fields: [expenseId], references: [id], onDelete: Cascade)
        participantId String?
        participant   Participant? @relation("ExpenseShareParticipant", fields: [participantId], references: [id], onDelete: SetNull)
        name          String
        amount        Float
        @@index([expenseId])
      }
      ```
      `onDelete: SetNull` on both `payer` and `participant` is required — feature 019's existing
      `DELETE /api/trips/[id]/participants/[participantId]` route performs a hard
      `db.participant.delete()` with no application-level cleanup of related rows, and must keep
      succeeding even when the removed participant has expense history.

- [x] **Step 3 — Regenerate the Prisma Client.**
      `npx prisma generate`
      Expected: exit 0, output containing "Generated Prisma Client".

- [x] **Step 4 — Apply the migration.**
      `npx prisma migrate dev --name add_expense_and_expense_share`
      Expected: exit 0, output confirming the migration was applied and a new
      `prisma/migrations/<timestamp>_add_expense_and_expense_share/migration.sql` file was created.

- [x] **Step 5 — Regression.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 6 — Commit.**
      Message: `feat(020): add Expense and ExpenseShare models to the Prisma schema`

---

### Task 3: [Domain] — `lib/sharedExpenses.ts`

**Files**
- create: `lib/sharedExpenses.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (no consumer until Tasks 7/9, mirrors `lib/participants.ts`'s own landing in feature
019).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: lib/sharedExpenses.ts (create)
      Imports:
        import type { SharedExpense, SharedExpenseShare } from "@/lib/types";
        import type { ParticipantSummary } from "@/lib/types";
        import type { ParticipantAuth } from "@/lib/participants";

      Exports — constants and pure types:
        export const TRIP_CREATOR_ID = "__creator__";
        // Never collides with a Prisma cuid. Represents the trip creator (who has no
        // Participant row) in the attribution UI and domain layer. Converted to/from `null`
        // only inside the three fetch wrappers below — nowhere else in this module.

        export interface AttributionOption {
          id: string; // TRIP_CREATOR_ID, or a real Participant.id
          name: string;
        }

        export type SplitMethod = "even" | "exact";

      Export — buildAttributionOptions(participants: ParticipantSummary[]): AttributionOption[]
        Returns [{ id: TRIP_CREATOR_ID, name: "Trip creator" }, ...participants.map((p) => ({
        id: p.id, name: p.name }))] — the creator entry always first, participants in the
        exact order the `participants` array was given (do not sort).

      Export — calculateEvenSplit(totalAmount: number, selectedIds: string[]):
        Record<string, number>
        Literal implementation (exactness matters — a hand-written variant is likely to drop the
        remainder or produce shares that don't sum to totalAmount):
        ```ts
        export function calculateEvenSplit(
          totalAmount: number,
          selectedIds: string[],
        ): Record<string, number> {
          if (selectedIds.length === 0) return {};
          const totalCents = Math.round(totalAmount * 100);
          const n = selectedIds.length;
          const baseCents = Math.floor(totalCents / n);
          const remainderCents = totalCents - baseCents * n;
          const result: Record<string, number> = {};
          selectedIds.forEach((id, index) => {
            const cents = index === selectedIds.length - 1 ? baseCents + remainderCents : baseCents;
            result[id] = cents / 100;
          });
          return result;
        }
        ```
        Every id in `selectedIds` except the LAST one gets `baseCents / 100`; the last one
        absorbs the full remainder. The returned amounts always sum to exactly `totalAmount`
        (verified: totalAmount=10.00, 3 ids -> baseCents=333, remainderCents=1 ->
        [3.33, 3.33, 3.34], sum=10.00).

      Export interface ExactSplitValidation:
        export interface ExactSplitValidation { valid: boolean; error?: string }

      Export — validateExactSplit(totalAmount: number, amounts: Record<string, string>,
        selectedIds: string[]): ExactSplitValidation
        Behavior, checked in this exact order:
        1. For each id in selectedIds: let raw = amounts[id]. If raw === undefined, OR
           raw.trim() === "", OR !Number.isFinite(Number(raw.trim())), OR Number(raw.trim()) < 0
           -> return { valid: false, error: "Enter an amount for every selected participant." }
           (stop at the first such id found, in selectedIds order).
        2. Otherwise, sum the parsed amounts in integer cents:
           `const sumCents = selectedIds.reduce((sum, id) => sum + Math.round(Number(amounts[id].trim()) * 100), 0);`
           `const totalCents = Math.round(totalAmount * 100);`
           If sumCents !== totalCents -> return { valid: false, error: "The amounts must add up to the total." }
        3. Otherwise -> return { valid: true }

      Export — validateAttribution(selectedIds: string[], splitMethod: SplitMethod,
        totalAmount: number, exactAmounts: Record<string, string>): { errors: { split?: string } }
        Behavior, checked in this exact order:
        1. If selectedIds.length === 0 -> return { errors: { split: "Select at least one participant for the split." } }
        2. Else if splitMethod === "exact": const result = validateExactSplit(totalAmount, exactAmounts, selectedIds);
           if !result.valid -> return { errors: { split: result.error } }
        3. Otherwise (splitMethod === "even", or exact validation passed) -> return { errors: {} }

      Export — toSharesPayload(selectedIds: string[], splitMethod: SplitMethod,
        totalAmount: number, exactAmounts: Record<string, string>):
        { participantId: string | null; amount: number }[]
        Behavior:
          const amounts = splitMethod === "even"
            ? calculateEvenSplit(totalAmount, selectedIds)
            : Object.fromEntries(selectedIds.map((id) => [id, Number(exactAmounts[id].trim())]));
          return selectedIds.map((id) => ({
            participantId: id === TRIP_CREATOR_ID ? null : id,
            amount: amounts[id],
          }));
        Caller's responsibility to have already validated via validateAttribution before calling
        this — it does not itself re-validate.

      Export interface CreateSharedExpensePayload:
        export interface CreateSharedExpensePayload {
          amount: number;
          currency: string;
          category: string;
          date: string;
          paymentMethod: string;
          location: string;
          description?: string;
          payerParticipantId: string | null;
          shares: { participantId: string | null; amount: number }[];
        }

      Export type SharedExpenseResult:
        export type SharedExpenseResult =
          | { ok: true; expense: SharedExpense }
          | { ok: false; error: string };

      Module-level constant (not exported):
        const FRIENDLY_ERROR =
          "Could not reach the server. Check your connection and try again.";
      (the exact string lib/join.ts, lib/sharedTrip.ts, and lib/participants.ts already use —
      reuse verbatim, do not write a new phrase)

      Local, unexported helper (duplicate lib/participants.ts's own — do not import it, that
      function is not exported from lib/participants.ts):
        function authHeaders(auth: ParticipantAuth): Record<string, string> {
          return auth.role === "creator"
            ? { "x-creator-token": auth.token }
            : { "x-participant-token": auth.token };
        }

      Export — createSharedExpense(tripId: string, payload: CreateSharedExpensePayload,
        auth: ParticipantAuth): Promise<SharedExpenseResult>
        `fetch(\`/api/trips/${tripId}/expenses\`, { method: "POST", headers: {
        "Content-Type": "application/json", ...authHeaders(auth) }, body:
        JSON.stringify(payload) })`. If the fetch throws, OR response.ok is false, return
        { ok: false, error: FRIENDLY_ERROR } — do not distinguish a thrown fetch from a
        non-2xx response. Otherwise parse the JSON body as `{ expense: SharedExpense }` and
        return { ok: true, expense: data.expense }.

      Export — getSharedExpense(tripId: string, expenseId: string, auth: ParticipantAuth):
        Promise<SharedExpenseResult>
        `fetch(\`/api/trips/${tripId}/expenses/${expenseId}\`, { headers: authHeaders(auth) })`.
        Same collapsed error handling as createSharedExpense. Otherwise parse as
        `{ expense: SharedExpense }` and return { ok: true, expense: data.expense }.

      Export — updateSharedExpenseAttribution(tripId: string, expenseId: string,
        payerParticipantId: string | null,
        shares: { participantId: string | null; amount: number }[],
        auth: ParticipantAuth): Promise<SharedExpenseResult>
        `fetch(\`/api/trips/${tripId}/expenses/${expenseId}\`, { method: "PATCH", headers: {
        "Content-Type": "application/json", ...authHeaders(auth) }, body: JSON.stringify({
        payerParticipantId, shares }) })`. Same collapsed error handling. Otherwise parse as
        `{ expense: SharedExpense }` and return { ok: true, expense: data.expense }.

      Constraints: no function in this file touches localStorage or imports lib/storage.ts or
                   lib/db.ts — this module is pure calculation plus a network wrapper, mirroring
                   lib/participants.ts. Must not modify lib/participants.ts, lib/expenses.ts, or
                   lib/types.ts.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(020): add lib/sharedExpenses, split calculation and the expense-attribution client wrapper`

---

### Task 4: [Route] — `POST /api/trips/[id]/expenses` creates a shared expense

**Files**
- create: `app/api/trips/[id]/expenses/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step — a Route Handler is invoked over HTTP, not via a TS import; its correctness is
proven by `npm run build` here and by Task 13's Playwright coverage.

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/api/trips/[id]/expenses/route.ts (create)
      Exports: POST(request: Request, { params }: { params: Promise<{ id: string }> }):
                 Promise<Response>
      Import: import { db } from "@/lib/db";

      Expected request body shape (untyped `unknown`, validated below):
        { amount: number; currency: string; category: string; date: string;
          paymentMethod: string; location: string; description?: string;
          payerParticipantId: string | null;
          shares: { participantId: string | null; amount: number }[] }

      Behavior, in this exact order:

      1. Parse the body in its own try/catch, separate from the handler's main try/catch:
         ```ts
         let body: any;
         try {
           body = await request.json();
         } catch {
           return Response.json({ error: "Invalid expense data." }, { status: 400 });
         }
         ```

      2. Inside a second try/catch (the handler's main one, whose catch block is step 9 below):
         a. `const { id } = await params;`
         b. `const trip = await db.trip.findUnique({ where: { id } });`
            trip is null -> `return Response.json({ error: "Trip not found." }, { status: 404 });`

      3. Auth check, run BEFORE any field validation (identical shape to
         `app/api/trips/[id]/participants/route.ts`'s existing `GET` handler — that route checks
         auth immediately after the trip lookup, and this handler matches that order):
         ```ts
         const creatorToken = request.headers.get("x-creator-token");
         const participantToken = request.headers.get("x-participant-token");
         let authorized = creatorToken !== null && creatorToken === trip.creatorToken;
         if (!authorized && participantToken !== null) {
           const match = await db.participant.findFirst({ where: { tripId: id, participantToken } });
           authorized = match !== null;
         }
         if (!authorized) return Response.json({ error: "Not authorized." }, { status: 403 });
         ```

      4. Field validation — every check below that fails returns
         `Response.json({ error: "Invalid expense data." }, { status: 400 })` immediately,
         checked in this order:
         a. `typeof body.amount !== "number" || !Number.isFinite(body.amount) || body.amount <= 0`
         b. `typeof body.currency !== "string" || body.currency.trim() === ""`
         c. `typeof body.category !== "string" || body.category.trim() === ""`
         d. `typeof body.date !== "string" || Number.isNaN(new Date(body.date).getTime())`
         e. `typeof body.paymentMethod !== "string" || body.paymentMethod.trim() === ""`
         f. `typeof body.location !== "string" || body.location.trim() === ""`
         g. `body.description !== undefined && typeof body.description !== "string"`
         h. `body.payerParticipantId !== null && typeof body.payerParticipantId !== "string"`
         i. `!Array.isArray(body.shares) || body.shares.length === 0`
         ~~j. `body.shares.some((s: any) => (s.participantId !== null && typeof s.participantId !== "string") || typeof s.amount !== "number" || !Number.isFinite(s.amount) || s.amount < 0)`~~
            Shipped instead with a leading non-object-element guard returning 400 before any property
            read: the literal `(s: any)` form above throws a TypeError on a `null` element in `shares`
            and answers 500 rather than 400. See log.txt, Task 4 (fix cycle 1).
         k. Duplicate check: `const shareKeys = body.shares.map((s: any) => s.participantId ?? "__creator__"); if (new Set(shareKeys).size !== shareKeys.length) -> 400 "Invalid expense data."`
            (rejects a payload with two share rows for the same participant, or two rows both
            using `participantId: null` for the creator)
         l. Sum check: `const sharesCents = body.shares.reduce((sum: number, s: any) => sum + Math.round(s.amount * 100), 0); const totalCents = Math.round(body.amount * 100); if (sharesCents !== totalCents) -> 400 "Invalid expense data."`

      5. Referential validation — collect every distinct non-null participant id referenced by
         `body.payerParticipantId` and `body.shares[].participantId` into one array, then:
         ```ts
         const referencedIds = Array.from(new Set(
           [body.payerParticipantId, ...body.shares.map((s: any) => s.participantId)]
             .filter((pid): pid is string => pid !== null)
         ));
         const foundParticipants = await db.participant.findMany({
           where: { id: { in: referencedIds }, tripId: id },
         });
         if (foundParticipants.length !== referencedIds.length) {
           return Response.json({ error: "Invalid expense data." }, { status: 400 });
         }
         const nameById = new Map(foundParticipants.map((p) => [p.id, p.name]));
         ```

      6. Resolve name snapshots:
         ```ts
         const payerName = body.payerParticipantId === null
           ? "Trip creator"
           : nameById.get(body.payerParticipantId)!;
         const shareRows = body.shares.map((s: any) => ({
           participantId: s.participantId,
           name: s.participantId === null ? "Trip creator" : nameById.get(s.participantId)!,
           amount: s.amount,
         }));
         ```

      7. Create the expense with its shares in one nested write:
         ```ts
         const trimmedDescription = typeof body.description === "string" ? body.description.trim() : "";
         const expense = await db.expense.create({
           data: {
             tripId: id,
             amount: body.amount,
             currency: body.currency.trim(),
             category: body.category.trim(),
             date: new Date(body.date),
             paymentMethod: body.paymentMethod.trim(),
             location: body.location.trim(),
             ...(trimmedDescription !== "" ? { description: trimmedDescription } : {}),
             payerParticipantId: body.payerParticipantId,
             payerName,
             shares: { create: shareRows },
           },
           include: { shares: true },
         });
         ```

      8. Respond 201 with the serialized shape:
         ```ts
         return Response.json({
           expense: {
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
           },
         }, { status: 201 });
         ```

      9. catch (error) block for the main try (step 2 onward):
         `console.error("POST /api/trips/[id]/expenses failed:", error);`
         `return Response.json({ error: "Could not save the expense." }, { status: 500 });`

      Constraints: never import lib/storage.ts (server-only file; must not read localStorage).
                   `params` is a Promise, same convention as every existing dynamic Route Handler
                   in this repo. Do not touch app/api/trips/[id]/participants/route.ts or
                   app/api/trips/[id]/participants/[participantId]/route.ts.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/expenses`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(020): add POST /api/trips/[id]/expenses`

---

### Task 5: [Route] — `GET`/`PATCH /api/trips/[id]/expenses/[expenseId]`

**Files**
- create: `app/api/trips/[id]/expenses/[expenseId]/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step — same reasoning as Task 4.

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/api/trips/[id]/expenses/[expenseId]/route.ts (create)
      Import: import { db } from "@/lib/db";

      Local, unexported helper shared by both handlers below:
        function serialize(expense: {
          id: string; tripId: string; amount: number; currency: string; category: string;
          date: Date; paymentMethod: string; location: string; description: string | null;
          payerParticipantId: string | null; payerName: string;
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
              participantId: s.participantId, name: s.name, amount: s.amount,
            })),
          };
        }

      Export — GET(request: Request, { params }: { params: Promise<{ id: string; expenseId: string }> }):
        Promise<Response>
        Behavior, in this exact order, inside one try/catch:
        1. `const { id, expenseId } = await params;`
        2. `const trip = await db.trip.findUnique({ where: { id } });`
           trip is null -> `return Response.json({ error: "Trip not found." }, { status: 404 });`
        3. `const expense = await db.expense.findUnique({ where: { id: expenseId }, include: { shares: true } });`
           expense is null OR `expense.tripId !== id` ->
           `return Response.json({ error: "Expense not found." }, { status: 404 });`
        4. Auth check — identical shape to Task 4 step 3 above (creatorToken/participantToken,
           same variable names and same order), using `trip.creatorToken` and
           `db.participant.findFirst({ where: { tripId: id, participantToken } })`.
           Not authorized -> `Response.json({ error: "Not authorized." }, { status: 403 });`
        5. `return Response.json({ expense: serialize(expense) }, { status: 200 });`
        catch (error): `console.error("GET /api/trips/[id]/expenses/[expenseId] failed:", error);`
        `return Response.json({ error: "Could not load the expense." }, { status: 500 });`

      Export — PATCH(request: Request, { params }: { params: Promise<{ id: string; expenseId: string }> }):
        Promise<Response>

      Expected request body shape: { payerParticipantId: string | null;
        shares: { participantId: string | null; amount: number }[] }
      (this endpoint updates ONLY these two fields — amount, currency, category, date,
      paymentMethod, location, and description are never read from the body and never changed)

      Behavior, in this exact order:
        1. Parse the body in its own try/catch, exactly as Task 4 step 1:
           malformed -> `Response.json({ error: "Invalid expense data." }, { status: 400 })`
        2. Inside the main try/catch:
           a. `const { id, expenseId } = await params;`
           b. trip lookup, same as GET step 2 above -> 404 "Trip not found."
           c. `const existing = await db.expense.findUnique({ where: { id: expenseId } });`
              existing is null OR `existing.tripId !== id` -> 404 "Expense not found."
           d. Auth check — identical to GET step 4 -> 403 "Not authorized."
        3. Field validation, in this order, each failure returning 400 "Invalid expense data.":
           a. `body.payerParticipantId !== null && typeof body.payerParticipantId !== "string"`
           b. `!Array.isArray(body.shares) || body.shares.length === 0`
           c. `body.shares.some((s: any) => (s.participantId !== null && typeof s.participantId !== "string") || typeof s.amount !== "number" || !Number.isFinite(s.amount) || s.amount < 0)`
              NOTE (added after Task 4's fix cycle): this literal `(s: any)` form throws a TypeError on
              a `null` element in `shares` and turns bad input into a 500. Precede it with a
              non-object-element guard that returns 400 "Invalid expense data." before any property
              read — see log.txt, Task 4.
           d. Duplicate check — identical approach to Task 4 step 4k:
              `const shareKeys = body.shares.map((s: any) => s.participantId ?? "__creator__"); if (new Set(shareKeys).size !== shareKeys.length) -> 400`
           e. Sum check against the EXISTING expense's amount (not any value from the body):
              `const sharesCents = body.shares.reduce((sum: number, s: any) => sum + Math.round(s.amount * 100), 0); if (sharesCents !== Math.round(existing.amount * 100)) -> 400`
        4. Referential validation — identical approach to Task 4 step 5, using
           `body.payerParticipantId` and `body.shares[].participantId`, scoped to `tripId: id` ->
           400 "Invalid expense data." on any unresolved id.
        5. Resolve name snapshots — identical approach to Task 4 step 6.
        6. Replace the shares and update the payer inside a transaction:
           ```ts
           const updated = await db.$transaction(async (tx) => {
             await tx.expenseShare.deleteMany({ where: { expenseId } });
             return tx.expense.update({
               where: { id: expenseId },
               data: {
                 payerParticipantId: body.payerParticipantId,
                 payerName,
                 shares: { create: shareRows },
               },
               include: { shares: true },
             });
           });
           ```
        7. `return Response.json({ expense: serialize(updated) }, { status: 200 });`
        catch (error) — wraps steps 2 onward (not the body-parse step):
        `console.error("PATCH /api/trips/[id]/expenses/[expenseId] failed:", error);`
        `return Response.json({ error: "Could not update the expense." }, { status: 500 });`

      Constraints: PATCH must never modify `amount`, `currency`, `category`, `date`,
                   `paymentMethod`, `location`, or `description` — only `payerParticipantId`,
                   `payerName`, and the `shares` relation. Never import lib/storage.ts. Do not
                   touch app/api/trips/[id]/expenses/route.ts (Task 4) or either participants
                   route.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/expenses/[expenseId]`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(020): add GET and PATCH /api/trips/[id]/expenses/[expenseId]`

---

### Task 6: [UI] — `components/AttributionFields.tsx`

**Files**
- create: `components/AttributionFields.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (not mounted until Tasks 7/9, mirrors `components/ConfirmParticipantAction.tsx`'s own
landing in feature 019).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: components/AttributionFields.tsx (create, 'use client')
      Exports: default function AttributionFields(props: {
        options: AttributionOption[]; // from lib/sharedExpenses.ts; always has TRIP_CREATOR_ID first
        totalAmount: number;
        payerId: string;
        onPayerChange: (id: string) => void;
        splitMethod: SplitMethod;
        onSplitMethodChange: (method: SplitMethod) => void;
        selectedIds: string[];
        onSelectedIdsChange: (ids: string[]) => void;
        exactAmounts: Record<string, string>;
        onExactAmountsChange: (amounts: Record<string, string>) => void;
        error?: string;
      }): JSX.Element

      Imports:
        import type { JSX } from "react";
        // React 19's types no longer declare a global JSX namespace, so the return type below
        // is imported from "react" rather than referenced bare — same reason
        // components/ManageParticipants.tsx and components/TripSwitcher.tsx already do this.
        import type { AttributionOption, SplitMethod } from "@/lib/sharedExpenses";
        import { calculateEvenSplit } from "@/lib/sharedExpenses";

      Behavior — this component holds NO internal state; it is fully controlled by its props.
      Even-split amounts are never stored anywhere — they are computed fresh on every render via
      `calculateEvenSplit(props.totalAmount, props.selectedIds)` and shown as read-only text, so
      switching methods can never show a stale value.

      Render, in this exact structure:
      ```tsx
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="payer">Payer</label>
          <select
            id="payer"
            value={props.payerId}
            onChange={(e) => props.onPayerChange(e.target.value)}
          >
            {props.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="flex flex-col gap-1">
          <legend>Split method</legend>
          <label>
            <input
              type="radio"
              name="splitMethod"
              value="even"
              checked={props.splitMethod === "even"}
              onChange={() => props.onSplitMethodChange("even")}
            />
            Even
          </label>
          <label>
            <input
              type="radio"
              name="splitMethod"
              value="exact"
              checked={props.splitMethod === "exact"}
              onChange={() => props.onSplitMethodChange("exact")}
            />
            Exact amount
          </label>
        </fieldset>

        <div className="flex flex-col gap-2">
          <span>Split among</span>
          {(() => {
            const evenAmounts =
              props.splitMethod === "even"
                ? calculateEvenSplit(props.totalAmount, props.selectedIds)
                : {};
            return props.options.map((option) => {
              const checked = props.selectedIds.includes(option.id);
              return (
                <div key={option.id} className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          props.onSelectedIdsChange([...props.selectedIds, option.id]);
                        } else {
                          props.onSelectedIdsChange(
                            props.selectedIds.filter((id) => id !== option.id)
                          );
                        }
                      }}
                    />
                    {option.name}
                  </label>
                  {checked && props.splitMethod === "even" && (
                    <span className="font-mono">{evenAmounts[option.id].toFixed(2)}</span>
                  )}
                  {checked && props.splitMethod === "exact" && (
                    <input
                      type="text"
                      inputMode="decimal"
                      aria-label={`${option.name} share`}
                      value={props.exactAmounts[option.id] ?? ""}
                      onChange={(e) =>
                        props.onExactAmountsChange({
                          ...props.exactAmounts,
                          [option.id]: e.target.value,
                        })
                      }
                    />
                  )}
                </div>
              );
            });
          })()}
        </div>

        {props.error && <p role="alert">{props.error}</p>}
      </div>
      ```

      Constraints: this component must not call fetch, must not import lib/storage.ts,
                   lib/db.ts, or lib/participants.ts, and must not read or write any of its own
                   `useState`/`useEffect` for `payerId`/`splitMethod`/`selectedIds`/`exactAmounts`
                   — all four are owned entirely by the parent via props, so switching split
                   method is the PARENT's responsibility (clearing `exactAmounts` when switching
                   to "exact" is handled by whoever calls `onSplitMethodChange`, not by this
                   component).
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(020): add AttributionFields, the payer and split-among UI`

---

### Task 7: [UI] — `components/SharedExpenseForm.tsx`

**Files**
- create: `components/SharedExpenseForm.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (not mounted until Task 8, mirrors `components/ManageParticipants.tsx`'s own landing
in feature 019).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: components/SharedExpenseForm.tsx (create, 'use client')
      Exports: default function SharedExpenseForm({ token }: { token: string }): JSX.Element | null

      Imports:
        import { useEffect, useRef, useState, type FormEvent } from "react";
        import type { JSX } from "react";
        import { useRouter } from "next/navigation";
        import { getSharedTripLink, getJoinedTrips, getTrip } from "@/lib/storage";
        import { findJoinedTrip } from "@/lib/join";
        import { getParticipants } from "@/lib/participants";
        import type { ParticipantAuth } from "@/lib/participants";
        import {
          TRIP_CREATOR_ID,
          buildAttributionOptions,
          validateAttribution,
          toSharesPayload,
          createSharedExpense,
        } from "@/lib/sharedExpenses";
        import type { AttributionOption, SplitMethod } from "@/lib/sharedExpenses";
        import { getSupportedCurrencies } from "@/lib/countries";
        import { getAllCategories } from "@/lib/categories";
        import { validateExpenseForm, PAYMENT_METHODS } from "@/lib/expenses";
        import type { ExpenseFormValues } from "@/lib/expenses";
        import AttributionFields from "@/components/AttributionFields";
        import useUnsavedChangesWarning from "@/hooks/useUnsavedChangesWarning";

      Local type (not exported):
        type ResolvedContext =
          | { tripId: string; auth: ParticipantAuth; myOptionId: string;
              tripDates: { startDate: string; endDate: string }; tripCurrency: string };

      Ref (not state — a synchronous in-flight guard, does not trigger a re-render):
        const submittingRef = useRef(false);
      (this mirrors components/ShareTripLink.tsx's own in-flight guard: checked and set
      synchronously before any `await`, reset in a `finally` — it exists specifically so a
      double-tap on "Save expense" on a slow connection cannot fire two `POST` requests and
      create two Expense rows)

      State (all useState):
        context: ResolvedContext | null, initial null
        loadState: "loading" | "error" | "ready", initial "loading"
        loadError: string | null, initial null
        options: AttributionOption[], initial []
        values: ExpenseFormValues, initial { amount: "", currency: "", category: "", date: new Date().toISOString().slice(0, 10), paymentMethod: "", location: "", description: "" }
        ~~initialValues: ExpenseFormValues, initial — a useState initializer that captures the SAME
          object literal as `values`' own initial value, i.e. `useState(() => ({ amount: "",
          currency: "", category: "", date: new Date().toISOString().slice(0, 10), paymentMethod:
          "", location: "", description: "" }))` — never updated after mount, used only to detect
          whether the base fields are dirty~~
          AMENDED after Task 7's review: never updating the baseline made `isDirty` permanently true
          once the mount effect hydrated `values.currency` from the resolved trip, so the
          unsaved-changes warning fired on a pristine form (contradicting features/011's first
          scenario). `initialValues` is therefore a settable useState whose setter is called with the
          same hydrated object the mount effect writes into `values`. See log.txt, Task 7.
        payerId: string, initial ""
        splitMethod: SplitMethod, initial "even"
        selectedIds: string[], initial []
        exactAmounts: Record<string, string>, initial {}
        errors: Partial<Record<keyof ExpenseFormValues, string>>, initial {}
        splitError: string | undefined, initial undefined
        saveError: string | null, initial null
        isSubmitting: boolean, initial false

      Unsaved-changes warning — one line in the component body, after the state declarations:
        `const isDirty = JSON.stringify(values) !== JSON.stringify(initialValues);`
        `useUnsavedChangesWarning(isDirty);`
      (mirrors components/ExpenseForm.tsx's own `isDirty`/`useUnsavedChangesWarning` usage
      exactly — this only tracks the seven base fields, not the attribution selections, matching
      what ExpenseForm.tsx itself tracks for its own seven fields)

      Mount effect (useEffect, deps: [token, router] — router from useRouter()):
        Define and call an inner async function, mirroring ManageParticipants.tsx's own
        `loadParticipants` mount effect from feature 019:
        1. `const sharedLink = getSharedTripLink();`
        2. `let resolved: ResolvedContext | null = null;`
        3. If `sharedLink !== null && sharedLink.shareToken === token`:
           `const localTrip = getTrip();`
           if `localTrip !== null`:
             `resolved = { tripId: sharedLink.tripId, auth: { role: "creator", token: sharedLink.creatorToken }, myOptionId: TRIP_CREATOR_ID, tripDates: { startDate: localTrip.startDate, endDate: localTrip.endDate }, tripCurrency: localTrip.currency };`
        4. Else:
           `const joined = findJoinedTrip(getJoinedTrips(), token);`
           if `joined !== null`:
             `resolved = { tripId: joined.tripId, auth: { role: "participant", token: joined.participantToken }, myOptionId: joined.participantId, tripDates: { startDate: joined.trip.startDate, endDate: joined.trip.endDate }, tripCurrency: joined.trip.currency };`
        5. If `resolved === null`: `router.replace("/"); return;` (no state is set — the
           stray-visitor guard, identical to ManageParticipants.tsx)
        6. `setContext(resolved);`
        7. `setValues((v) => ({ ...v, currency: resolved!.tripCurrency }));`
        8. `const result = await getParticipants(resolved.tripId, resolved.auth);`
        9. If `!result.ok`: `setLoadError(result.error); setLoadState("error"); return;`
        10. `const opts = buildAttributionOptions(result.participants);`
            `setOptions(opts);`
            `setPayerId(resolved.myOptionId);`
            `setSelectedIds(opts.map((o) => o.id));`
            `setLoadState("ready");`

      handleSplitMethodChange(method: SplitMethod) — plain function in the component body:
        `setSplitMethod(method);`
        `if (method === "exact") setExactAmounts({});`
        (switching to "even" needs no state change — even amounts are computed fresh by
        AttributionFields itself)

      handleSubmit(e: FormEvent) — plain async function in the component body:
        1. `e.preventDefault();`
        2. `if (context === null) return;`
        3. `const categoryNames = getAllCategories().map((c) => c.name);`
           `const { errors: fieldErrors } = validateExpenseForm(values, context.tripDates, categoryNames);`
        4. `const totalAmount = Number(values.amount.trim());`
           `const { errors: attributionErrors } = validateAttribution(selectedIds, splitMethod, totalAmount, exactAmounts);`
        5. If `Object.keys(fieldErrors).length > 0 || attributionErrors.split !== undefined`:
           `setErrors(fieldErrors); setSplitError(attributionErrors.split); setSaveError(null); return;`
        6. `setErrors({}); setSplitError(undefined);`
        7. In-flight guard, checked and set synchronously, BEFORE any `await`:
           `if (submittingRef.current) return;`
           `submittingRef.current = true;`
           `setIsSubmitting(true);`
        8. `const trimmedDescription = values.description.trim();`
           ```ts
           const payload = {
             amount: totalAmount,
             currency: values.currency,
             category: values.category,
             date: values.date,
             paymentMethod: values.paymentMethod,
             location: values.location,
             ...(trimmedDescription !== "" ? { description: trimmedDescription } : {}),
             payerParticipantId: payerId === TRIP_CREATOR_ID ? null : payerId,
             shares: toSharesPayload(selectedIds, splitMethod, totalAmount, exactAmounts),
           };
           ```
        9. Wrap the remaining steps in `try { ... } finally { submittingRef.current = false;
           setIsSubmitting(false); }`:
           a. `const result = await createSharedExpense(context.tripId, payload, context.auth);`
           b. If `!result.ok`: `setSaveError(result.error); return;` (the `finally` above still
              runs on this early return, resetting the guard so a retry after a failure is
              possible)
           c. `router.push(\`/trips/${token}/expenses/${result.expense.id}\`);` (the `finally`
              still runs here too — harmless, since the component is navigating away)

      Render:
        - `if (context === null || loadState === "loading") return null;`
        - `if (loadState === "error")`:
          ```tsx
          <div className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">Record an expense</h1>
            <p role="alert">{loadError}</p>
          </div>
          ```
        - otherwise (`loadState === "ready"`), render a `<form onSubmit={handleSubmit}>` with:
          - the same seven fields `components/ExpenseForm.tsx` already renders (amount, currency
            select from `getSupportedCurrencies()`, category select from `getAllCategories()`
            with NO "+ Add New" option, date, payment method select from `PAYMENT_METHODS`,
            location, optional description) — same field order, same `id`/`label` pairing, each
            error shown as `role="alert"` directly under its field, exactly mirroring
            `components/ExpenseForm.tsx`'s existing layout and class names
            (`flex flex-col gap-1` per field group, `flex flex-col gap-4 p-4` on the form).
          - immediately after the location/description fields, mount:
            ```tsx
            <AttributionFields
              options={options}
              totalAmount={Number(values.amount.trim()) || 0}
              payerId={payerId}
              onPayerChange={setPayerId}
              splitMethod={splitMethod}
              onSplitMethodChange={handleSplitMethodChange}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              exactAmounts={exactAmounts}
              onExactAmountsChange={setExactAmounts}
              error={splitError}
            />
            ```
          - `{saveError && <p role="alert">{saveError}</p>}`
          - `<button type="submit" className="btn-primary" disabled={isSubmitting}>Save expense</button>`

      Constraints: must not import components/ExpenseForm.tsx, lib/storage.ts's
                   `saveExpenses`/`getExpenses` (this form never writes to localStorage), or
                   components/AddCategoryModal.tsx. Must not modify lib/expenses.ts,
                   lib/sharedExpenses.ts, or components/AttributionFields.tsx. The category
                   `<select>` here has no "+ Add New" entry — unlike ExpenseForm.tsx, this form
                   does not support adding a category inline.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(020): add SharedExpenseForm, the shared-trip record-expense screen`

---

### Task 8: [Route] — `app/trips/[token]/expenses/new/page.tsx`

**Files**
- create: `app/trips/[token]/expenses/new/page.tsx`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step (the component it renders already exists from Task 7; this task is the wiring
itself, mirrors 019's Task 7).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/trips/[token]/expenses/new/page.tsx (create, 'use client')
      Exports: default function NewSharedExpensePage(
        props: PageProps<"/trips/[token]/expenses/new">
      ): JSX.Element

      Behavior:
        "use client";

        import { use } from "react";
        import SharedExpenseForm from "@/components/SharedExpenseForm";

        export default function NewSharedExpensePage(
          props: PageProps<"/trips/[token]/expenses/new">
        ) {
          const { token } = use(props.params);
          return <SharedExpenseForm token={token} />;
        }

      Constraints: does NOT read getTrip() and does NOT redirect based on it at this route level
                   — SharedExpenseForm (Task 7) already handles the "device belongs to neither
                   role" case itself via its own router.replace("/"). Mirrors
                   app/trips/[token]/participants/page.tsx's use(props.params) pattern; do not
                   hand-write a params prop type.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/trips/[token]/expenses/new`.
      `npx tsc --noEmit` → Expected: exit 0, no output.

      > Per REFERENCE.md §5: a brand-new route may fail `tsc` with `TS2344` on
      > `PageProps<"/trips/[token]/expenses/new">` until `npm run build` has regenerated
      > `.next/types/routes.d.ts`. Run `npm run build` first if `npx tsc --noEmit` alone reports
      > this, then re-run `npx tsc --noEmit`; this is expected, not a real defect.

      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(020): add the /trips/[token]/expenses/new route`

---

### Task 9: [UI] — `components/SharedExpenseDetail.tsx`

**Files**
- create: `components/SharedExpenseDetail.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (not mounted until Task 10, mirrors Task 7's own reasoning).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: components/SharedExpenseDetail.tsx (create, 'use client')
      Exports: default function SharedExpenseDetail({ token, expenseId }: {
        token: string; expenseId: string;
      }): JSX.Element | null

      Imports:
        import { useEffect, useRef, useState } from "react";
        import type { JSX } from "react";
        import { useRouter } from "next/navigation";
        import { getSharedTripLink, getJoinedTrips } from "@/lib/storage";
        import { findJoinedTrip } from "@/lib/join";
        import { getParticipants } from "@/lib/participants";
        import type { ParticipantAuth } from "@/lib/participants";
        import {
          TRIP_CREATOR_ID,
          buildAttributionOptions,
          validateAttribution,
          toSharesPayload,
          getSharedExpense,
          updateSharedExpenseAttribution,
        } from "@/lib/sharedExpenses";
        import type { AttributionOption, SplitMethod } from "@/lib/sharedExpenses";
        import type { SharedExpense } from "@/lib/types";
        import AttributionFields from "@/components/AttributionFields";

      Local type (not exported):
        type ResolvedContext = { tripId: string; auth: ParticipantAuth };

      Ref (not state — same synchronous in-flight guard Task 7 uses, does not trigger a
      re-render):
        const savingRef = useRef(false);

      State (all useState):
        context: ResolvedContext | null, initial null
        loadState: "loading" | "error" | "ready", initial "loading"
        loadError: string | null, initial null
        expense: SharedExpense | null, initial null
        options: AttributionOption[], initial []
        editing: boolean, initial false
        payerId: string, initial ""
        payerNeedsReselection: boolean, initial false
        // true only when the loaded expense's payer is no longer among the trip's current
        // participants — see mount effect step 8 below. Blocks "Save split" until the user
        // explicitly picks a new payer, so a departed payer is never silently swapped for
        // "Trip creator" without the user noticing.
        splitMethod: SplitMethod, initial "exact"
        selectedIds: string[], initial []
        exactAmounts: Record<string, string>, initial {}
        splitError: string | undefined, initial undefined
        saveError: string | null, initial null
        isSaving: boolean, initial false

      Mount effect (useEffect, deps: [token, expenseId, router]):
        1. Resolve `resolved: ResolvedContext | null` exactly as
           components/ManageParticipants.tsx's own effect does (Steps 1–4 of that component's
           mount effect): `sharedLink.shareToken === token` -> `{ tripId: sharedLink.tripId, auth:
           { role: "creator", token: sharedLink.creatorToken } }`; else `findJoinedTrip(...)` ->
           `{ tripId: joined.tripId, auth: { role: "participant", token: joined.participantToken } }`.
        2. If `resolved === null`: `router.replace("/"); return;`
        3. `setContext(resolved);`
        4. `const [expenseResult, participantsResult] = await Promise.all([
             getSharedExpense(resolved.tripId, expenseId, resolved.auth),
             getParticipants(resolved.tripId, resolved.auth),
           ]);`
        5. If `!expenseResult.ok`: `setLoadError(expenseResult.error); setLoadState("error"); return;`
        6. If `!participantsResult.ok`: `setLoadError(participantsResult.error); setLoadState("error"); return;`
        7. `setExpense(expenseResult.expense);`
           `const opts = buildAttributionOptions(participantsResult.participants);`
           `setOptions(opts);`
        8. Initialize edit-mode state from the loaded expense, filtered to CURRENT options only:
           ```ts
           const currentIds = opts.map((o) => o.id);
           const loadedPayerId = expenseResult.expense.payerParticipantId ?? TRIP_CREATOR_ID;
           const payerStillCurrent = currentIds.includes(loadedPayerId);
           setPayerId(payerStillCurrent ? loadedPayerId : opts[0].id);
           setPayerNeedsReselection(!payerStillCurrent);
           const loadedSelected = expenseResult.expense.shares
             .map((s) => s.participantId ?? TRIP_CREATOR_ID)
             .filter((id) => currentIds.includes(id));
           setSelectedIds(loadedSelected.length > 0 ? loadedSelected : currentIds);
           const loadedAmounts: Record<string, string> = {};
           expenseResult.expense.shares.forEach((s) => {
             const id = s.participantId ?? TRIP_CREATOR_ID;
             if (currentIds.includes(id)) loadedAmounts[id] = s.amount.toFixed(2);
           });
           setExactAmounts(loadedAmounts);
           ```
           (splitMethod stays at its initial value, "exact" — the persisted shares are always
           reconstructable as an exact split; there is no stored record of which method was
           originally used to create them)
        9. `setLoadState("ready");`

      handleSplitMethodChange(method: SplitMethod) — identical shape to Task 7's own handler:
        `setSplitMethod(method); if (method === "exact") setExactAmounts({});`

      handlePayerChange(id: string) — plain function in the component body, passed to
      AttributionFields' `onPayerChange` INSTEAD OF `setPayerId` directly:
        `setPayerId(id); setPayerNeedsReselection(false);`
      (any explicit payer choice — including re-selecting the very option the user started
      with — clears the reselection requirement; only an unmodified auto-defaulted value stays
      blocked)

      handleSaveAttribution() — plain async function in the component body:
        1. `if (context === null || expense === null) return;`
        2. If `payerNeedsReselection`:
           `setSplitError("Choose who paid — the previous payer has left the trip.");`
           `setSaveError(null);`
           `return;`
           (checked BEFORE validateAttribution below — a departed payer that was never
           re-selected must block saving even when the split itself is otherwise valid)
        3. `const { errors } = validateAttribution(selectedIds, splitMethod, expense.amount, exactAmounts);`
        4. If `errors.split !== undefined`: `setSplitError(errors.split); setSaveError(null); return;`
        5. `setSplitError(undefined);`
        6. In-flight guard, checked and set synchronously, BEFORE any `await`:
           `if (savingRef.current) return;`
           `savingRef.current = true;`
           `setIsSaving(true);`
        7. `const payerPayload = payerId === TRIP_CREATOR_ID ? null : payerId;`
           `const shares = toSharesPayload(selectedIds, splitMethod, expense.amount, exactAmounts);`
        8. Wrap the remaining steps in `try { ... } finally { savingRef.current = false;
           setIsSaving(false); }`:
           a. `const result = await updateSharedExpenseAttribution(context.tripId, expenseId, payerPayload, shares, context.auth);`
           b. If `!result.ok`: `setSaveError(result.error); return;`
           c. `setExpense(result.expense); setEditing(false); setSaveError(null);`

      Render:
        - `if (context === null || loadState === "loading") return null;`
        - `if (loadState === "error")`:
          ```tsx
          <div className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">Expense details</h1>
            <p role="alert">{loadError}</p>
          </div>
          ```
        - otherwise (`loadState === "ready" && expense !== null`), render:
          ```tsx
          <div className="flex flex-col gap-6 p-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold">Expense details</h1>
              <p className="font-mono text-2xl font-semibold">
                {expense.currency} {expense.amount.toFixed(2)}
              </p>
            </div>
            <ul className="flex flex-col divide-y divide-(--border)">
              {[
                { label: "Category", value: expense.category },
                { label: "Date", value: expense.date, mono: true },
                { label: "Payment method", value: expense.paymentMethod },
                { label: "Location", value: expense.location },
                { label: "Description", value: expense.description ?? "No description entered." },
                { label: "Payer", value: expense.payerName },
              ].map((field) => (
                <li key={field.label} className="flex justify-between gap-4 py-2">
                  <span className="shrink-0 text-sm text-(--muted)">{field.label}</span>
                  <span className={`min-w-0 text-right break-words ${field.mono ? "font-mono" : ""}`}>
                    {field.value}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-col gap-2">
              <span>Split</span>
              <ul className="flex flex-col divide-y divide-(--border)">
                {expense.shares.map((share) => (
                  <li
                    key={share.participantId ?? "creator"}
                    className="flex justify-between gap-4 py-2"
                  >
                    <span>{share.name}</span>
                    <span className="font-mono">{share.amount.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
            {!editing && (
              <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
                Edit split
              </button>
            )}
            {editing && (
              <>
                <AttributionFields
                  options={options}
                  totalAmount={expense.amount}
                  payerId={payerId}
                  onPayerChange={handlePayerChange}
                  splitMethod={splitMethod}
                  onSplitMethodChange={handleSplitMethodChange}
                  selectedIds={selectedIds}
                  onSelectedIdsChange={setSelectedIds}
                  exactAmounts={exactAmounts}
                  onExactAmountsChange={setExactAmounts}
                  error={splitError}
                />
                {saveError && <p role="alert">{saveError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleSaveAttribution}
                    disabled={isSaving}
                  >
                    Save split
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
          ```

      Constraints: the "Edit split" button changes ONLY `editing` state — it must not call any
                   fetch. `options` (used by AttributionFields while editing) is built from the
                   CURRENT participants list fetched on mount, not from `expense.shares` — a
                   departed member is therefore never offered as a selectable option, even though
                   their name still renders in the view-mode split list via `expense.shares`
                   above. Must not modify app/expenses/[id]/page.tsx or
                   components/AttributionFields.tsx. This component does not support editing any
                   field other than payer/split — no input for amount, category, date, payment
                   method, location, or description exists anywhere in this file.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(020): add SharedExpenseDetail, the shared-trip expense view and attribution-edit screen`

---

### Task 10: [Route] — `app/trips/[token]/expenses/[expenseId]/page.tsx`

**Files**
- create: `app/trips/[token]/expenses/[expenseId]/page.tsx`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step — same reasoning as Task 8.

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/trips/[token]/expenses/[expenseId]/page.tsx (create, 'use client')
      Exports: default function SharedExpenseDetailPage(
        props: PageProps<"/trips/[token]/expenses/[expenseId]">
      ): JSX.Element

      Behavior:
        "use client";

        import { use } from "react";
        import SharedExpenseDetail from "@/components/SharedExpenseDetail";

        export default function SharedExpenseDetailPage(
          props: PageProps<"/trips/[token]/expenses/[expenseId]">
        ) {
          const { token, expenseId } = use(props.params);
          return <SharedExpenseDetail token={token} expenseId={expenseId} />;
        }

      Constraints: does NOT read getTrip() and does NOT redirect based on it — identical
                   reasoning to Task 8. Do not modify app/trips/[token]/expenses/new/page.tsx.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/trips/[token]/expenses/[expenseId]`.
      `npx tsc --noEmit` → Expected: exit 0, no output (or resolved via the same `TS2344`
      re-run note as Task 8's Step 2).
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(020): add the /trips/[token]/expenses/[expenseId] route`

---

### Task 11: [Route] — `app/expenses/new/page.tsx` redirects a shared trip's creator

**Files**
- modify: `app/expenses/new/page.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npx playwright test e2e/019-manage-trip-participants.spec.ts`

- [x] **Step 1 — Add the import.** At the top of `app/expenses/new/page.tsx`, alongside the
      existing `import { getTrip } from "@/lib/storage";`, change it to:
      ```ts
      import { getTrip, getSharedTripLink } from "@/lib/storage";
      ```

- [x] **Step 2 — Add the redirect.** In the existing `useEffect` that currently reads:
      ```ts
      useEffect(() => {
        if (trip === null) {
          router.replace("/");
        }
      }, [trip, router]);
      ```
      replace it with:
      ```ts
      useEffect(() => {
        if (trip === null) {
          router.replace("/");
          return;
        }
        const sharedLink = getSharedTripLink();
        if (sharedLink !== null) {
          router.replace(`/trips/${sharedLink.shareToken}/expenses/new`);
        }
      }, [trip, router]);
      ```
      Then change the final render guard from:
      ```ts
      if (trip === undefined || trip === null) {
        return null;
      }
      ```
      to:
      ```ts
      if (trip === undefined || trip === null) {
        return null;
      }

      if (getSharedTripLink() !== null) {
        return null;
      }
      ```
      (mirrors `app/page.tsx`'s existing joined-trip redirect shape — the effect fires the
      navigation, and the render guard prevents `ExpenseForm` from flashing on screen for the one
      render before the redirect completes)

      Do not change any other line in this file — `ExpenseForm` is still mounted, unmodified,
      immediately after these two guards for every case where no share link exists.

- [x] **Step 3 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 4 — Regression check.** This change touches no exported symbol
      `e2e/019-manage-trip-participants.spec.ts` depends on, but that spec is the closest existing
      coverage of `getSharedTripLink()`-seeded scenarios; confirm it is unaffected.
      `npx playwright test e2e/019-manage-trip-participants.spec.ts`
      Expected: exit 0, `10 passed` (the file's current test count — must not change).

- [x] **Step 5 — Commit.**
      Message: `feat(020): redirect a shared trip's creator from /expenses/new to the shared-trip flow`

---

### Task 12: [UI] — `components/JoinedTripSummary.tsx` gains an "Add expense" link

**Files**
- modify: `components/JoinedTripSummary.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts`, `npx playwright test e2e/018-switch-between-multiple-trips.spec.ts`, `npx playwright test e2e/019-manage-trip-participants.spec.ts`

- [x] **Step 1 — Add the link.** `components/JoinedTripSummary.tsx` already imports `Link` from
      "next/link" — do not add a second import. Immediately after the existing
      ```tsx
      <Link
        href={`/trips/${joinedTrip.shareToken}/participants`}
        className="link self-start"
      >
        View participants
      </Link>
      ```
      element (added by feature 019), and still inside the same outer `flex flex-col gap-4 p-4`
      div, add:
      ```tsx
      <Link
        href={`/trips/${joinedTrip.shareToken}/expenses/new`}
        className="link self-start"
      >
        Add expense
      </Link>
      ```
      Do not change, remove, or reorder any existing element, class name, or text in this
      component (the destination heading, the date-range paragraph, the "Joined as {name}."
      paragraph, the conditional `storageWarning` paragraph, the "Back to home" link, or the
      "View participants" link).

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Regression check.** This component is rendered by `components/JoinTrip.tsx`
      (feature 017), `components/SharedTripView.tsx` (feature 018), and is exercised indirectly
      by feature 019's own spec. Confirm this additive change affects none of their assertions.
      `npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts`
      Expected: exit 0, `17 passed` (the file's current test count — must not change).
      `npx playwright test e2e/018-switch-between-multiple-trips.spec.ts`
      Expected: exit 0, `14 passed` (the file's current test count — must not change).
      `npx playwright test e2e/019-manage-trip-participants.spec.ts`
      Expected: exit 0, `10 passed` (the file's current test count — must not change).

- [x] **Step 4 — Commit.**
      Message: `feat(020): add an "Add expense" link to JoinedTripSummary`

---

### Task 13: [Behavioral] — Playwright coverage for the full feature

~~Superseded by Task 16.~~ Its first attempt wrote the whole spec and reached 16/17; the one failure
was a genuine product defect (a departed payer's id was nulled by `onDelete: SetNull`, making the
client's reselection guard unreachable), not a spec gap. See `output/error/020-attribute-an-expense-to-payer-and-split.md`
and log.txt. Tasks 14–15 fixed the defect; Task 16 re-ran the spec unchanged in substance.

**Files**
- create: `e2e/020-attribute-an-expense-to-payer-and-split.spec.ts`
- test: `npx playwright test e2e/020-attribute-an-expense-to-payer-and-split.spec.ts`

- [ ] **Step 1 — Write the spec**, covering all 17 scenarios below (E2E-020-01 through
      E2E-020-16 map to spec.md §4; E2E-020-17 is an added regression test for the
      payer-reselection guard Task 9 implements, not itself listed in spec.md §4):
      1. `an even split among 3 members saves SGD 10.00 each` (E2E-020-01)
      2. `the form pre-selects me as payer and everyone in the split` (E2E-020-02)
      3. `an exact split saves each entered share` (E2E-020-03)
      4. `SGD 10.00 split 3 ways rounds to 2dp and sums exactly` (E2E-020-04)
      5. `exact amounts under the total are refused` (E2E-020-05)
      6. `deselecting everyone including the payer is refused` (E2E-020-06)
      7. `switching exact to even recalculates the shares` (E2E-020-07)
      8. `switching even to exact clears the computed shares` (E2E-020-08)
      9. `a departed payer's name still shows on their past expense` (E2E-020-09)
      10. `editing payer and split saves the update` (E2E-020-10)
      11. `a solo trip's expense form has no payer or split fields` (E2E-020-11)
      12. `saving fails with a friendly error when the server is unreachable` (E2E-020-12)
      13. `loading the form fails with a friendly error when the server is unreachable` (E2E-020-13)
      14. `a creator-only trip defaults to and saves a full self-split` (E2E-020-14)
      15. `a departed member is not offered as a selectable option while editing` (E2E-020-15)
      16. `a stray device is redirected home from both expense screens` (E2E-020-16)
      17. `saving a departed payer's expense split is blocked until a new payer is chosen`
          (E2E-020-17)

      Helpers to build, duplicating (not importing) the shapes
      `e2e/019-manage-trip-participants.spec.ts` already established:
      - `seedStorage(page, storageData)`: `page.addInitScript` writing each key/value pair into
        `window.localStorage`, using the same `STORAGE_KEYS` map
        (`{ sharedTripLink: "travel-expense:shared-trip-link", joinedTrips:
        "travel-expense:joined-trips" }`). Called BEFORE `page.goto`, never after.
      - `createRealTripLink(request)`: `POST /api/trips` with a fixed trip body
        `{ destinationCountry: "Japan", currency: "JPY", startDate: "2026-01-01", endDate:
        "2026-01-10" }`, returns `{ tripId, shareToken, creatorToken }` parsed from the response.
      - `joinViaApi(request, shareToken, name)`: `POST /api/join/${shareToken}` with `{ name }`,
        returns the parsed `{ participantId, participantToken, trip }` body.
      - `buildJoinedTrip(link, joined, name)`: returns the exact `JoinedTrip` shape
        `lib/types.ts` declares — `{ tripId, shareToken, participantId, participantToken,
        participantName: name, trip: { id: tripId, destinationCountry: "Japan", currency: "JPY",
        startDate: "2026-01-01", endDate: "2026-01-10" } }`.
      - `expenseForm(page)`: `page.getByRole("heading", { name: "Record an expense" }).locator("..")`
        (mirrors `e2e/019-...`'s own `participantsScreen` helper — scopes assertions to the
        rendered form container, away from Next.js's own route announcer).
      - `expenseDetail(page)`: `page.getByRole("heading", { name: "Expense details" }).locator("..")`

      Per-scenario seeding and assertions:
      - **E2E-020-01**: create a trip+link, join two participants via `joinViaApi` ("Alex",
        "Blair"). Seed the creator's `sharedTripLink`, and also seed a local `trip` key (via
        `page.addInitScript`, using `lib/storage.ts`'s `travel-expense:trip` key) with a Trip
        object matching the fixed trip body plus no budget, so the creator's own
        `getTrip()`/`getSharedTripLink()` role-resolution branch resolves. Visit
        `/trips/{shareToken}/expenses/new`. Fill amount `30.00`, currency `JPY`, pick the first
        available category, leave payer as the pre-selected default, leave split method as
        "Even" with all three (Trip creator, Alex, Blair) checked, fill payment method and
        location, submit. Assert the page navigates to
        `/trips/{shareToken}/expenses/{newId}` and the detail screen's split list shows three
        rows each reading `10.00`.
      - **E2E-020-02**: as a participant ("Alex", via seeded `joinedTrips`) with one other
        participant ("Blair") already joined, visit `/trips/{shareToken}/expenses/new`. Assert
        the "Payer" select's value corresponds to "Alex", and both the "Trip creator" and "Blair"
        checkboxes are checked alongside "Alex"'s own (all three members pre-selected).
      - **E2E-020-03**: as the creator, on a trip with one joined participant ("Alex"), open the
        form, enter amount `30.00`, switch split method to "Exact amount", enter `20.00` for
        "Trip creator" and `10.00` for "Alex", submit. Assert the detail screen shows `20.00`
        against "Trip creator" and `10.00` against "Alex".
      - **E2E-020-04**: as the creator, with two joined participants ("Alex", "Blair"), enter
        amount `10.00`, even split among all three. Assert the three amounts shown on the detail
        screen, converted to numbers, sum to exactly `10`.
      - **E2E-020-05**: as the creator, with one joined participant ("Alex"), enter amount
        `30.00`, switch to "Exact amount", enter `15.00` for "Trip creator" and `10.00` for
        "Alex" (summing to `25.00`), submit. Assert a `role="alert"` scoped to the form contains
        "add up to the total", and a follow-up `GET /api/trips/{tripId}/expenses` equivalent
        check is not available (no list endpoint exists) — instead assert the page URL is still
        `/trips/{shareToken}/expenses/new` (no navigation occurred).
      - **E2E-020-06**: as the creator, on a creator-only trip (no joined participants), enter an
        amount, uncheck the single "Trip creator" checkbox, submit. Assert a `role="alert"`
        scoped to the form contains "at least one participant", and the URL is unchanged.
      - **E2E-020-07**: as the creator, enter amount `30.00`, switch to "Exact amount", type
        `12.00` into the "Trip creator" share input, then switch back to "Even". Assert the
        "Trip creator" row (the only pre-selected member on a creator-only trip) now shows
        `30.00` as plain text, not an input containing `12.00`.
      - **E2E-020-08**: as the creator, on a creator-only trip, enter amount `30.00`, leave split
        method at "Even" (default), then switch to "Exact amount". Assert the "Trip creator"
        share input is present and its value is empty (not pre-filled with `30.00`).
      - **E2E-020-09**: create a trip+link, join "Alex", record an expense as the creator with
        "Alex" as payer via a real `POST /api/trips/{tripId}/expenses` call (bypassing the UI, to
        set up the fixture), then remove "Alex" via `DELETE
        /api/trips/{tripId}/participants/{alexId}` with the creator token. Seed the creator's
        `sharedTripLink`, visit `/trips/{shareToken}/expenses/{expenseId}`. Assert the "Payer"
        row in the field list still reads "Alex".
      - **E2E-020-10**: as the creator, with two joined participants ("Alex", "Blair"), record an
        expense via the API fixture with "Alex" as payer split evenly between "Alex" and "Blair".
        Visit the detail page, click "Edit split", change the payer select to "Blair", uncheck
        "Alex", check only "Blair" remains selected (single-person split), click "Save split".
        Reload the page (`page.reload()`). Assert the "Payer" field now reads "Blair" and the
        split list shows exactly one row, "Blair", with the full amount.
      - **E2E-020-11**: seed only a local solo `trip` key (no `sharedTripLink`, no
        `joinedTrips`). Visit `/expenses/new`. Assert no element with an accessible name matching
        "Payer" exists, and no element with the text "Split among" exists.
      - **E2E-020-12**: as the creator on a creator-only trip, install
        `page.route("**/api/trips/*/expenses", (route) => { if (route.request().method() ===
        "POST") { route.abort(); } else { route.continue(); } })` before navigating. Fill and
        submit a valid form. Assert a `role="alert"` scoped to the form contains "Could not reach
        the server", and the URL is unchanged (still `/trips/{shareToken}/expenses/new`).
      - **E2E-020-13**: as the creator, install `page.route("**/api/trips/*/participants",
        (route) => route.abort())` before navigating to `/trips/{shareToken}/expenses/new`.
        Assert a `role="alert"` becomes visible (not a broken/empty form) — do not assert on its
        exact text, only that the alert renders inside the "Record an expense" heading's
        container.
      - **E2E-020-14**: as the creator on a trip with zero joined participants, visit the form.
        Assert exactly one checkbox is rendered under "Split among" and it is checked and labeled
        "Trip creator". Enter amount `50.00`, submit with the default even split. Assert the
        detail screen shows one split row, "Trip creator", `50.00`.
      - **E2E-020-15**: using the same fixture as E2E-020-09 (a departed payer "Alex"), visit the
        detail page, click "Edit split". Assert the "Payer" select's options do NOT include an
        option with the accessible text "Alex" (query `page.getByRole("option", { name: "Alex"
        })` and assert a count of `0`), while the split list above (outside edit mode, already
        asserted by E2E-020-09) still shows "Alex" by name.
      - **E2E-020-16**: create a trip+link, seed no `localStorage` for this device at all. Visit
        `/trips/{shareToken}/expenses/new`. Assert the page navigates to `/`. Separately, using a
        real expense fixture (via the API) on the same trip, visit
        `/trips/{shareToken}/expenses/{expenseId}` with no `localStorage` seeded. Assert that
        page also navigates to `/`.
      - **E2E-020-17**: using the same fixture as E2E-020-09/E2E-020-15 (an expense whose payer
        "Alex" has since been removed via the API), visit the detail page as the creator, click
        "Edit split", then — WITHOUT touching the "Payer" select — change only the split (e.g.
        uncheck "Trip creator" if it is checked, leaving at least one member selected so the
        empty-selection error from E2E-020-06 does not also fire), and click "Save split". Assert
        a `role="alert"` scoped to the detail container contains "Choose who paid", and that a
        page reload afterward still shows "Alex" as the payer (the update was never sent). Then,
        without reloading, select any option in the "Payer" select (any value — this clears the
        reselection requirement) and click "Save split" again. Assert this second attempt
        succeeds: no alert is shown, and after `page.reload()` the "Payer" field reads whatever
        was selected, not "Alex".

      Per `.claude/repo-profile.md` § Behavioral gate: seed all required `localStorage` via
      `page.addInitScript` before first render. Scope every `role="alert"` assertion to the
      rendered form/detail container (via the `expenseForm`/`expenseDetail` helpers above), never
      the page root, to avoid colliding with Next.js's own route announcer.

- [ ] **Step 2 — Run it and confirm it passes.**
      `npx playwright test e2e/020-attribute-an-expense-to-payer-and-split.spec.ts`
      Expected: exit 0, `17 passed`.

- [ ] **Step 3 — Regression.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/expenses`, `/api/trips/[id]/expenses/[expenseId]`,
      `/trips/[token]/expenses/new`, and `/trips/[token]/expenses/[expenseId]`.

- [ ] **Step 4 — Commit.**
      Message: `feat(020): add Playwright coverage for attributing an expense to payer and split`

---

## Amendment — Tasks 14–15 (added after Task 13's first attempt failed)

**Why.** Task 13's E2E-020-17 exposed a contradiction between this plan's own Task 2 and Task 9:
`Expense.payer` (and `ExpenseShare.participant`) use `onDelete: SetNull`, so when a payer leaves, the
id is nulled while only the *name* survives. The client maps a null id to `TRIP_CREATOR_ID`, which is
always in `currentIds`, so Task 9's `payerNeedsReselection` guard is unreachable dead code and saving
an expense whose payer has left silently re-attributes it to the trip creator. The user chose to
preserve the departed id.

**Design.** Keep both FKs (their `SetNull` behaviour and referential integrity are what let 019's hard
`db.participant.delete()` keep working) and add a non-FK **snapshot column** alongside each, written on
every create and update, never touched by a participant delete. The snapshot becomes the source of
truth for what the API *returns*, so the client always learns who was intended; the FK remains the
live link and is what the referential validation checks. Consequences: the guard starts working with
no client change, because `SharedExpenseDetail` already compares the returned id against the current
roster; and a departed member's share row keeps its own identity instead of collapsing onto the
creator's.

---

### Task 14: [Config] — snapshot columns on `Expense` and `ExpenseShare`

**Files**
- modify: `prisma/schema.prisma`
- create: `prisma/migrations/<timestamp>_add_participant_id_snapshots/migration.sql`
- test: `npx prisma generate`, `npx prisma migrate dev --name add_participant_id_snapshots`,
  `npx tsc --noEmit`, `npm run lint`

- [x] **Step 1 — Add the two columns.**
      In `model Expense`, immediately after the existing `payerParticipantId String?` line, add:
      ```prisma
        payerParticipantIdSnapshot String?
      ```
      In `model ExpenseShare`, immediately after the existing `participantId String?` line, add:
      ```prisma
        participantIdSnapshot String?
      ```
      Do not change, remove, or reorder any other field, and do not touch either relation or its
      `onDelete: SetNull` — the FKs stay exactly as they are.

- [x] **Step 2 — Migrate.** `npx prisma migrate dev --name add_participant_id_snapshots`
      Expected: exit 0, a new `prisma/migrations/<timestamp>_add_participant_id_snapshots/` directory
      containing `migration.sql`, and the migration applied.
      Then open that `migration.sql` and append two backfill statements, so any row written before
      this change keeps behaving identically:
      ```sql
      -- Backfill: rows created before the snapshot columns existed.
      UPDATE "Expense" SET "payerParticipantIdSnapshot" = "payerParticipantId" WHERE "payerParticipantId" IS NOT NULL;
      UPDATE "ExpenseShare" SET "participantIdSnapshot" = "participantId" WHERE "participantId" IS NOT NULL;
      ```
      (A row whose FK was already nulled by a past participant removal cannot be recovered — its id is
      gone — so it stays `NULL` in the snapshot too. That is expected and is not a defect.)

- [x] **Step 3 — Verify.**
      `npx prisma generate` → Expected: exit 0, "Generated Prisma Client".
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npx prisma migrate status` → Expected: exit 0, "Database schema is up to date!"

- [x] **Step 4 — Commit.**
      Message: `feat(020): add participant-id snapshot columns to Expense and ExpenseShare`

---

### Task 15: [Route] — both expense routes write and return the snapshots

**Files**
- modify: `app/api/trips/[id]/expenses/route.ts`
- modify: `app/api/trips/[id]/expenses/[expenseId]/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

- [x] **Step 1 — POST writes the snapshots.** In `app/api/trips/[id]/expenses/route.ts`, in the
      `shareRows` construction, add `participantIdSnapshot: s.participantId,` to each row (keeping the
      existing `participantId: s.participantId,`), and in `db.expense.create`'s `data`, add
      `payerParticipantIdSnapshot: body.payerParticipantId,` next to the existing
      `payerParticipantId: body.payerParticipantId,`. Change nothing else — every check, status code,
      error string, and ordering stays exactly as it is.

- [x] **Step 2 — POST returns the snapshots.** In the same file's 201 response body, change
      `payerParticipantId: expense.payerParticipantId,` to
      `payerParticipantId: expense.payerParticipantIdSnapshot,` and, in the `shares` mapping, change
      `participantId: s.participantId,` to `participantId: s.participantIdSnapshot,`. `payerName` and
      each share's `name` are unchanged.

- [x] **Step 3 — GET/PATCH return the snapshots.** In
      `app/api/trips/[id]/expenses/[expenseId]/route.ts`, in the shared `serialize` helper, change
      `payerParticipantId: expense.payerParticipantId,` to
      `payerParticipantId: expense.payerParticipantIdSnapshot,` and, in the `shares` mapping, change
      `participantId: s.participantId,` to `participantId: s.participantIdSnapshot,`. Update
      `serialize`'s hand-written parameter type to include the two new fields
      (`payerParticipantIdSnapshot: string | null` and, on each share,
      `participantIdSnapshot: string | null`) so it still accepts what Prisma returns.

- [x] **Step 4 — PATCH writes the snapshots.** In the same file's `db.$transaction`, the
      `shareRows` construction gains `participantIdSnapshot: s.participantId,` (keeping
      `participantId: s.participantId,`), and the `tx.expense.update` `data` gains
      `payerParticipantIdSnapshot: body.payerParticipantId,` next to `payerParticipantId`, keeping
      `payerName` and `shares: { create: shareRows }` as they are. Change nothing else — in
      particular the twelve-odd field checks, the duplicate-key rule, the cent-sum check against
      `existing.amount`, the referential validation, and the transaction's delete-then-update shape
      all stay exactly as they are.

- [x] **Step 5 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/expenses` and `/api/trips/[id]/expenses/[expenseId]`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 6 — Commit.**
      Message: `feat(020): have the expense routes write and return the participant-id snapshots`

---

### Task 16: [Behavioral] — Playwright coverage for the full feature (retry)

Task 13, re-run. The only thing that changes is the outcome: with the snapshot columns in place, a
departed payer's id survives the trip and `SharedExpenseDetail`'s existing guard fires, so E2E-020-17
can pass without weakening it.

**Files**
- create: `e2e/020-attribute-an-expense-to-payer-and-split.spec.ts`
- test: `npx playwright test e2e/020-attribute-an-expense-to-payer-and-split.spec.ts`

- [x] **Step 1 — Write the spec** covering all 17 scenarios (E2E-020-01 … E2E-020-17) exactly as
      Task 13's Step 1 specifies, with the same helper set and the same per-scenario seeds and
      assertions. Two lessons from Task 13's first attempt are binding:
      - E2E-020-17 must assert the real guard behaviour — click "Save split" with the payer select
        untouched and expect the `Choose who paid` alert plus **no** PATCH request — and must not be
        softened to accommodate the old defect.
      - The scenario's fixture needs at least one *current* member besides the departed payer, so the
        split can be changed without emptying the selection; and its final save must use a split that
        sums to the expense amount.
- [x] **Step 2 — Run it.** `npx playwright test e2e/020-attribute-an-expense-to-payer-and-split.spec.ts`
      → Expected: exit 0, `17 passed`.
- [x] **Step 3 — Regression.** `npx tsc --noEmit` → exit 0, no output. `npm run lint` → exit 0, no
      output beyond npm's banner. `npm run build` → exit 0, "Compiled successfully", route table
      includes `/api/trips/[id]/expenses`, `/api/trips/[id]/expenses/[expenseId]`,
      `/trips/[token]/expenses/new`, and `/trips/[token]/expenses/[expenseId]`.
- [x] **Step 4 — Commit.**
      Message: `feat(020): add Playwright coverage for attributing an expense to payer and split`

## Execution

Work **one task at a time, in order.** Do not read ahead and batch tasks.

For each task:

1. Read the task's **Files** manifest before touching anything.
2. Run each step's verification command and compare the real output against the
   step's stated `Expected:` line. A mismatch means stop and diagnose — never
   edit the plan's expected output to match what you got.
3. Finish with the regression run: `npm run lint`, `npx tsc --noEmit`,
   `npm run build` — all three must exit 0.
4. Commit the task.
5. Update `plan.md` and the adjacent `log.txt` before starting the next task:
   tick the task's checkboxes, set `**Status:** In Progress` on the first
   completion, and append a log entry with Completed / Summary / Key Decisions /
   Deviations / Files Changed. Those two files are the resumption state for
   whoever picks this up cold.

Commit message format — Conventional Commits, scope is the feature number:

    feat(020): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: doc/features/020-attribute-an-expense-to-payer-and-split/spec.md

Never commit on a failing lint, typecheck, or build.

---

## Completion Summary

### What was built

Feature 020: a shared trip's expenses are now recorded server-side with a payer and a split, viewable
and editable later by the trip's creator or any current participant, with a departed member still
showing by name and never selectable again.

- `prisma/schema.prisma` gained `Expense`/`ExpenseShare`, then the non-FK snapshot columns
  `payerParticipantIdSnapshot`/`participantIdSnapshot` (migrations `20260918144506` and
  `20260918160954`, the latter carrying a backfill).
- `lib/types.ts` gained `SharedExpense`/`SharedExpenseShare`; `lib/sharedExpenses.ts` owns split maths,
  attribution validation and the three fetch wrappers.
- Routes: `POST /api/trips/[id]/expenses`, `GET`/`PATCH /api/trips/[id]/expenses/[expenseId]`,
  `components/AttributionFields.tsx`, `components/SharedExpenseForm.tsx`,
  `components/SharedExpenseDetail.tsx`, `/trips/[token]/expenses/new`,
  `/trips/[token]/expenses/[expenseId]`, the `/expenses/new` redirect for a creator with a share
  link, and the `JoinedTripSummary` "Add expense" link.
- `e2e/020-attribute-an-expense-to-payer-and-split.spec.ts` — 17 scenarios, all passing.

### Deviations from the plan

1. **Tasks 14–16 were added mid-run** after Task 13's E2E-020-17 exposed a contradiction between the
   plan's own Task 2 (`onDelete: SetNull`) and Task 9 (a guard that can detect a departed payer). The
   user chose to preserve the departed id; Tasks 14–15 implemented that, Task 16 re-ran the spec.
2. **The plan's Task 9 guard was unreachable as written** and is now reachable — the fix was on the
   server (Tasks 14–15), not in the component, because no client-side change was needed once the API
   returned real ids again.
3. Several plan literals could not be shipped as written and were substituted with behaviour-identical
   code, each declared and gate-approved: `any` → `unknown` in both route handlers (the repo lints
   `no-explicit-any` as an error), a leading non-object-element guard on `shares` (the literal threw on
   a `null` element and turned bad input into a 500), a `ShareInput` alias from `Pick` (the literal left
   the `SharedExpenseShare` import unused), `initialValues` made settable (the literal made `isDirty`
   permanently true, tripping feature 011's warning on a pristine form), and an `if (expense === null)`
   guard in the detail component (the literal did not typecheck).
4. **The migration's backfill was applied out of band**, because `prisma db execute` has no `--schema`
   flag in Prisma 7 and replaying the file fails on its own already-applied ALTERs. Recorded in log.txt.

### Follow-ups not in scope

- **Stale migration checksum.** `20260918160954_add_participant_id_snapshots/migration.sql` was edited
  after it was applied (the plan's own step order), so its recorded checksum no longer matches. Nothing
  fails today, but a future `prisma migrate dev` may prompt to reset the dev database. A deliberate
  `prisma migrate reset` would reconcile it; that wipes the database, so it needs a user decision.
- **Cross-field sub-cent exposure.** Shares are validated by comparing integer cents but written
  unrounded, and the cent-sum check is vacuous when `amount * 100` overflows to `Infinity`. Logged
  under Tasks 3, 4, 5 and 9 with concrete fixes.
- **A departed split member's share still cannot be edited.** Filtering to the current roster (right
  for selectability) drops their amount, so the cent sum no longer matches and the save fails with the
  generic sum error rather than an explanation. Logged under Task 9.
- **The shared-trip record form omits `ExpenseForm.tsx`'s out-of-range trip-date warning**, and the
  plan's §7 open items (a dashboard view of shared-trip expenses, post-save UX, a shared-trip expense
  list, per-device categories) are still open for feature 021.
- **`spec.md` §1.6** still claims the two expense routes are "reachable only by direct URL", which the
  `JoinedTripSummary` link contradicts, and its §4 table has no row for TS-020-12.

### Final verification

- `npm run build` → exit 0, "Compiled successfully", route table includes all four new routes.
- `npx tsc --noEmit` → exit 0, no output.
- `npm run lint` → exit 0, no output beyond npm's banner.
- `npx playwright test e2e/020-attribute-an-expense-to-payer-and-split.spec.ts` → exit 0, `17 passed`.
- Regression suites re-run green at their frozen counts: `019` `10 passed`, `017` `17 passed`,
  `018` `14 passed`.
- 16 commits, `02598ce` … `088fb2b`.
