# 022. Settle Up a Balance — Implementation Plan

**Status:** Complete
**Source:** `doc/features/022-settle-up-a-balance/spec.md` (from `features/022.settle-up-a-balance.md`)
**Goal:** Let any current member of a shared trip mark a balance line on the existing balances view
(feature 021) as paid outside the app — in full or in part — so the view stops showing debts that
have already been squared up, with the settlement combining correctly with any later expense
between the same two people.

**Architecture:**
`components/TripBalances.tsx`'s balances view is currently read-only. This plan adds a small
`Settlement` Prisma model (`tripId`, `fromId`/`toId` — nullable strings using the existing
"null = trip creator" convention, `amount` in the trip currency, no FK to `Participant` since
nothing here needs to detect a departed payer the way expense-attribution editing does) and extends
`lib/balances.ts`'s existing pure `getTripBalances` to net each settlement's amount into the same
integer-cents net-position computation it already runs for expenses — crediting the party who owed
(`fromId`) and debiting the party who was owed (`toId`) — so a settlement combines with the ledger
automatically on every future recompute rather than being stored as a separate adjustment layer. A
new `POST /api/trips/[id]/settlements` endpoint recomputes the current balances (expenses + prior
settlements) to find the outstanding amount for the requested `(fromId, toId)` pair, refuses a
request exceeding it, and otherwise records the settlement and returns the freshly recomputed
result directly, so the client can replace its state with one response instead of a second fetch.
On the client, tapping a new "Settle" button on any balances-view line opens
`components/ConfirmSettleBalance.tsx` (a new modal mirroring `components/ConfirmParticipantAction.tsx`'s
existing `role="dialog"` pattern), pre-filled with the line's full outstanding amount and editable
down to any smaller positive value; its own "Settle" button both validates the amount
(`validateSettlementAmount`, a new pure function) and serves as the confirmation step the feature
requires — no separate confirm-then-confirm-again step exists. `components/TripBalances.tsx` itself
gains the per-line button, the modal wiring, and a `role="alert"` action-error line for a failed
settle attempt, reusing `lib/balances.ts`'s existing `FRIENDLY_ERROR` string for both "offline" and
"server unreachable" (this app has no real `navigator.onLine` detection anywhere — every existing
"offline" test in this repo simulates it with `page.route(...).abort()`).

Per spec.md §1.6/§7: this plan does **not** add a settlement history or audit trail, does **not**
add real payment processing, does **not** add an undo/reverse action, and does **not** restrict who
may settle a line to only its two named parties (any current trip member is authorized — spec.md
§6 Challenge 1, an explicit design decision, not an oversight).

> **Assumed** (plumbing needed for the tasks below to stay independently buildable, not spelled out
> as literal TypeScript in spec.md §2.3): `getTripBalances`'s new fourth parameter,
> `settlements: BalanceSettlementInput[]`, carries a default value of `= []`. Spec.md's contract
> shows the parameter as plain and required; the default exists **only** so that Task 2 (which
> extends `lib/balances.ts`) and Task 3 (which updates the one existing caller,
> `app/api/trips/[id]/balances/route.ts`, to pass real settlements) can land as two separate,
> independently-verifiable tasks per this repo's data/domain/route task-separation rule, rather
> than one oversized task mixing a `lib/` change with a route change. Immediately after Task 3
> lands, every caller passes a real array; the default is never actually relied on at runtime.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Reuses features 016–021's Prisma + `@prisma/adapter-neon` + `@neondatabase/serverless` dependencies
and the `lib/db.ts` singleton — no new package. One schema migration (Task 1) adds `Settlement`.
Verification: `npm run lint`, `npx tsc --noEmit`, `npm run build` (route-touching tasks),
`npx playwright test e2e/022-settle-up-a-balance.spec.ts` (behavioral gate).

> **Methodology note on "red steps."** As in features 020/021's plans, several tasks add a file or
> an export with no in-task TS consumer yet (a Route Handler invoked only over HTTP, a component not
> yet mounted, or a `lib/` addition whose existing caller is deliberately left unchanged that task
> via the default-parameter plumbing above). Where no real call site exists in-task, the step is
> written as implement-then-verify-green instead, and is labeled "No red step" with the reason.

---

### Task 1: [Config] — Prisma schema gains `Settlement`

**Files**
- modify: `prisma/schema.prisma`
- test: `npx prisma generate`, `npx prisma migrate dev --name add_settlement`, `npx tsc --noEmit`,
  `npm run lint`

- [x] **Step 1 — Add the relation field to the existing `Trip` model.** Inside the existing
      `model Trip { ... }` block, add one new field as the last line before the closing brace
      (after the existing `exchangeRates ExchangeRate[]` line):
      ```prisma
        settlements        Settlement[]
      ```
      Do not modify any existing field on `Trip`.

