# 021. View Trip Balances — Implementation Plan

**Status:** Complete
**Source:** `doc/features/021-view-trip-balances/spec.md` (from `features/021.view-trip-balances.md`)
**Goal:** Let any current member of a shared trip (creator or participant) open a read-only view
that nets every recorded expense's payer/split data, converts it into the trip currency, and shows
the minimum number of settlement lines — who owes whom, and how much — while flagging the whole
view as incomplete if any currency used lacks an exchange rate.

**Architecture:**
Shared-trip exchange rates have nowhere to live today — `lib/currency.ts`'s exchange-rate model is
per-device `localStorage`, which cannot back a value every participant must see identically. This
plan adds a small `ExchangeRate` Prisma model scoped to a trip (`tripId`, `currency`, `rate`,
`@@unique([tripId, currency])`) and a `PUT /api/trips/[id]/exchange-rates` endpoint so that data
can exist server-side — by explicit product decision (2026-09-19, recorded in spec.md §2.1/§7),
this plan ships **no entry UI** for it; the endpoint exists purely as real infrastructure (used by
this plan's own Playwright fixtures, exactly as `e2e/020-*.spec.ts`'s `createExpenseViaApi` seeds
state directly against the API) and to avoid a second schema change when a future feature adds the
real entry screen.

The balance computation is a new pure module, `lib/balances.ts`. For each expense it nets the
payer's credit against every share's debit, keyed by the same snapshot-id-or-`TRIP_CREATOR_ID`
identity feature 020 already established (`payerParticipantIdSnapshot`/`participantIdSnapshot`
survive a participant's removal; the live FK does not). Currency conversion happens once per
expense (`amount × rate`, rounded to the nearest cent), then that converted total is redistributed
across the expense's own shares in the same proportion as the original amounts, with the last share
absorbing any rounding remainder — mirroring `lib/sharedExpenses.ts`'s `calculateEvenSplit`
remainder-carrying convention. Every net balance is accumulated in integer cents, so "the total
owed equals the total owing" (BR-021-10) requires no epsilon comparison anywhere. Net positions are
then reduced to a minimal settlement-line set via a greedy largest-creditor/largest-debtor match.

A new Route Handler, `GET /api/trips/[id]/balances`, loads the trip, its expenses (with shares),
and its exchange rates, and returns `{ balances: TripBalancesResult, tripCurrency: string }`. A new
client screen, `components/TripBalances.tsx`, mounted at `/trips/[token]/balances`, resolves the
viewing device's role from local storage exactly as `components/ManageParticipants.tsx` already
does, fetches that endpoint, and renders one of: a friendly connectivity/server error (one
collapsed path satisfying both the "offline" and "server unreachable" scenarios — this app has no
real `navigator.onLine` detection anywhere; every existing "offline" test in this repo simulates it
with `page.route(...).abort()`), an "incomplete" notice, a "settled up" notice, or the settlement
list. `components/ShareTripLink.tsx` and `components/JoinedTripSummary.tsx` each gain a "View
balances" link — the creator's and the participant's entry points, respectively.

Per spec.md §1.6/§7: this plan does **not** build a full shared-trip dashboard (only the balances
view + its two entry links), does **not** add a shared-trip expense list, does **not** add any
settle/mark-paid control (feature 022), and does **not** touch `lib/currency.ts` or
`components/Dashboard.tsx` (the solo-trip surface).

> **Assumed** (plumbing not spelled out in spec.md §2.2/§2.3's literal contracts, needed for the
> design to actually work): the `GET /api/trips/[id]/balances` response carries a top-level
> `tripCurrency: string` alongside `balances`, so `components/TripBalances.tsx` can render each
> line's currency code without trusting a possibly-stale local cache; and `lib/balances.ts` (Task
> 3) additionally exports a `fetchTripBalances` client wrapper and its `TripBalancesFetchResult`
> type, exactly mirroring the fetch-wrapper pattern every other shared-trip `lib/*.ts` module
> already carries (`lib/participants.ts`'s `getParticipants`, `lib/sharedExpenses.ts`'s
> `createSharedExpense`) — spec.md's TS-021-06 already requires `TripBalances.tsx` to "fetch `GET
> /api/trips/{tripId}/balances`," and this repo's convention is that a component never calls
> `fetch` inline, only through a `lib/*.ts` wrapper. Neither addition changes user-facing scope.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Reuses features 016/017/019/020's Prisma + `@prisma/adapter-neon` + `@neondatabase/serverless`
dependencies and the `lib/db.ts` singleton — no new package. One schema migration (Task 2) adds
`ExchangeRate`. Verification: `npm run lint`, `npx tsc --noEmit`, `npm run build` (route-touching
tasks), `npx playwright test e2e/021-view-trip-balances.spec.ts` (behavioral gate).

> **Methodology note on "red steps."** As in feature 020's plan, several tasks create a file with
> no existing TS consumer yet in that same task (a Route Handler invoked only over HTTP, or a
> component not yet mounted). Where no real call site exists in-task, the step is written as
> implement-then-verify-green instead. Noted per-task, not silently skipped.

---

### Task 1: [Types] — `lib/types.ts` gains `SharedExchangeRate`, `BalanceLine`, `TripBalancesResult`

**Files**
- modify: `lib/types.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (foundational addition with no consumer yet in this task, mirrors 020's Task 1 for
`SharedExpense`/`SharedExpenseShare`).

- [x] **Step 1 — Add the types.** Append after the existing `SharedExpense` interface (the last
      declaration in the file, currently ending at line 77 with the closing `}` of `SharedExpense`):
      ```ts
      export interface SharedExchangeRate {
        id: string;
        tripId: string;
        currency: string;
        rate: number;
      }

      export interface BalanceLine {
        fromId: string; // TRIP_CREATOR_ID (from lib/sharedExpenses.ts) or a Participant id
        fromName: string;
        toId: string;
        toName: string;
        amount: number; // trip-currency, rounded to 2 decimal places
      }

      export interface TripBalancesResult {
        lines: BalanceLine[];
        isComplete: boolean;
        missingCurrencies: string[]; // non-trip currencies used in expenses with no rate on file
      }
      ```
      Do not modify any existing type in this file.

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(021): add SharedExchangeRate, BalanceLine, and TripBalancesResult types`

---

### Task 2: [Config] — Prisma schema gains `ExchangeRate`

**Files**
- modify: `prisma/schema.prisma`
- test: `npx prisma generate`, `npx prisma migrate dev --name add_exchange_rate`,
  `npx tsc --noEmit`, `npm run lint`

- [x] **Step 1 — Add the relation field to the existing `Trip` model.** Inside the existing
      `model Trip { ... }` block, add one new field as the last line before the closing brace
      (after the existing `expenses Expense[]` line):
      ```prisma
        exchangeRates      ExchangeRate[]
      ```
      Do not modify any existing field on `Trip`.

- [x] **Step 2 — Append the new model**, after `ExpenseShare`'s closing brace (the end of the
      file):
      ```prisma
      model ExchangeRate {
        id        String   @id @default(cuid())
        tripId    String
        trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
        currency  String
        rate      Float
        createdAt DateTime @default(now())
        @@unique([tripId, currency])
        @@index([tripId])
      }
      ```

- [x] **Step 3 — Regenerate the Prisma Client.**
      `npx prisma generate`
      Expected: exit 0, output containing "Generated Prisma Client".

- [x] **Step 4 — Apply the migration.**
      `npx prisma migrate dev --name add_exchange_rate`
      Expected: exit 0, output confirming the migration was applied and a new
      `prisma/migrations/<timestamp>_add_exchange_rate/migration.sql` file was created.
      Note: on the first attempt this exited 1 on a pre-existing stale checksum for migration
      `20260918160954_add_participant_id_snapshots`; the controller repaired that row's checksum
      (user-approved, non-destructive) and re-ran the command to green — see log.txt Task 2.

- [x] **Step 5 — Regression.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 6 — Commit.**
      Message: `feat(021): add ExchangeRate model to the Prisma schema`

---

### Task 3: [Domain] — `lib/balances.ts`

**Files**
- create: `lib/balances.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (no consumer until Tasks 4 and 6, mirrors `lib/sharedExpenses.ts`'s own landing in
feature 020).

- [x] **Step 1 — Implement to this contract.**
      ~~The literal `getTripBalances` body below~~ **Amended 2026-09-19 before commit**: the
      quality gate caught a `0/0` → `NaN` division when `originalTotalCents === 0` (reachable —
      a 0.004 amount passes both expense routes) and a non-finite / `<= 0` stored rate counting
      as usable. Both are fixed in the committed file; see log.txt Task 3 for the exact deltas.
      The rest of this block is the code as written.
      ```
      File: lib/balances.ts (create)
      Imports:
        import type { SharedExchangeRate, BalanceLine, TripBalancesResult } from "@/lib/types";
        import { TRIP_CREATOR_ID } from "@/lib/sharedExpenses";
        import type { ParticipantAuth } from "@/lib/participants";

      Export interface BalanceExpenseInput:
        export interface BalanceExpenseInput {
          amount: number;
          currency: string;
          payerId: string | null; // null = trip creator, same convention as SharedExpense.payerParticipantId
          payerName: string;
          shares: { id: string | null; name: string; amount: number }[];
        }

      Export — getTripBalances(expenses, tripCurrency, rates) computes net balances and simplifies
      them to a minimum settlement-line set. Precondition (caller's responsibility, not
      re-validated here): each expense's `shares` amounts already sum to that expense's `amount`.
      Literal implementation (exactness matters — the remainder-carrying and integer-cents
      accumulation are what guarantee the group's total owed equals total owing with no drift):

      ```ts
      export function getTripBalances(
        expenses: BalanceExpenseInput[],
        tripCurrency: string,
        rates: Pick<SharedExchangeRate, "currency" | "rate">[]
      ): TripBalancesResult {
        const usedCurrencies = Array.from(
          new Set(
            expenses.map((e) => e.currency).filter((c) => c !== tripCurrency)
          )
        );
        const missingCurrencies = usedCurrencies
          .filter((c) => !rates.some((r) => r.currency === c))
          .sort();

        if (missingCurrencies.length > 0) {
          return { lines: [], isComplete: false, missingCurrencies };
        }

        const netCents = new Map<string, number>();
        const names = new Map<string, string>();

        function addNet(id: string, name: string, deltaCents: number): void {
          netCents.set(id, (netCents.get(id) ?? 0) + deltaCents);
          if (!names.has(id)) names.set(id, name);
        }

        for (const expense of expenses) {
          const rate =
            expense.currency === tripCurrency
              ? 1
              : rates.find((r) => r.currency === expense.currency)!.rate;
          const convertedTotalCents = Math.round(expense.amount * rate * 100);
          const originalTotalCents = Math.round(expense.amount * 100);

          const payerId = expense.payerId ?? TRIP_CREATOR_ID;
          addNet(payerId, expense.payerName, convertedTotalCents);

          let assignedCents = 0;
          expense.shares.forEach((share, index) => {
            const shareId = share.id ?? TRIP_CREATOR_ID;
            const isLast = index === expense.shares.length - 1;
            let shareCents: number;
            if (isLast) {
              shareCents = convertedTotalCents - assignedCents;
            } else {
              const originalShareCents = Math.round(share.amount * 100);
              shareCents = Math.round(
                (originalShareCents / originalTotalCents) * convertedTotalCents
              );
              assignedCents += shareCents;
            }
            addNet(shareId, share.name, -shareCents);
          });
        }

        const creditors = Array.from(netCents.entries())
          .filter(([, cents]) => cents > 0)
          .map(([id, cents]) => ({ id, name: names.get(id)!, cents }))
          .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));

        const debtors = Array.from(netCents.entries())
          .filter(([, cents]) => cents < 0)
          .map(([id, cents]) => ({ id, name: names.get(id)!, cents: -cents }))
          .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name));

        const lines: BalanceLine[] = [];
        let i = 0;
        let j = 0;
        while (i < creditors.length && j < debtors.length) {
          const amountCents = Math.min(creditors[i].cents, debtors[j].cents);
          lines.push({
            fromId: debtors[j].id,
            fromName: debtors[j].name,
            toId: creditors[i].id,
            toName: creditors[i].name,
            amount: amountCents / 100,
          });
          creditors[i].cents -= amountCents;
          debtors[j].cents -= amountCents;
          if (creditors[i].cents === 0) i += 1;
          if (debtors[j].cents === 0) j += 1;
        }

        lines.sort(
          (a, b) =>
            a.fromName.localeCompare(b.fromName) ||
            a.toName.localeCompare(b.toName)
        );

        return { lines, isComplete: true, missingCurrencies: [] };
      }
      ```
      Worked check (do not skip verifying this by hand before moving on): a $10.00 expense with
      `currency === tripCurrency` split into shares `[3.33, 3.33, 3.34]` (cents `[333, 333, 334]`,
      `originalTotalCents = 1000`, `convertedTotalCents = 1000`) assigns share cents
      `round((333/1000)*1000) = 333`, `333` again, then the last share gets `1000 - 333 - 333 =
      334` — sums to exactly `1000`.

      Export interface TripBalancesFetchResult:
      ```ts
      export type TripBalancesFetchResult =
        | { ok: true; balances: TripBalancesResult; tripCurrency: string }
        | { ok: false; error: string };
      ```

      Export — fetchTripBalances(tripId, auth) — the client-side fetch wrapper `components/TripBalances.tsx`
      calls. Mirrors `lib/sharedExpenses.ts`'s `createSharedExpense` exactly in shape (same
      friendly-error string, same auth-header selection):
      ```ts
      const FRIENDLY_ERROR =
        "Could not reach the server. Check your connection and try again.";

      function authHeaders(auth: ParticipantAuth): Record<string, string> {
        return auth.role === "creator"
          ? { "x-creator-token": auth.token }
          : { "x-participant-token": auth.token };
      }

      export async function fetchTripBalances(
        tripId: string,
        auth: ParticipantAuth
      ): Promise<TripBalancesFetchResult> {
        try {
          const response = await fetch(`/api/trips/${tripId}/balances`, {
            headers: authHeaders(auth),
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

      Constraints: `getTripBalances` must be pure — no `fetch`, no storage, no DOM, no clock (only
      `fetchTripBalances` touches `fetch`). Must not modify `lib/sharedExpenses.ts`,
      `lib/participants.ts`, or `lib/currency.ts`.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(021): add lib/balances.ts net-balance computation and simplification`

---

### Task 4: [Route] — `GET /api/trips/[id]/balances`

**Files**
- create: `app/api/trips/[id]/balances/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step — a Route Handler is invoked over HTTP, not via a TS import; its correctness is proven
by `npm run build` here and by Task 10's Playwright coverage.

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/api/trips/[id]/balances/route.ts (create)
      Exports: GET(request: Request, { params }: { params: Promise<{ id: string }> }):
                 Promise<Response>
      Imports:
        import { db } from "@/lib/db";
        import { getTripBalances } from "@/lib/balances";
        import type { BalanceExpenseInput } from "@/lib/balances";

      Behavior, in this exact order, inside one try/catch:

      1. `const { id } = await params;`
      2. `const trip = await db.trip.findUnique({ where: { id } });`
         trip is null -> `return Response.json({ error: "Trip not found." }, { status: 404 });`
      3. Auth check, identical shape to `app/api/trips/[id]/participants/route.ts`'s existing GET
         handler (auth runs BEFORE any data load below):
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
      4. Load the trip's expenses with shares, and its exchange rates. **`orderBy: { id: "asc" }`
         on `shares` is required, not optional** — Prisma/Postgres does not guarantee row order
         without an explicit `ORDER BY`, and `lib/balances.ts`'s `getTripBalances` (Task 3)
         deterministically assigns any rounding remainder to whichever share is *last in the
         array* it receives. Without a stable order here, which participant absorbs that leftover
         cent could differ between two identical requests:
         ```ts
         const expenses = await db.expense.findMany({
           where: { tripId: id },
           include: { shares: { orderBy: { id: "asc" } } },
         });
         const rates = await db.exchangeRate.findMany({ where: { tripId: id } });
         ```
      5. Map the Prisma rows into `BalanceExpenseInput[]`, reading the snapshot columns (not the
         live foreign keys — a departed participant's FK is `null` but the snapshot survives, same
         reasoning as `app/api/trips/[id]/expenses/[expenseId]/route.ts`'s existing `serialize`
         helper):
         ```ts
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
         ```
      6. Compute and respond:
         ```ts
         const balances = getTripBalances(
           balanceExpenses,
           trip.currency,
           rates.map((r) => ({ currency: r.currency, rate: r.rate }))
         );
         return Response.json(
           { balances, tripCurrency: trip.currency },
           { status: 200 }
         );
         ```
      7. catch (error) block:
         `console.error("GET /api/trips/[id]/balances failed:", error);`
         `return Response.json({ error: "Could not load balances." }, { status: 500 });`

      Constraints: never import `lib/storage.ts` (server-only file; must not read `localStorage`).
                   `params` is a Promise, same convention as every existing dynamic Route Handler
                   in this repo. Do not modify `app/api/trips/[id]/expenses/route.ts`,
                   `app/api/trips/[id]/expenses/[expenseId]/route.ts`, or
                   `app/api/trips/[id]/participants/route.ts`.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/balances`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(021): add GET /api/trips/[id]/balances`

---

### Task 5: [Route] — `PUT /api/trips/[id]/exchange-rates`

**Files**
- create: `app/api/trips/[id]/exchange-rates/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step — a Route Handler is invoked over HTTP, not via a TS import; its correctness is proven
by `npm run build` here and by Task 10's Playwright fixtures, which call it directly. No client
component calls this endpoint in this feature (spec.md §2.1/§7 Open Question 1) — it exists so a
shared trip's exchange-rate data can be written at all.

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/api/trips/[id]/exchange-rates/route.ts (create)
      Exports: PUT(request: Request, { params }: { params: Promise<{ id: string }> }):
                 Promise<Response>
      Import: import { db } from "@/lib/db";

      Expected request body shape (untyped `unknown`, validated below):
        { currency: string; rate: number }

      Behavior, in this exact order:

      1. Parse the body in its own try/catch, separate from the handler's main try/catch. Type it
         `unknown`, never `any` — this repo's ESLint config (`eslint-config-next/typescript`) sets
         `@typescript-eslint/no-explicit-any` to an error, and every existing body-parsing route
         (`app/api/trips/route.ts`, `app/api/join/[token]/route.ts`) uses this exact pattern:
         ```ts
         let rawBody: unknown;
         try {
           rawBody = await request.json();
         } catch {
           return Response.json({ error: "Invalid exchange rate." }, { status: 400 });
         }
         ```
      2. Inside the handler's main try/catch (whose catch block is step 6 below):
         a. `const body = (rawBody ?? {}) as Record<string, unknown>;`
         b. `const { id } = await params;`
         c. `const trip = await db.trip.findUnique({ where: { id } });`
            trip is null -> `return Response.json({ error: "Trip not found." }, { status: 404 });`
      3. Auth check, identical shape to `app/api/trips/[id]/participants/route.ts`'s existing GET
         handler (auth runs BEFORE field validation):
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
      4. Field validation, checked in this exact order — each failure responds
         `Response.json({ error: "Invalid exchange rate." }, { status: 400 })` immediately:
         a. `typeof body.currency !== "string" || (body.currency as string).trim() === ""`
         b. `typeof body.rate !== "number" || !Number.isFinite(body.rate) || (body.rate as number) <= 0`
      5. Upsert the `(tripId, currency)` row and respond 200:
         ```ts
         const currency = (body.currency as string).trim();
         const rate = body.rate as number;
         const exchangeRate = await db.exchangeRate.upsert({
           where: { tripId_currency: { tripId: id, currency } },
           update: { rate },
           create: { tripId: id, currency, rate },
         });
         return Response.json(
           {
             exchangeRate: {
               id: exchangeRate.id,
               tripId: exchangeRate.tripId,
               currency: exchangeRate.currency,
               rate: exchangeRate.rate,
             },
           },
           { status: 200 }
         );
         ```
      6. catch (error) block for the main try (step 2 onward):
         `console.error("PUT /api/trips/[id]/exchange-rates failed:", error);`
         `return Response.json({ error: "Could not save the exchange rate." }, { status: 500 });`

      Constraints: never import `lib/storage.ts`. `params` is a Promise. The Prisma-generated
                   compound-unique field name is `tripId_currency`, matching the
                   `@@unique([tripId, currency])` constraint added in Task 2 — do not guess a
                   different name. Do not modify any other route file.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/exchange-rates`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(021): add PUT /api/trips/[id]/exchange-rates`

---

### Task 6: [UI] — `components/TripBalances.tsx`

**Files**
- create: `components/TripBalances.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (no route mounts this component until Task 7, mirrors `components/ManageParticipants.tsx`'s
own landing in feature 019).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: components/TripBalances.tsx (create, 'use client')
      Exports: default function TripBalances({ token }: { token: string }): JSX.Element | null
      Imports:
        import { useEffect, useState } from "react";
        import { useRouter } from "next/navigation";
        import type { JSX } from "react";
        import type { TripBalancesResult } from "@/lib/types";
        import { getSharedTripLink, getJoinedTrips } from "@/lib/storage";
        import { findJoinedTrip } from "@/lib/join";
        import { fetchTripBalances } from "@/lib/balances";
        import type { ParticipantAuth } from "@/lib/participants";

      Internal type:
        type ResolvedRole =
          | { kind: "creator"; tripId: string; token: string }
          | { kind: "participant"; tripId: string; token: string };

      Behavior — role resolution and fetch, in one `useEffect` keyed `[token, router]` (mirrors
      `components/ManageParticipants.tsx`'s existing effect exactly, minus its removal-related
      state):

        const router = useRouter();
        const [role, setRole] = useState<ResolvedRole | null>(null);
        const [loadState, setLoadState] = useState<"loading" | "error" | "ready">("loading");
        const [loadError, setLoadError] = useState<string | null>(null);
        const [balances, setBalances] = useState<TripBalancesResult | null>(null);
        const [tripCurrency, setTripCurrency] = useState<string>("");

        useEffect(() => {
          async function load() {
            const sharedLink = getSharedTripLink();
            let resolved: ResolvedRole | null = null;

            if (sharedLink !== null && sharedLink.shareToken === token) {
              resolved = { kind: "creator", tripId: sharedLink.tripId, token: sharedLink.creatorToken };
            } else {
              const joined = findJoinedTrip(getJoinedTrips(), token);
              if (joined !== null) {
                resolved = { kind: "participant", tripId: joined.tripId, token: joined.participantToken };
              }
            }

            if (resolved === null) {
              router.replace("/");
              return;
            }

            setRole(resolved);

            const auth: ParticipantAuth =
              resolved.kind === "creator"
                ? { role: "creator", token: resolved.token }
                : { role: "participant", token: resolved.token };

            const result = await fetchTripBalances(resolved.tripId, auth);

            if (!result.ok) {
              setLoadError(result.error);
              setLoadState("error");
              return;
            }

            setBalances(result.balances);
            setTripCurrency(result.tripCurrency);
            setLoadState("ready");
          }

          load();
        }, [token, router]);

      Render behavior, in this exact order:
        1. `if (role === null || loadState === "loading") return null;`
        2. `if (loadState === "error")` -> render:
           ```tsx
           <div className="flex flex-col gap-4 p-4">
             <h1 className="text-xl font-semibold">Balances</h1>
             <p role="alert">{loadError}</p>
           </div>
           ```
        3. Otherwise (`loadState === "ready"`, `balances` and `tripCurrency` are set) -> render the
           heading `<h1 className="text-xl font-semibold">Balances</h1>` inside the same
           `<div className="flex flex-col gap-4 p-4">` container, followed by exactly one of:
           a. `balances.isComplete === false` ->
              ```tsx
              <p role="status">
                {`Balances are incomplete. Missing a rate for ${balances.missingCurrencies.join(", ")}.`}
              </p>
              ```
           b. `balances.isComplete === true && balances.lines.length === 0` ->
              `<p role="status">Everyone is settled up.</p>`
           c. otherwise ->
              ```tsx
              <ul className="flex flex-col divide-y divide-(--border)">
                {balances.lines.map((line) => (
                  <li key={`${line.fromId}-${line.toId}`} className="py-2">
                    {`${line.fromName} owes ${line.toName} ${tripCurrency} ${line.amount.toFixed(2)}`}
                  </li>
                ))}
              </ul>
              ```
              No button, link, or other interactive element inside any `<li>` — this view is
              read-only (feature 022 owns settling a balance, not this one).

              **Amended 2026-09-19 before commit:** the amount is wrapped in its own
              `<span className="font-mono">` (names stay sans) to satisfy design.md's
              "every currency amount renders in font-mono" rule, with the separating space kept as a
              real character so the row's text content is unchanged for Task 10's assertions. The
              literal markup above is the single-sans-string form. See log.txt Task 6.
              Two further deviations, both required/compatible: the ready branch is wrapped in
              `balances !== null &&` because the plan's literal `balances.isComplete` does not
              compile against `TripBalancesResult | null` state, and the container/heading markup is
              exactly as written.

      Constraints: does not import `lib/currency.ts`, `lib/sharedExpenses.ts`, or
                   `components/Dashboard.tsx`. Must not modify `components/ManageParticipants.tsx`.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(021): add components/TripBalances.tsx`

---

### Task 7: [Route] — `app/trips/[token]/balances/page.tsx`

**Files**
- create: `app/trips/[token]/balances/page.tsx`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step (the component it renders already exists from Task 6; this task is the wiring itself,
mirrors 020's Task 8 / 019's Task 7).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/trips/[token]/balances/page.tsx (create, 'use client')
      Exports: default function BalancesPage(
        props: PageProps<"/trips/[token]/balances">
      ): JSX.Element

      Behavior:
        "use client";

        import { use } from "react";
        import TripBalances from "@/components/TripBalances";

        export default function BalancesPage(
          props: PageProps<"/trips/[token]/balances">
        ) {
          const { token } = use(props.params);
          return <TripBalances token={token} />;
        }

      Constraints: does NOT read getTrip() and does NOT redirect based on it at this route level —
                   TripBalances (Task 6) already handles the "device belongs to neither role" case
                   itself via its own router.replace("/"). Mirrors
                   app/trips/[token]/participants/page.tsx's use(props.params) pattern; do not
                   hand-write a params prop type.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/trips/[token]/balances`.
      `npx tsc --noEmit` → Expected: exit 0, no output.

      > Per REFERENCE.md §5: a brand-new route may fail `tsc` with `TS2344` on
      > `PageProps<"/trips/[token]/balances">` until `npm run build` has regenerated
      > `.next/types/routes.d.ts`. Run `npm run build` first if `npx tsc --noEmit` alone reports
      > this, then re-run `npx tsc --noEmit`; this is expected, not a real defect.

      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(021): add the /trips/[token]/balances route`

---

### Task 8: [UI] — `components/ShareTripLink.tsx` gains a "View balances" link

**Files**
- modify: `components/ShareTripLink.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npx playwright test e2e/016-generate-shareable-trip-link.spec.ts`,
  `npx playwright test e2e/019-manage-trip-participants.spec.ts`

- [x] **Step 1 — Add the link.** In the link-exists render branch (the `return` after the
      `if (link === null)` block), immediately after the existing:
      ```tsx
      <Link href={`/trips/${link.shareToken}/participants`} className="link">
        Manage participants
      </Link>
      ```
      add:
      ```tsx
      <Link href={`/trips/${link.shareToken}/balances`} className="link">
        View balances
      </Link>
      ```
      Do not add this link to the `link === null` branch (there is nothing to view yet before a
      share link exists — mirrors why "Manage participants" is also absent there). Do not modify
      any other part of this file.

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npx playwright test e2e/016-generate-shareable-trip-link.spec.ts` → Expected: exit 0, all
      tests in that file still pass (no assertion in that spec targets an exhaustive list of links
      inside this component, so an added link does not change its result count — confirm the exact
      `N passed` from this run's own output rather than assuming a prior count).
      `npx playwright test e2e/019-manage-trip-participants.spec.ts` → Expected: exit 0, all tests
      in that file still pass, same reasoning.

- [x] **Step 3 — Commit.**
      Message: `feat(021): add a "View balances" link to ShareTripLink`

---

### Task 9: [UI] — `components/JoinedTripSummary.tsx` gains a "View balances" link

**Files**
- modify: `components/JoinedTripSummary.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts`,
  `npx playwright test e2e/018-switch-between-multiple-trips.spec.ts`,
  `npx playwright test e2e/019-manage-trip-participants.spec.ts`,
  `npx playwright test e2e/020-attribute-an-expense-to-payer-and-split.spec.ts`

- [x] **Step 1 — Add the link.** Immediately after the existing:
      ```tsx
      <Link
        href={`/trips/${joinedTrip.shareToken}/expenses/new`}
        className="link self-start"
      >
        Add expense
      </Link>
      ```
      add:
      ```tsx
      <Link
        href={`/trips/${joinedTrip.shareToken}/balances`}
        className="link self-start"
      >
        View balances
      </Link>
      ```
      Do not modify any other part of this file.

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts` → Expected: exit 0, all
      tests in that file still pass (confirm the exact `N passed` from this run's own output).
      `npx playwright test e2e/018-switch-between-multiple-trips.spec.ts` → Expected: exit 0, all
      tests in that file still pass.
      `npx playwright test e2e/019-manage-trip-participants.spec.ts` → Expected: exit 0, all tests
      in that file still pass.
      `npx playwright test e2e/020-attribute-an-expense-to-payer-and-split.spec.ts` → Expected:
      exit 0, all tests in that file still pass.

- [x] **Step 3 — Commit.**
      Message: `feat(021): add a "View balances" link to JoinedTripSummary`

---

### Task 10: [Behavioral] — Playwright coverage for the full feature

**Files**
- create: `e2e/021-view-trip-balances.spec.ts`
- test: `npx playwright test e2e/021-view-trip-balances.spec.ts`

- [x] **Step 1 — Write the spec**, covering 10 scenarios (E2E-021-01 through E2E-021-10, mapping
      to spec.md §4):
      Deviations (all additive, judged non-weakening by the gate): three local wait/guard helpers
      (`waitForBalancesScreen`, `waitForSettlementLines`, `expectNoSettlementLines`) because the
      component renders null until its role and fetch resolve, so a bare count-of-zero assertion could
      pass vacuously; E2E-021-01 identifies its rows by `filter({ hasText })` rather than index; and
      `test.describe.configure({ mode: "serial", timeout: 120_000 })` following the 020 template. See
      log.txt Task 10.

      Helpers to build, duplicating (not importing) the shapes `e2e/020-attribute-an-expense-to-payer-and-split.spec.ts`
      already established:
      - `seedStorage(page, storageData)`: `page.addInitScript` writing each key/value pair into
        `window.localStorage`, using `STORAGE_KEYS = { trip: "travel-expense:trip", sharedTripLink:
        "travel-expense:shared-trip-link", joinedTrips: "travel-expense:joined-trips" }`. Called
        BEFORE `page.goto`, never after.
      - `createRealTripLink(request)`: `POST /api/trips` with a fixed trip body
        `{ destinationCountry: "Singapore", currency: "SGD", startDate: "2026-01-01", endDate:
        "2026-01-10" }`, returns `{ tripId, shareToken, creatorToken }` parsed from the response.
      - `joinViaApi(request, shareToken, name)`: `POST /api/join/${shareToken}` with `{ name }`,
        returns the parsed `{ participantId, participantToken, trip }` body.
      - `creatorSession(link)`: returns `{ trip: { destinationCountry: "Singapore", currency:
        "SGD", startDate: "2026-01-01", endDate: "2026-01-10" }, sharedTripLink: { tripId:
        link.tripId, shareToken: link.shareToken, creatorToken: link.creatorToken } }` — what
        `components/TripBalances.tsx`'s creator branch needs (mirrors `e2e/020-*.spec.ts`'s
        `creatorSession` helper).
      - `buildJoinedTrip(link, joined, name)`: returns the exact `JoinedTrip` shape `lib/types.ts`
        declares, `trip.currency` fixed at `"SGD"`.
      - `createExpenseViaApi(request, link, input)`: `POST /api/trips/${link.tripId}/expenses`
        with `{ "x-creator-token": link.creatorToken }` and
        `{ amount, currency, category: "Food", date: "2026-01-05", paymentMethod: "Cash",
        location: "Singapore", payerParticipantId: input.payerParticipantId, shares: input.shares }`
        where `input: { amount: number; currency?: string; payerParticipantId: string | null;
        shares: { participantId: string | null; amount: number }[] }` (currency defaults to
        `"SGD"` when omitted). Asserts `response.status() === 201` and returns `{ id: string }`
        parsed from `body.expense`.
      - `setExchangeRateViaApi(request, link, currency, rate)`: `PUT
        /api/trips/${link.tripId}/exchange-rates` with `{ "x-creator-token": link.creatorToken }`
        and `{ currency, rate }`. Asserts `response.status() === 200`.
      - `removeViaApi(request, link, participantId)`: `DELETE
        /api/trips/${link.tripId}/participants/${participantId}` with
        `{ "x-creator-token": link.creatorToken }`. Asserts `response.status() === 200`.
      - `balancesScreen(page)`: `page.getByRole("heading", { name: "Balances" }).locator("..")` —
        scopes assertions to the rendered container, away from Next.js's own route announcer
        (mirrors `e2e/020-*.spec.ts`'s `expenseForm`/`expenseDetail` helpers).

      Per-scenario seeding and assertions:
      - **E2E-021-01** (AC-021-01): create a trip+link, join two participants via `joinViaApi`
        ("Alex", "Blair"). Create an expense via `createExpenseViaApi`: amount `30`, currency
        `"SGD"`, `payerParticipantId: null` (creator pays), shares
        `[{ participantId: null, amount: 10 }, { participantId: alex.participantId, amount: 10 },
        { participantId: blair.participantId, amount: 10 }]`. Seed `creatorSession(link)`, visit
        `/trips/{shareToken}/balances`. Assert the balances screen's `<ul>` has exactly 2 `<li>`
        items, one reading `Alex owes Trip creator SGD 10.00` and the other `Blair owes Trip
        creator SGD 10.00` (`toContainText`, not exact-match, since amounts render inline).
        Additionally assert neither `<li>` contains a `button` or a `link` role element
        (`.getByRole("button")`/`.getByRole("link")` inside each `<li>` locator has count 0).
      - **E2E-021-02** (AC-021-02): create a trip+link (trip currency `SGD`), join one participant
        ("Alex"). Call `setExchangeRateViaApi(request, link, "USD", 1.5)`. Create an expense via
        `createExpenseViaApi`: amount `20`, currency `"USD"`, `payerParticipantId: null`, shares
        `[{ participantId: null, amount: 10 }, { participantId: alex.participantId, amount: 10 }]`.
        Seed `creatorSession(link)`, visit the balances screen. Assert the single `<li>` reads
        `Alex owes Trip creator SGD 15.00` (`10 × 1.5`) — the amount and currency code prove the
        conversion happened, not a raw `USD 10.00` figure.
      - **E2E-021-03** (AC-021-03): create a trip+link, join "Alex" and "Blair". Construct the
        chain "the trip creator owes Blair, and Blair owes Alex" the same amount, which must
        simplify to a single direct line "the trip creator owes Alex." Create expense 1 via
        `createExpenseViaApi`: amount `10`, `payerParticipantId: blair.participantId`, shares
        `[{ participantId: null, amount: 10 }]` (the creator alone owes Blair). Create expense 2:
        amount `10`, `payerParticipantId: alex.participantId`, shares
        `[{ participantId: blair.participantId, amount: 10 }]` (Blair alone owes Alex). Seed
        `creatorSession(link)`, visit the balances screen. Assert the `<ul>` has exactly 1 `<li>`,
        reading `Trip creator owes Alex SGD 10.00`, and assert the page's text content does not
        contain the substring `Blair`.
      - **E2E-021-04** (AC-021-04): create a trip+link with no expenses. Seed `creatorSession(link)`,
        visit the balances screen. Assert a `role="status"` element containing "settled up" is
        visible, and the `<ul>` (if rendered at all) has 0 `<li>` items —
        `balancesScreen(page).getByRole("listitem")` has count 0.
      - **E2E-021-05** (AC-021-05): create a trip+link, join "Alex". Create expense 1: amount `20`,
        `payerParticipantId: null`, shares `[{ participantId: alex.participantId, amount: 20 }]`
        (Alex owes creator 20). Create expense 2: amount `20`, `payerParticipantId:
        alex.participantId`, shares `[{ participantId: null, amount: 20 }]` (creator owes Alex 20
        — exactly cancels). Seed `creatorSession(link)`, visit the balances screen. Assert the
        `role="status"` "settled up" message is visible and 0 `<li>` items are rendered.
      - **E2E-021-06** (AC-021-06): create a trip+link (currency `SGD`), join "Alex". Create an
        expense via `createExpenseViaApi` with `currency: "EUR"` (no rate ever set for `EUR`),
        amount `10`, `payerParticipantId: null`, shares
        `[{ participantId: alex.participantId, amount: 10 }]`. Seed `creatorSession(link)`, visit
        the balances screen. Assert a `role="status"` element containing both "incomplete" and
        "EUR" is visible, and 0 `<li>` items are rendered.
      - **E2E-021-07** (AC-021-07): create a trip+link, join "Alex" and "Blair" via `joinViaApi`.
        Create an expense: amount `20`, `payerParticipantId: blair.participantId`, shares
        `[{ participantId: alex.participantId, amount: 20 }]` (Alex alone owes Blair). Remove Alex
        via `removeViaApi`. Seed `{ joinedTrips: [buildJoinedTrip(link, blair, "Blair")] }` (Blair's
        own device, viewing as a joined participant rather than the creator — this is the only
        scenario in this spec that exercises `components/TripBalances.tsx`'s `findJoinedTrip`
        role-resolution branch; every other scenario seeds `creatorSession`). Visit the balances
        screen. Assert the `<ul>` contains an `<li>` reading `Alex owes Blair SGD 20.00` — the
        departed participant's name still appears.
      - **E2E-021-08** (AC-021-08, AC-021-09): create a trip+link. Install
        `page.route("**/api/trips/*/balances", (route) => route.abort())` BEFORE navigating. Seed
        `creatorSession(link)`, visit the balances screen. Assert a `role="alert"` scoped inside
        `balancesScreen(page)` contains "Could not reach the server", and 0 `<li>` items are
        rendered (the `<ul>` never mounts in the error branch).
      - **E2E-021-09** (AC-021-10): create a trip+link, join "Alex" and "Blair". Create an
        expense: amount `10`, `payerParticipantId: null`, shares
        `[{ participantId: null, amount: 3.33 }, { participantId: alex.participantId, amount: 3.33 },
        { participantId: blair.participantId, amount: 3.34 }]`. Seed `creatorSession(link)`, visit
        the balances screen. Assert every `<li>`'s text contains an amount matching
        `/\d+\.\d{2}$/` (extract via a regex match on `textContent()`), and that the sum of the two
        rendered amounts (parsed as numbers) equals exactly `6.67` (creator's net: `10 - 3.33 =
        6.67`, split as `3.33` + `3.34` across the two debtors).
      - **E2E-021-10** (AC-021-11): create a trip+link via `createRealTripLink`. Seed nothing in
        `localStorage` for this device. Visit `/trips/{shareToken}/balances`. Assert the page
        navigates to `/`.

      Per `.claude/repo-profile.md` § Behavioral gate: seed all required `localStorage` via
      `page.addInitScript` before first render. Scope every `role="alert"`/`role="status"`
      assertion to the `balancesScreen(page)` container, never the page root, to avoid colliding
      with Next.js's own route announcer.

- [x] **Step 2 — Run it and confirm it passes.**
      `npx playwright test e2e/021-view-trip-balances.spec.ts`
      Expected: exit 0, `10 passed`.

- [x] **Step 3 — Regression.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/balances`, `/api/trips/[id]/exchange-rates`, and
      `/trips/[token]/balances`.

- [x] **Step 4 — Commit.**
      Message: `feat(021): add Playwright coverage for viewing trip balances`

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

    feat(021): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: features/021.view-trip-balances.md

Never commit on a failing lint, typecheck, or build.

---

## Completion Summary

**Status:** Complete — all 10 tasks committed.

### What was built

- `lib/types.ts` gained `SharedExchangeRate`, `BalanceLine` and `TripBalancesResult`.
- `prisma/schema.prisma` gained a trip-scoped `ExchangeRate` model plus migration
  `20260919050519_add_exchange_rate`; the migration tooling itself was repaired (see Follow-ups).
- `lib/balances.ts` — pure `getTripBalances` (integer cents, per-expense conversion, last share
  absorbs the rounding remainder, greedy largest-creditor/largest-debtor reduction) plus the
  `fetchTripBalances` client wrapper.
- `GET /api/trips/[id]/balances` returns `{ balances, tripCurrency }` for anyone already on the trip.
- `PUT /api/trips/[id]/exchange-rates` upserts one rate per `(tripId, currency)`. It ships no entry UI
  by explicit product decision; this feature's fixtures are its only caller.
- `components/TripBalances.tsx` mounted at `/trips/[token]/balances`, rendering one of: the collapsed
  friendly-error alert, an incomplete notice naming the missing currencies, a settled-up notice, or
  the read-only settlement list.
- Entry links for both roles: `components/ShareTripLink.tsx` (creator) and
  `components/JoinedTripSummary.tsx` (participant).
- `e2e/021-view-trip-balances.spec.ts` — 10 scenarios, the feature's behavioral gate.

### Deviations from the plan

Three, all recorded in `log.txt` with the gate verdicts that produced or judged them:

1. **`getTripBalances` has a zero-total division guard and treats a non-finite or `<= 0` rate as
   unusable** (Task 3). The plan's literal code divided `0/0` for a sub-cent expense, which is
   reachable through the app's own validation and poisoned every net the affected participants later
   appeared in; the rate rule matches `lib/currency.ts`'s existing per-device rule.
2. **The settlement amount renders in a `font-mono` span** (Task 6), because `design.md` requires
   every currency amount to be mono while the plan's literal markup used one sans text node. The row's
   text content is unchanged, so Task 10's string assertions still hold.
3. **Test-only additions in the Playwright spec** (Task 10): three wait/guard helpers that stop
   count-of-zero assertions passing vacuously, filter-based row identification, and serial mode.

### Follow-ups not in scope

- **No exchange-rate entry UI** for shared trips. `PUT /api/trips/[id]/exchange-rates` exists but
  nothing in the app calls it, so a shared trip's rates can currently only be written by tests or
  manually. A future feature owns that screen; this plan deliberately avoided a second schema change
  when it lands.
- **Feature 022 (settle up)** owns marking a balance paid. This view is read-only by design, and Task
  10 asserts no action controls render inside a row.
- **WATCH ITEM — flaky 020 assertion.** `e2e/020-attribute-an-expense-to-payer-and-split.spec.ts`'s
  last test failed once during Task 9 on its 5s `toBeVisible` for "Edit split" after a save, then
  passed in isolation, on retry, and in the gate's combined 58-test run. Unrelated to feature 021 (its
  screen does not render `JoinedTripSummary`). If it recurs, that timeout is the thing to look at.
- **WATCH ITEM — resolved, for the record.** The stale migration checksum feature 020 deliberately
  left for a user decision (its log's WATCH ITEM 1) blocked Task 2. With the user's approval the
  recorded checksum was rewritten to the committed file's SHA-256 (non-destructive; all four other
  rows already matched), after which `prisma migrate dev` works normally again. Future schema changes
  are unblocked.

### Final verification

At HEAD (`3e88429`), run by the controller:

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0, no output |
| `npm run lint` | exit 0, no output beyond npm's banner |
| `npm run build` | exit 0, "Compiled successfully", route table includes `/api/trips/[id]/balances`, `/api/trips/[id]/exchange-rates` and `/trips/[token]/balances` |
| `npx playwright test e2e/021-view-trip-balances.spec.ts` | exit 0, `10 passed` |
| `e2e/016`, `e2e/017`, `e2e/018`, `e2e/019`, `e2e/020` | all green (11, 17, 14, 10 and 17 tests respectively) |

Review gates: 11 gate verdicts across 10 tasks — 9 PASS first time, 1 FAIL (Task 3's quality gate,
fixed and re-verified), 2 additional gate re-runs after controller- or gate-requested corrections.