- [x] **Step 2 — Append the new model**, after `ExchangeRate`'s closing brace (the end of the
      file):
      ```prisma
      model Settlement {
        id        String   @id @default(cuid())
        tripId    String
        trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
        fromId    String?
        toId      String?
        amount    Float
        createdAt DateTime @default(now())
        @@index([tripId])
      }
      ```
      `fromId`/`toId` are plain optional strings with no `Participant` relation — `null` means the
      trip creator (the same convention `Expense.payerParticipantIdSnapshot` already uses), and a
      non-null value is a `Participant.id` that is never looked up or validated against a live
      `Participant` row by this model.

- [x] **Step 3 — Regenerate the Prisma Client.**
      `npx prisma generate`
      Expected: exit 0, output containing "Generated Prisma Client".

- [x] **Step 4 — Apply the migration.**
      `npx prisma migrate dev --name add_settlement`
      Expected: exit 0, output confirming the migration was applied and a new
      `prisma/migrations/<timestamp>_add_settlement/migration.sql` file was created.

- [x] **Step 5 — Regression.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 6 — Commit.**
      Message: `feat(022): add Settlement model to the Prisma schema`

---

### Task 2: [Domain] — `lib/balances.ts` gains settlement netting, validation, and the client wrapper

**Files**
- modify: `lib/balances.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step — the existing `getTripBalances` call site (`app/api/trips/[id]/balances/route.ts`,
still passing 3 arguments at this point in the plan) keeps compiling because of the default
parameter (see the plan header's "Assumed" note); the three new exports have no consumer until
Tasks 4, 5, and 6.

- [x] **Step 1 — Add `BalanceSettlementInput`.** In `lib/balances.ts`, immediately after the
      existing `BalanceExpenseInput` interface's closing brace (currently ending just before
      `export function getTripBalances`), add:
      ```ts
      export interface BalanceSettlementInput {
        fromId: string | null; // null = trip creator, same convention as BalanceExpenseInput.payerId
        toId: string | null;   // null = trip creator
        amount: number;         // trip-currency; a settlement is never expressed in another currency
      }
      ```

- [x] **Step 2 — Extend `getTripBalances`'s signature.** Change the existing function signature
      from:
      ```ts
      export function getTripBalances(
        expenses: BalanceExpenseInput[],
        tripCurrency: string,
        rates: Pick<SharedExchangeRate, "currency" | "rate">[]
      ): TripBalancesResult {
      ```
      to:
      ```ts
      export function getTripBalances(
        expenses: BalanceExpenseInput[],
        tripCurrency: string,
        rates: Pick<SharedExchangeRate, "currency" | "rate">[],
        settlements: BalanceSettlementInput[] = []
      ): TripBalancesResult {
      ```
      Do not change anything else about the function's existing body between its opening brace and
      the line `const creditors = Array.from(netCents.entries())`.

- [x] **Step 3 — Net the settlements.** Immediately before the line
      `const creditors = Array.from(netCents.entries())`, insert:
      ```ts
      for (const settlement of settlements) {
        const fromId = settlement.fromId ?? TRIP_CREATOR_ID;
        const toId = settlement.toId ?? TRIP_CREATOR_ID;
        const cents = Math.round(settlement.amount * 100);
        addNet(fromId, names.get(fromId) ?? "", cents);
        addNet(toId, names.get(toId) ?? "", -cents);
      }
      ```
      This reuses the `addNet`/`names` closures already defined earlier in the function — do not
      redeclare them. The `names.get(id) ?? ""` fallback is never actually used at runtime: a
      settlement can only ever be created (Task 4) against an `(fromId, toId)` pair for which
      `getTripBalances` has just produced a line, which guarantees both ids already have a name
      recorded by the expense-netting loop above this insertion point. Apply no currency
      conversion to `settlement.amount` — it is already in the trip currency.

- [x] **Step 4 — Add `validateSettlementAmount`, `SettleBalanceInput`, `SettleBalanceResult`, and
      `settleBalance`.** At the end of the file, after the existing `fetchTripBalances` function's
      closing brace, append:
      ```ts
      export type SettlementAmountValidation =
        | { valid: true; amount: number }
        | { valid: false; error: string };

      export function validateSettlementAmount(
        amountInput: string,
        outstandingAmount: number
      ): SettlementAmountValidation {
        const trimmed = amountInput.trim();
        const amount = Number(trimmed);

        if (trimmed === "" || !Number.isFinite(amount) || amount <= 0) {
          return { valid: false, error: "Enter a valid amount greater than zero." };
        }

        if (Math.round(amount * 100) > Math.round(outstandingAmount * 100)) {
          return {
            valid: false,
            error: "This amount is more than the outstanding balance.",
          };
        }

        return { valid: true, amount };
      }

      export interface SettleBalanceInput {
        fromId: string | null;
        toId: string | null;
        amount: number;
      }

      export type SettleBalanceResult =
        | { ok: true; balances: TripBalancesResult; tripCurrency: string }
        | { ok: false; error: string };

      export async function settleBalance(
        tripId: string,
        input: SettleBalanceInput,
        auth: ParticipantAuth
      ): Promise<SettleBalanceResult> {
        try {
          const response = await fetch(`/api/trips/${tripId}/settlements`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders(auth) },
            body: JSON.stringify(input),
          });

          if (!response.ok) {
            return { ok: false, error: FRIENDLY_ERROR };
          }

          const data = (await response.json()) as {
            balances: TripBalancesResult;
            tripCurrency: string;
          };

          return {
            ok: true,
            balances: data.balances,
            tripCurrency: data.tripCurrency,
          };
        } catch {
          return { ok: false, error: FRIENDLY_ERROR };
        }
      }
      ```
      `FRIENDLY_ERROR` and `authHeaders` are the existing module-level const/function
      `fetchTripBalances` already uses — reuse them exactly, do not redeclare either.

      Constraints: `getTripBalances` and `validateSettlementAmount` stay pure — no `fetch`, no
      storage, no DOM, no clock (only `settleBalance` touches `fetch`, matching
      `fetchTripBalances`'s existing boundary). Do not modify `BalanceExpenseInput`,
      `TripBalancesFetchResult`, `fetchTripBalances`, or `app/api/trips/[id]/balances/route.ts` in
      this task.

- [x] **Step 5 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 6 — Commit.**
      Message: `feat(022): add settlement netting, validation, and the settleBalance client wrapper`

---

### Task 3: [Route] — `GET /api/trips/[id]/balances` includes settlements

**Files**
- modify: `app/api/trips/[id]/balances/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step — this task adds behavior to an already-passing route (the default parameter added in
Task 2 keeps it compiling); the change is proven by the regression run here and by Task 7's
Playwright coverage.

- [x] **Step 1 — Add the type import.** Change the existing:
      ```ts
      import { getTripBalances } from "@/lib/balances";
      import type { BalanceExpenseInput } from "@/lib/balances";
      ```
      to:
      ```ts
      import { getTripBalances } from "@/lib/balances";
      import type { BalanceExpenseInput, BalanceSettlementInput } from "@/lib/balances";
      ```

- [x] **Step 2 — Load settlements.** Immediately after the existing line
      ```ts
      const rates = await db.exchangeRate.findMany({ where: { tripId: id } });
      ```
      add:
      ```ts
      const settlements = await db.settlement.findMany({ where: { tripId: id } });
      ```

- [x] **Step 3 — Pass settlements into the computation.** Change the existing:
      ```ts
      const balances = getTripBalances(
        balanceExpenses,
        trip.currency,
        rates.map((r) => ({ currency: r.currency, rate: r.rate }))
      );
      ```
      to:
      ```ts
      const balanceSettlements: BalanceSettlementInput[] = settlements.map((s) => ({
        fromId: s.fromId,
        toId: s.toId,
        amount: s.amount,
      }));

      const balances = getTripBalances(
        balanceExpenses,
        trip.currency,
        rates.map((r) => ({ currency: r.currency, rate: r.rate })),
        balanceSettlements
      );
      ```

      Constraints: do not change this route's auth logic, its 404/403/500 response shapes, or its
      success response shape (`{ balances, tripCurrency }`) — this task only widens the computation
      input. Do not modify `app/api/trips/[id]/exchange-rates/route.ts` or any other route file.

- [x] **Step 4 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/balances` (already existed; unchanged path).
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 5 — Commit.**
      Message: `feat(022): include settlements when computing GET /api/trips/[id]/balances`

---

### Task 4: [Route] — `POST /api/trips/[id]/settlements`

**Files**
- create: `app/api/trips/[id]/settlements/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step — a Route Handler is invoked over HTTP, not via a TS import; its correctness is proven
by `npm run build` here and by Task 7's Playwright coverage.

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/api/trips/[id]/settlements/route.ts (create)
      Exports: POST(request: Request, { params }: { params: Promise<{ id: string }> }):
                 Promise<Response>
      Imports:
        import { db } from "@/lib/db";
        import { getTripBalances } from "@/lib/balances";
        import type { BalanceExpenseInput, BalanceSettlementInput } from "@/lib/balances";
        import { TRIP_CREATOR_ID } from "@/lib/sharedExpenses";

      Expected request body shape (untyped `unknown`, validated below):
        { fromId: string | null; toId: string | null; amount: number }

      Behavior, in this exact order:

      1. Parse the body in its own try/catch, separate from the handler's main try/catch (mirrors
         `app/api/trips/[id]/exchange-rates/route.ts`'s existing pattern — type it `unknown`, never
         `any`):
         ```ts
         let rawBody: unknown;
         try {
           rawBody = await request.json();
         } catch {
           return Response.json({ error: "Invalid settlement." }, { status: 400 });
         }
         ```
      2. Inside the handler's main try/catch (whose catch block is step 8 below):
         a. `const body = (rawBody ?? {}) as Record<string, unknown>;`
         b. `const { id } = await params;`
         c. `const trip = await db.trip.findUnique({ where: { id } });`
            trip is null -> `return Response.json({ error: "Trip not found." }, { status: 404 });`
      3. Auth check, identical shape to `app/api/trips/[id]/balances/route.ts`'s existing GET
         handler (auth runs BEFORE any field validation):
         ```ts
         const creatorToken = request.headers.get("x-creator-token");
         const participantToken = request.headers.get("x-participant-token");
         let authorized = creatorToken !== null && creatorToken === trip.creatorToken;
         if (!authorized && participantToken !== null) {
           const match = await db.participant.findFirst({
             where: { tripId: id, participantToken },
           });
           authorized = match !== null;
         }
         if (!authorized) {
           return Response.json({ error: "Not authorized." }, { status: 403 });
         }
         ```
      4. Field validation, checked in this exact order — each failure responds immediately:
         a. `body.fromId !== null && (typeof body.fromId !== "string" || body.fromId === "")` ->
            `Response.json({ error: "Invalid settlement." }, { status: 400 })`
         b. `body.toId !== null && (typeof body.toId !== "string" || body.toId === "")` -> same 400
            as (a)
         c. Resolve the two identity keys and compare them:
            ```ts
            const fromKey = (body.fromId as string | null) ?? TRIP_CREATOR_ID;
            const toKey = (body.toId as string | null) ?? TRIP_CREATOR_ID;
            ```
            `fromKey === toKey` -> `Response.json({ error: "Invalid settlement." }, { status: 400 })`
         d. `typeof body.amount !== "number" || !Number.isFinite(body.amount) || (body.amount as number) <= 0`
            -> `Response.json({ error: "Enter a valid amount greater than zero." }, { status: 400 })`
      5. Load the trip's current ledger — expenses (with shares, ordered), rates, and existing
         settlements — and recompute the current balances (mirrors the balances GET route's own
         loading code exactly, so both routes stay behaviorally identical for the same trip state):
         ```ts
         const expenses = await db.expense.findMany({
           where: { tripId: id },
           include: { shares: { orderBy: { id: "asc" } } },
         });
         const rates = await db.exchangeRate.findMany({ where: { tripId: id } });
         const existingSettlements = await db.settlement.findMany({ where: { tripId: id } });

         const balanceExpenses: BalanceExpenseInput[] = expenses.map((expense) => ({
           amount: expense.amount,
           currency: expense.currency,
           payerId: expense.payerParticipantIdSnapshot,
           payerName: expense.payerName,
           shares: expense.shares.map((share) => ({
             id: share.participantIdSnapshot,
             name: share.name,
             amount: share.amount,
           })),
         }));

         const priorSettlements: BalanceSettlementInput[] = existingSettlements.map((s) => ({
           fromId: s.fromId,
           toId: s.toId,
           amount: s.amount,
         }));

         const ratePairs = rates.map((r) => ({ currency: r.currency, rate: r.rate }));

         const currentBalances = getTripBalances(
           balanceExpenses,
           trip.currency,
           ratePairs,
           priorSettlements
         );
         ```
      6. Find the outstanding amount for this exact pair and refuse an amount exceeding it:
         ```ts
         const matchingLine = currentBalances.lines.find(
           (line) => line.fromId === fromKey && line.toId === toKey
         );
         const outstandingAmount = matchingLine?.amount ?? 0;
         const requestedAmount = body.amount as number;

         if (Math.round(requestedAmount * 100) > Math.round(outstandingAmount * 100)) {
           return Response.json(
             { error: "This amount is more than the outstanding balance." },
             { status: 400 }
           );
         }
         ```
      7. Create the settlement and respond with the freshly recomputed balances. Round to the
         nearest cent before persisting — `requestedAmount` arrives as a raw client-supplied
         `number` and must not be written to the ledger un-rounded, since a value like
         `19.999999999999996` would otherwise drift the stored total away from the `.toFixed(2)`
         figure the UI always displays:
         ```ts
         const amount = Math.round(requestedAmount * 100) / 100;

         await db.settlement.create({
           data: {
             tripId: id,
             fromId: body.fromId as string | null,
             toId: body.toId as string | null,
             amount,
           },
         });

         const updatedBalances = getTripBalances(
           balanceExpenses,
           trip.currency,
           ratePairs,
           [
             ...priorSettlements,
             { fromId: body.fromId as string | null, toId: body.toId as string | null, amount },
           ]
         );

         return Response.json(
           { balances: updatedBalances, tripCurrency: trip.currency },
           { status: 200 }
         );
         ```
      8. catch (error) block for the main try (step 2 onward):
         `console.error("POST /api/trips/[id]/settlements failed:", error);`
         `return Response.json({ error: "Could not settle the balance." }, { status: 500 });`

      Constraints: never import `lib/storage.ts` (server-only file; must not read `localStorage`).
                   `params` is a Promise, same convention as every existing dynamic Route Handler in
                   this repo. The field-validation order in step 4 is exact — the two type/blank
                   checks and the `fromKey === toKey` check all happen before the `amount` check,
                   and all four happen before any database read in step 5. Do not modify
                   `app/api/trips/[id]/balances/route.ts`, `app/api/trips/[id]/exchange-rates/route.ts`,
                   or any other existing route file. No `db.$transaction` around steps 5–7 — two
                   requests racing to settle the same pair at nearly the same instant could both
                   read the same pre-settlement outstanding amount and both pass validation; this is
                   spec.md §1.6's explicit Out of Scope ("Concurrent settlement of the same balance
                   from both sides at nearly the same time"), mirroring feature 020's identical,
                   already-shipped decision not to guard its own analogous concurrent-edit race. Do
                   not add locking or a transaction here beyond what is written above.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/settlements`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(022): add POST /api/trips/[id]/settlements`

---

### Task 5: [UI] — `components/ConfirmSettleBalance.tsx`

**Files**
- create: `components/ConfirmSettleBalance.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (no component mounts it until Task 6, mirrors `components/ConfirmParticipantAction.tsx`'s
own landing in feature 019).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: components/ConfirmSettleBalance.tsx (create — plain component, no 'use client' needed,
            mirrors components/ConfirmParticipantAction.tsx)
      Exports: default function ConfirmSettleBalance({ line, tripCurrency, onConfirm, onCancel }: {
        line: BalanceLine;
        tripCurrency: string;
        onConfirm: (amount: number) => void;
        onCancel: () => void;
      }): JSX.Element
      Imports:
        import { useState } from "react";
        import type { JSX } from "react";
        import type { BalanceLine } from "@/lib/types";
        import { validateSettlementAmount } from "@/lib/balances";

      Behavior:
        const [amountInput, setAmountInput] = useState(line.amount.toFixed(2));
        const [error, setError] = useState<string | null>(null);

        function handleSettle() {
          const result = validateSettlementAmount(amountInput, line.amount);
          if (!result.valid) {
            setError(result.error);
            return;
          }
          onConfirm(result.amount);
        }

      Render (exact markup):
        return (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <div className="flex flex-col gap-4 rounded bg-(--background) p-6">
              <p>
                {`${line.fromName} owes ${line.toName} `}
                <span className="font-mono">{`${tripCurrency} ${line.amount.toFixed(2)}`}</span>
              </p>
              <label className="flex flex-col gap-1">
                <span>Amount to settle</span>
                <input
                  type="text"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="font-mono"
                />
              </label>
              {error && <p role="alert">{error}</p>}
              <div className="flex gap-2">
                <button type="button" className="btn-primary" onClick={handleSettle}>
                  Settle
                </button>
                <button type="button" className="btn-secondary" onClick={onCancel}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );

      Constraints: performs no `fetch` and touches no storage — `onConfirm`/`onCancel` are this
                   component's only side-effecting calls, both supplied by the parent. Do not modify
                   `components/ConfirmParticipantAction.tsx` or `components/TripBalances.tsx`.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(022): add components/ConfirmSettleBalance.tsx`

---

### Task 6: [UI] — `components/TripBalances.tsx` gains a "Settle" control per line

**Files**
- modify: `components/TripBalances.tsx`
- test: `npx tsc --noEmit`, `npm run lint`
- _amendment: `e2e/021-view-trip-balances.spec.ts` also changed in this task — its assertion that no
  settlement row carried a control pinned behavior this task deliberately changed, so the behavioral
  gate could not pass without it. Test 9 in that spec also had to read its amounts from the mono span
  once the row text included the new button label. See log.txt Task 6._

No red step — modifies an already-passing component; the change is proven by the regression run
here and by Task 7's Playwright coverage (and, once the 021 spec was amended, by
`npx playwright test e2e/021-view-trip-balances.spec.ts` going green again).

- [x] **Step 1 — Update imports.** Change the existing:
      ```ts
      import { useEffect, useState } from "react";
      import { useRouter } from "next/navigation";
      ```
      to:
      ```ts
      import { useEffect, useRef, useState } from "react";
      import { useRouter } from "next/navigation";
      ```
      (adds `useRef` to the existing React import — do not add a second `import ... from "react"`
      line). Then change the existing:
      ```ts
      import { fetchTripBalances } from "@/lib/balances";
      import type { ParticipantAuth } from "@/lib/participants";
      ```
      to:
      ```ts
      import { fetchTripBalances, settleBalance } from "@/lib/balances";
      import type { ParticipantAuth } from "@/lib/participants";
      import { TRIP_CREATOR_ID } from "@/lib/sharedExpenses";
      import type { BalanceLine } from "@/lib/types";
      import ConfirmSettleBalance from "@/components/ConfirmSettleBalance";
      ```

- [x] **Step 2 — Add state.** Immediately after the existing:
      ```ts
      const [balances, setBalances] = useState<TripBalancesResult | null>(null);
      const [tripCurrency, setTripCurrency] = useState<string>("");
      ```
      add:
      ```ts
      const [confirmTarget, setConfirmTarget] = useState<BalanceLine | null>(null);
      const [actionError, setActionError] = useState<string | null>(null);
      const settlingRef = useRef(false);
      ```

- [x] **Step 3 — Add the settle handler.** As a new function inside the component body, after the
      existing `useEffect` block that defines and calls `load`:
      ```ts
      async function handleSettleConfirm(amount: number) {
        if (role === null || confirmTarget === null || settlingRef.current) return;
        settlingRef.current = true;

        const auth: ParticipantAuth =
          role.kind === "creator"
            ? { role: "creator", token: role.token }
            : { role: "participant", token: role.token };

        const fromId =
          confirmTarget.fromId === TRIP_CREATOR_ID ? null : confirmTarget.fromId;
        const toId =
          confirmTarget.toId === TRIP_CREATOR_ID ? null : confirmTarget.toId;

        const result = await settleBalance(role.tripId, { fromId, toId, amount }, auth);

        if (!result.ok) {
          setActionError(result.error);
          setConfirmTarget(null);
          settlingRef.current = false;
          return;
        }

        setActionError(null);
        setBalances(result.balances);
        setTripCurrency(result.tripCurrency);
        setConfirmTarget(null);
        settlingRef.current = false;
      }
      ```

- [x] **Step 4 — Render the action error.** Immediately after the existing
      `<h1 className="text-xl font-semibold">Balances</h1>` line inside the ready-state return
      block (the same container the `balances !== null && (...)` expression is already inside),
      add:
      ```tsx
      {actionError && <p role="alert">{actionError}</p>}
      ```
      This must render regardless of which `balances` branch is active below it, since a failed
      settle leaves `balances` populated with its last-known-good value.

- [x] **Step 5 — Add the Settle button and the modal.** Change the existing settlement-list
      markup from:
      ```tsx
      <ul className="flex flex-col divide-y divide-(--border)">
        {balances.lines.map((line) => (
          <li key={`${line.fromId}-${line.toId}`} className="py-2">
            {`${line.fromName} owes ${line.toName} `}
            <span className="font-mono">
              {`${tripCurrency} ${line.amount.toFixed(2)}`}
            </span>
          </li>
        ))}
      </ul>
      ```
      to:
      ```tsx
      <ul className="flex flex-col divide-y divide-(--border)">
        {balances.lines.map((line) => (
          <li
            key={`${line.fromId}-${line.toId}`}
            className="flex items-center justify-between gap-2 py-2"
          >
            <span>
              {`${line.fromName} owes ${line.toName} `}
              <span className="font-mono">
                {`${tripCurrency} ${line.amount.toFixed(2)}`}
              </span>
            </span>
            <button
              type="button"
              className="btn-text"
              onClick={() => setConfirmTarget(line)}
            >
              Settle
            </button>
          </li>
        ))}
      </ul>
      ```
      Then, immediately after the closing `)}` of the `{balances !== null && (...)}` expression,
      still inside the same outer `<div className="flex flex-col gap-4 p-4">`, add:
      ```tsx
      {confirmTarget && (
        <ConfirmSettleBalance
          line={confirmTarget}
          tripCurrency={tripCurrency}
          onConfirm={handleSettleConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
      ```

      Constraints: do not modify the `loadState === "error"` branch, the role-resolution
      `useEffect`, the `isComplete === false` branch, or the "settled up" branch — a Settle button
      is only ever added inside the `<ul>` (there are no lines to settle in either of those other
      two states). Do not modify `components/ConfirmSettleBalance.tsx` in this task.

- [x] **Step 6 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 7 — Commit.**
      Message: `feat(022): wire a Settle control and confirm modal into TripBalances`

---

### Task 7: [Behavioral] — Playwright coverage for the full feature

**Files**
- create: `e2e/022-settle-up-a-balance.spec.ts`
- test: `npx playwright test e2e/022-settle-up-a-balance.spec.ts`

- [x] **Step 1 — Write the spec**, covering 10 tests (E2E-022-01 through E2E-022-10, mapping to
      spec.md §4). Duplicate (do not import) the following helpers from
      `e2e/021-view-trip-balances.spec.ts`, unchanged: `STORAGE_KEYS`, `TRIP`, `seedStorage`,
      `createRealTripLink`, `joinViaApi`, `buildJoinedTrip`, `creatorSession`, `createExpenseViaApi`,
      `removeViaApi`, `balancesScreen`, `waitForBalancesScreen`, `waitForSettlementLines`,
      `expectNoSettlementLines`. Add three new helpers specific to this spec:
      - `settleDialog(page)`: `page.getByRole("dialog")`.
      - `openSettleDialog(page, row)`: clicks `row.getByRole("button", { name: "Settle" })`, then
        `await expect(settleDialog(page)).toBeVisible()`.
      - `confirmSettle(page, amount?)`: if `amount` is given, fills
        `settleDialog(page).getByLabel("Amount to settle")` with it; then clicks
        `settleDialog(page).getByRole("button", { name: "Settle" })`.
      - `cancelSettle(page)`: clicks `settleDialog(page).getByRole("button", { name: "Cancel" })`.

      Wrap the whole `test.describe` in `test.describe.configure({ mode: "serial", timeout:
      120_000 })`, matching `e2e/021-view-trip-balances.spec.ts`'s existing rationale (one shared
      `next dev` server compiling each dynamic route on first request).

      Per-scenario seeding and assertions:
      - **E2E-022-01** (AC-022-01): create a trip+link, join "Alex". Create an expense via
        `createExpenseViaApi`: amount `20`, `payerParticipantId: null`, shares
        `[{ participantId: alex.participantId, amount: 20 }]` (Alex owes the creator 20.00). Seed
        `creatorSession(link)`, visit `/trips/{shareToken}/balances`. Wait for 1 settlement line via
        `waitForSettlementLines(page, 1)`. Open the settle dialog on that row and confirm with no
        amount argument (the pre-filled default, `20.00`). Assert `expectNoSettlementLines(page)`
        and that `balancesScreen(page).getByRole("status")` contains "settled up".
      - **E2E-022-02** (AC-022-02, debtor triggers): create a trip+link, join "Alex". Create the
        same 20.00 expense as E2E-022-01 (Alex owes the creator). Seed
        `{ joinedTrips: [buildJoinedTrip(link, alex, "Alex")] }` (Alex's own device — the debtor).
        Visit the balances screen, wait for 1 line, open its dialog, confirm with no amount. Assert
        `expectNoSettlementLines(page)`.
      - **E2E-022-03** (AC-022-02, creditor triggers): identical trip/expense setup to E2E-022-02,
        but seed `creatorSession(link)` instead (the creator — the creditor on this line). Same
        assertions as E2E-022-02.
      - **E2E-022-04** (AC-022-03): create a trip+link, join "Alex". Create the same 20.00 expense.
        Seed `creatorSession(link)`, visit the balances screen, wait for 1 line, open its dialog,
        confirm with amount `"5"`. Assert the (still 1) settlement line's text now contains
        "15.00" — re-locate it via `waitForSettlementLines(page, 1)` after the dialog closes.
      - **E2E-022-05** (AC-022-04): create a trip+link, join "Alex", the same 20.00 expense. Seed
        `creatorSession(link)`, visit the balances screen, wait for 1 line. For each of `"0"`,
        `"-5"`, `"abc"` in turn: open the settle dialog, call `confirmSettle(page, value)`, assert
        `settleDialog(page).getByRole("alert")` is visible, then call `cancelSettle(page)`. After
        all three, assert `waitForSettlementLines(page, 1)` still shows the line containing
        "20.00" (unchanged).
      - **E2E-022-06** (AC-022-05): same setup as E2E-022-05. Open the dialog once, call
        `confirmSettle(page, "25")`, assert `settleDialog(page).getByRole("alert")` is visible and
        contains "more than the outstanding balance", then `cancelSettle(page)` and assert the line
        still reads "20.00".
      - **E2E-022-07** (AC-022-06): create a trip+link, join "Alex". Create the 20.00 expense (Alex
        owes creator). Seed `creatorSession(link)`, visit the balances screen, wait for 1 line, open
        its dialog, confirm with amount `"5"` (line now reads "15.00" — same mechanic as
        E2E-022-04). Then, via `createExpenseViaApi`, record a second expense: amount `10`,
        `payerParticipantId: null`, shares `[{ participantId: alex.participantId, amount: 10 }]`
        (Alex owes the creator 10.00 more, same direction). Reload the page
        (`await page.reload()`) and assert `waitForSettlementLines(page, 1)` now shows a line
        containing "25.00" (`15 + 10`).
      - **E2E-022-08** (AC-022-07): create a trip+link, join "Alex" and "Blair". Create an expense:
        amount `20`, `payerParticipantId: blair.participantId`, shares
        `[{ participantId: alex.participantId, amount: 20 }]` (Alex alone owes Blair 20.00). Remove
        Alex via `removeViaApi`. Seed `{ joinedTrips: [buildJoinedTrip(link, blair, "Blair")] }`
        (Blair's own device). Visit the balances screen, wait for 1 line containing "Alex" and
        "Blair", open its dialog, confirm with no amount (settle the full 20.00). Assert
        `expectNoSettlementLines(page)`.
      - **E2E-022-09** (AC-022-08): create a trip+link, join "Alex", the same 20.00 expense. Seed
        `creatorSession(link)`, visit the balances screen, wait for 1 line. Open the settle dialog,
        then call `cancelSettle(page)` without ever calling `confirmSettle`. Assert
        `waitForSettlementLines(page, 1)` still shows the line containing "20.00", and that
        `settleDialog(page)` is no longer visible.
      - **E2E-022-10** (AC-022-09, AC-022-10): create a trip+link, join "Alex", the same 20.00
        expense. Install `page.route("**/api/trips/*/settlements", (route) => route.abort())`
        BEFORE navigating. Seed `creatorSession(link)`, visit the balances screen, wait for 1 line,
        open its dialog, confirm with no amount. Assert `balancesScreen(page).getByRole("alert")`
        contains "Could not reach the server", and that `waitForSettlementLines(page, 1)` still
        shows the line containing "20.00" (unchanged).

      Per `.claude/repo-profile.md` § Behavioral gate: seed all required `localStorage` via
      `page.addInitScript` before first render. Scope every `role="alert"`/`role="status"`
      assertion to `balancesScreen(page)` or `settleDialog(page)`, never the page root, to avoid
      colliding with Next.js's own route announcer.

- [x] **Step 2 — Run it and confirm it passes.**
      `npx playwright test e2e/022-settle-up-a-balance.spec.ts`
      Expected: exit 0, `10 passed`.

- [x] **Step 3 — Regression.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/balances`, `/api/trips/[id]/settlements`, and `/trips/[token]/balances`.

- [x] **Step 4 — Commit.**
      Message: `feat(022): add Playwright coverage for settling up a balance`

---

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

    feat(022): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: features/022.settle-up-a-balance.md

Never commit on a failing lint, typecheck, or build.

---

## Completion Summary

**What was built** (7 tasks, 7 commits: `971ad68`, `45c7a87`, `fe0870b`, `9f828d0`, `47557c0`, `836bd63`, `893bda1`)

A `Settlement` Prisma model plus its migration; settlement netting inside `lib/balances.ts`'s pure
`getTripBalances`, so a settlement combines with the expense ledger on every recompute instead of
being a separate adjustment layer; a pure `validateSettlementAmount` and a `settleBalance` client
wrapper; the balances GET widened to load settlements; a new `POST /api/trips/[id]/settlements` that
recomputes the pair's outstanding line, refuses an amount above it, writes the row and returns the
recomputed balances; a `components/ConfirmSettleBalance.tsx` modal with the amount pre-filled and
editable; and a per-line Settle button plus a `role="alert"` action error in
`components/TripBalances.tsx`. Ten Playwright scenarios cover AC-022-01 to AC-022-10.

**Deviations from the plan as written**

- `e2e/021-view-trip-balances.spec.ts` was amended in Task 6 although that task's Files manifest
  named only the component: its assertion that no settlement row carried a control pinned the exact
  behavior 022 changed, so the behavioral gate could not stay green without it. Test 9 in that file
  also had to read its amounts from the mono span once the row text included the button label. The
  plan has been annotated at Task 6.
- Task 4's over-limit block gained an integer-cents positivity gate (`amountCents <= 0`) and an
  explicit `matchingLine === undefined` check, after its quality gate showed that a sub-cent amount
  like `0.001` rounded to zero cents and wrote a zero-value row while returning 200.
- Task 7 added one helper beyond the four the plan named (`awaitSettleComplete`), three assertions
  spec §4 required but the plan's bullets omitted (two page reloads and a zero-request route spy),
  and an `E2E-022-NN` title prefix.
- Commit subjects were shortened from the plan's drafts to stay within the repo's 72-character
  convention.
- REFERENCE.md was updated by the controller in Tasks 1-6 (schema, migration history, the
  `lib/balances.ts` API, the balances route, the new settlements route, the new component, the
  `TripBalances.tsx` entry, and the creator sentinel's real translation sites). Task 7 left it
  untouched deliberately, since a new spec file is not listed by name in §4.

**Follow-ups not in scope**

- `lib/balances.ts`'s `validateSettlementAmount` still accepts a positive amount whose cents round to
  zero. The route is the real gate, so the worst case is a 400 surfacing as the generic friendly
  error rather than a bad write, but the two should agree.
- `components/ConfirmSettleBalance.tsx` has no `'use client'` directive even though it holds state
  (safe today because its only render site is itself a client component), and its dialog card uses
  `rounded p-6` where `design.md` locks radius to `rounded-lg` and the sibling modal uses `p-4` with
  a `max-w-sm`. Both came from the plan's quoted markup, not from the implementer.
- The 021 spec no longer asserts that a settlement row carries no *link*, only that it carries no
  Settle button; and `lib/sharedExpenses.ts`'s own header comment still repeats the old claim that
  the creator sentinel is translated "only inside the three fetch wrappers", which REFERENCE.md now
  contradicts.
- E2E-022-04 went red once in four cold whole-file runs and could not be attributed. If it recurs,
  assert the absence of the action error after a successful settle (or gate on `waitForResponse` for
  the POST) before touching the balance assertions; a repeat would point at a mount-time `load()`
  race in `components/TripBalances.tsx` and therefore at the app, not the spec.

**Final verification**

- `npx playwright test e2e/022-settle-up-a-balance.spec.ts` → 10 passed (run cold and whole, most
  recently by the controller immediately before Task 7's commit).
- `npx playwright test e2e/021-view-trip-balances.spec.ts` → 10 passed; `e2e/020-*.spec.ts` → 17
  passed (the neighbor regression Task 6's gate ran after changing the shared component).
- `npx tsc --noEmit` and `npm run lint` → exit 0 on every task; `npm run build` → exit 0 with
  `/api/trips/[id]/balances`, `/api/trips/[id]/settlements` and `/trips/[token]/balances` in the
  route table.
- The full suite was not re-run end to end as a single pass; the per-task gates covered the specs
  whose surface each change touched. See `log.txt` beside this plan for the per-task history.
