# 019. Manage Trip Participants — Implementation Plan

**Status:** Complete
**Source:** `doc/features/019-manage-trip-participants/spec.md` (from `features/019.manage-trip-participants.md`)
**Goal:** Let a shared trip's creator or any joined participant view everyone currently on the
trip, with the creator visibly labeled; let the creator remove another participant; let any
non-creator participant leave voluntarily; both actions require confirmation, need connectivity,
and never touch expense data.

**Architecture:**
Additive, on top of feature 016's `Trip`/`creatorToken` and feature 017's `Participant` model —
no Prisma schema change (`Participant` already has every field this feature needs). One Route
Handler pair, `GET`/`DELETE` under `app/api/trips/[id]/participants[/[participantId]]`, reuses the
`x-creator-token`/`x-participant-token` identity model 016/017 already established. The `DELETE`
endpoint is deliberately one endpoint serving both "creator removes someone else" and "participant
leaves," distinguished only by which header matches: `x-creator-token` matching the trip's own
token authorizes removing anyone; `x-participant-token` matching the **target** row's own token
authorizes removing only that row (self-leave). On the client, one new route,
`/trips/[token]/participants`, renders one new component, `components/ManageParticipants.tsx`,
which determines the viewing device's role by comparing local storage to the URL's token — exactly
the technique `components/TripSwitcher.tsx` (018) already uses — rather than trusting anything the
server says about who the caller is. A small shared confirm modal,
`components/ConfirmParticipantAction.tsx`, gates both remove and leave behind an explicit
confirmation step, mirroring `components/AddCategoryModal.tsx`'s existing overlay convention. Two
already-shipped components each gain one new, purely additive link into this screen —
`components/ShareTripLink.tsx` (creator, from Settings) and `components/JoinedTripSummary.tsx`
(participant, from `/join/[token]` and `/trips/[token]`) — neither changing any existing rendered
text those components' own Playwright specs already assert on.

Per spec.md §2.1/Contrarian Review #1, this plan does **not** build a distinct "offline" vs.
"unreachable server" branch anywhere — both failure causes collapse into one friendly-error
message, reusing the exact `FRIENDLY_ERROR` string `lib/join.ts` and `lib/sharedTrip.ts` already use
("Could not reach the server. Check your connection and try again."). Per spec.md §1.4/§7 Open Item
1, this plan does **not** touch, reference, or attempt to preserve any expense data — no shared-trip
expense entity exists yet (feature 020); removal's obligation not to disturb expense history is
satisfied here by never going near it, and `prisma/schema.prisma`'s `Participant` model has no
relation any other model points to besides `Trip`, so a hard `db.participant.delete()` is safe
today.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Reuses features 016/017's Prisma + `@prisma/adapter-neon` + `@neondatabase/serverless` dependencies
and `lib/db.ts` singleton — no new packages, no schema migration. Verification: `npm run lint`,
`npx tsc --noEmit`, `npm run build` (route-touching tasks), `npx playwright test
e2e/019-manage-trip-participants.spec.ts` (behavioral gate).

> **Infrastructure note.** This plan needs no new `DATABASE_URL` and no migration — features
> 016/017 already provisioned a real, reachable Neon database with the exact `Participant` shape
> this feature reads and deletes from. No task below is expected to block on infrastructure.

> **Methodology note on "red steps."** Several tasks below create a file with no existing TS
> consumer yet (a Route Handler invoked only over HTTP, or a component not yet mounted). Where no
> real call site exists in-task, the step is written as implement-then-verify-green instead, exactly
> as features 016/017 landed `lib/sharedTrip.ts`/`lib/join.ts` and their own not-yet-mounted
> components. This is noted per-task, not silently skipped.

---

### Task 1: [Types] — `lib/types.ts` gains `ParticipantSummary`

**Files**
- modify: `lib/types.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (foundational addition with no consumer yet in this task).

- [x] **Step 1 — Add the type.** Append after the existing `JoinedTrip` interface:
      ```ts
      export interface ParticipantSummary {
        id: string;
        name: string;
      }
      ```
      Do not modify any existing type in this file.

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(019): add ParticipantSummary type`

---

### Task 2: [Route] — `GET /api/trips/[id]/participants` lists a trip's participants

**Files**
- create: `app/api/trips/[id]/participants/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step — a Route Handler is invoked over HTTP, not via a TS import; its correctness is proven
by `npm run build` (compiles and registers the route) here and by Task 10's Playwright coverage.

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/api/trips/[id]/participants/route.ts (create)
      Exports: GET(request: Request, { params }: { params: Promise<{ id: string }> }):
                 Promise<Response>
      Import: import { db } from "@/lib/db";

      Behavior (in this exact order, inside one try/catch):
        1. const { id } = await params;
        2. const trip = await db.trip.findUnique({ where: { id } });
           trip is null -> return Response.json({ error: "Trip not found." }, { status: 404 });
           (return immediately — do not fall through to the auth check below)
        3. const creatorToken = request.headers.get("x-creator-token");
           const participantToken = request.headers.get("x-participant-token");
        4. let authorized = creatorToken !== null && creatorToken === trip.creatorToken;
        5. if authorized is still false AND participantToken !== null:
             const match = await db.participant.findFirst({
               where: { tripId: id, participantToken },
             });
             authorized = match !== null;
        6. if authorized is false -> return Response.json({ error: "Not authorized." },
           { status: 403 });
        7. const participants = await db.participant.findMany({
             where: { tripId: id },
             orderBy: { createdAt: "asc" },
           });
        8. return Response.json(
             { participants: participants.map((p) => ({ id: p.id, name: p.name })) },
             { status: 200 }
           );
        9. catch (error): console.error("GET /api/trips/[id]/participants failed:", error);
           return Response.json({ error: "Could not load participants." }, { status: 500 });

      Constraints: never include `participantToken` in the 200 response body — only `id` and
                   `name` per participant. Must not import lib/storage.ts (server-only file; must
                   not read localStorage). `params` is a Promise, same convention as
                   app/api/trips/[id]/route.ts (016).
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/participants`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(019): add GET /api/trips/[id]/participants`

---

### Task 3: [Route] — `DELETE /api/trips/[id]/participants/[participantId]` removes a participant

**Files**
- create: `app/api/trips/[id]/participants/[participantId]/route.ts`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step — same reasoning as Task 2.

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/api/trips/[id]/participants/[participantId]/route.ts (create)
      Exports: DELETE(request: Request,
                 { params }: { params: Promise<{ id: string; participantId: string }> }):
                 Promise<Response>
      Import: import { db } from "@/lib/db";

      Behavior (in this exact order, inside one try/catch):
        1. const { id, participantId } = await params;
        2. const trip = await db.trip.findUnique({ where: { id } });
           trip is null -> return Response.json({ error: "Trip not found." }, { status: 404 });
        3. const target = await db.participant.findUnique({ where: { id: participantId } });
           target is null OR target.tripId !== id ->
             return Response.json({ error: "Participant not found." }, { status: 404 });
        4. const creatorToken = request.headers.get("x-creator-token");
           const participantToken = request.headers.get("x-participant-token");
        5. const isCreator = creatorToken !== null && creatorToken === trip.creatorToken;
           const isSelf = participantToken !== null &&
             participantToken === target.participantToken;
        6. if (!isCreator && !isSelf) ->
             return Response.json({ error: "Not authorized." }, { status: 403 });
        7. await db.participant.delete({ where: { id: participantId } });
        8. return Response.json({ ok: true }, { status: 200 });
        9. catch (error): console.error(
             "DELETE /api/trips/[id]/participants/[participantId] failed:", error
           );
           return Response.json({ error: "Could not remove the participant." }, { status: 500 });

      Constraints: `isSelf` must compare against `target.participantToken` (the row being
                   deleted), never against any other participant's token — a valid
                   `x-participant-token` for a *different* row must NOT authorize this deletion.
                   Must not import lib/storage.ts. Ignore any request body. Do not cascade or
                   touch any other model — this endpoint deletes exactly one `Participant` row.
                   Do not read, write, or delete anything from an `Expense`/expense-shaped table
                   or field — no shared-trip expense entity exists yet (feature 020), and this
                   endpoint's only obligation toward expense data (BR-019-07) is to never go near
                   it at all.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/participants/[participantId]`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(019): add DELETE /api/trips/[id]/participants/[participantId]`

---

### Task 4: [Domain] — `lib/participants.ts` client wrapper

**Files**
- create: `lib/participants.ts`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (no consumer until Task 6, mirrors `lib/join.ts`'s own landing in feature 017).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: lib/participants.ts (create)
      Exports:
        type ParticipantAuth =
          | { role: "creator"; token: string }
          | { role: "participant"; token: string }
        type ParticipantsResult =
          | { ok: true; participants: ParticipantSummary[] }
          | { ok: false; error: string }
        type RemoveParticipantResult = { ok: true } | { ok: false; error: string }
        getParticipants(tripId: string, auth: ParticipantAuth): Promise<ParticipantsResult>
        removeParticipant(tripId: string, participantId: string, auth: ParticipantAuth):
          Promise<RemoveParticipantResult>

      Import: import type { ParticipantSummary } from "@/lib/types";

      A module-level constant:
        const FRIENDLY_ERROR =
          "Could not reach the server. Check your connection and try again.";
      (this is the exact string `lib/join.ts` and `lib/sharedTrip.ts` already use — reuse it
      verbatim, do not write a new phrase)

      A local, unexported helper:
        function authHeaders(auth: ParticipantAuth): Record<string, string> {
          return auth.role === "creator"
            ? { "x-creator-token": auth.token }
            : { "x-participant-token": auth.token };
        }

      Behavior:
        - getParticipants: `fetch(\`/api/trips/${tripId}/participants\`, { headers:
          authHeaders(auth) })`. If the fetch throws, OR the response is not ok
          (`response.ok === false`), return { ok: false, error: FRIENDLY_ERROR } — do not
          distinguish a thrown fetch from a non-2xx response; both collapse to the same result.
          Otherwise parse the JSON body as `{ participants: ParticipantSummary[] }` and return
          { ok: true, participants: data.participants }.
        - removeParticipant: `fetch(\`/api/trips/${tripId}/participants/${participantId}\`,
          { method: "DELETE", headers: authHeaders(auth) })`. If the fetch throws, OR the
          response is not ok, return { ok: false, error: FRIENDLY_ERROR } (same collapsed
          shape as getParticipants). Otherwise return { ok: true }.

      Constraints: neither function touches localStorage or imports lib/storage.ts — this module
                   is a pure network wrapper, unlike lib/join.ts's joinTrip (which does write to
                   storage on success). Must not import lib/db.ts.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(019): add lib/participants, the client wrapper for listing and removing participants`

---

### Task 5: [UI] — `components/ConfirmParticipantAction.tsx`

**Files**
- create: `components/ConfirmParticipantAction.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (not mounted until Task 6, mirrors `components/AddCategoryModal.tsx`'s own landing in
feature 010).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: components/ConfirmParticipantAction.tsx (create, no 'use client' directive needed —
            it takes only props and callbacks, same as components/ResetAppDataConfirm.tsx and
            components/NewTripConfirm.tsx, neither of which has one)
      Exports: default function ConfirmParticipantAction(props: {
                 actionLabel: "Remove" | "Leave";
                 participantName: string;
                 onConfirm: () => void;
                 onCancel: () => void;
               }): JSX.Element

      Behavior:
        const message = props.actionLabel === "Remove"
          ? `Remove ${props.participantName} from the trip?`
          : "Leave this trip?";

        Render exactly this structure (matches components/AddCategoryModal.tsx's existing overlay
        convention verbatim, substituting a plain confirm panel for that component's form):
        ```tsx
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg bg-(--background) p-4">
            <p>{message}</p>
            <div className="flex flex-col gap-2">
              <button type="button" className="btn-danger" onClick={props.onConfirm}>
                {props.actionLabel}
              </button>
              <button type="button" className="btn-secondary" onClick={props.onCancel}>
                Cancel
              </button>
            </div>
          </div>
        </div>
        ```

      Constraints: onCancel must be the only thing the Cancel button calls — no state read, no
                   fetch, no storage access anywhere in this component. This component performs
                   no data mutation itself; both buttons only call the prop they're named for.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(019): add ConfirmParticipantAction, the shared remove/leave confirm modal`

---

### Task 6: [UI] — `components/ManageParticipants.tsx`

**Files**
- create: `components/ManageParticipants.tsx`
- test: `npx tsc --noEmit`, `npm run lint`

No red step (not mounted until Task 7, mirrors `components/JoinTrip.tsx`'s own landing in
feature 017).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: components/ManageParticipants.tsx (create, 'use client')
      Exports: ~~default function ManageParticipants({ token }: { token: string }): JSX.Element~~
        Plan defect, corrected on implementation: this annotation is unsatisfiable against the two
        `return null` paths below. Landed as `JSX.Element | null`, with `import type { JSX } from
        "react"` — the same annotation and import components/TripSwitcher.tsx already carries for
        the same reason. See log.txt Task 6.

      Imports:
        import { useEffect, useState } from "react";
        import { useRouter } from "next/navigation";
        import type { ParticipantSummary } from "@/lib/types";
        import { getSharedTripLink, getJoinedTrips, saveJoinedTrips } from "@/lib/storage";
        import { findJoinedTrip } from "@/lib/join";
        import { getParticipants, removeParticipant } from "@/lib/participants";
        import type { ParticipantAuth } from "@/lib/participants";
        import ConfirmParticipantAction from "@/components/ConfirmParticipantAction";

      Local type (not exported):
        type ResolvedRole =
          | { kind: "creator"; tripId: string; token: string }
          | { kind: "participant"; tripId: string; token: string; myParticipantId: string };

      State (all useState):
        role: ResolvedRole | null, initial null
        loadState: "loading" | "error" | "ready", initial "loading"
        loadError: string | null, initial null
        participants: ParticipantSummary[], initial []
        confirmTarget: { id: string; name: string; actionLabel: "Remove" | "Leave" } | null,
          initial null
        actionError: string | null, initial null

      Mount effect (useEffect, deps: [token, router] — router from useRouter()):
        Define and call an inner async function (mirrors components/SharedTripView.tsx's own
        `loadTrip` pattern from feature 018):
        1. const sharedLink = getSharedTripLink();
        2. let resolved: ResolvedRole | null = null;
        3. if (sharedLink !== null && sharedLink.shareToken === token):
             resolved = { kind: "creator", tripId: sharedLink.tripId,
               token: sharedLink.creatorToken };
        4. else:
             const joined = findJoinedTrip(getJoinedTrips(), token);
             if (joined !== null):
               resolved = { kind: "participant", tripId: joined.tripId,
                 token: joined.participantToken, myParticipantId: joined.participantId };
        5. if (resolved === null): router.replace("/"); return; (no state is set — the stray-token
           guard; the component keeps rendering null via the role === null check below until
           navigation completes)
        6. setRole(resolved);
        7. const auth: ParticipantAuth = resolved.kind === "creator"
             ? { role: "creator", token: resolved.token }
             : { role: "participant", token: resolved.token };
        8. const result = await getParticipants(resolved.tripId, auth);
        9. if (!result.ok): setLoadError(result.error); setLoadState("error"); return;
        10. setParticipants(result.participants); setLoadState("ready");

      handleConfirm (async function, defined in the component body, not inside the effect):
        1. if (role === null || confirmTarget === null) return;
        2. const auth: ParticipantAuth = role.kind === "creator"
             ? { role: "creator", token: role.token }
             : { role: "participant", token: role.token };
        3. const result = await removeParticipant(role.tripId, confirmTarget.id, auth);
        4. if (!result.ok): setActionError(result.error); setConfirmTarget(null); return;
           (the participant list state is NOT modified in this branch — it stays exactly as it
           was, satisfying "the participant list is unchanged" on failure)
        5. setActionError(null);
        6. const removedId = confirmTarget.id;
        7. setParticipants((prev) => prev.filter((p) => p.id !== removedId));
        8. setConfirmTarget(null);
        9. if (role.kind === "participant" && removedId === role.myParticipantId):
             saveJoinedTrips(getJoinedTrips().filter((jt) => jt.shareToken !== token));
             router.push("/");
           (this branch only fires when the removed id is the viewer's own participant id —
           i.e. a self-leave, never when the creator removes someone else)

      Render:
        - if (role === null || loadState === "loading"): return null;
        - if (loadState === "error"):
          ```tsx
          <div className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">Participants</h1>
            <p role="alert">{loadError}</p>
          </div>
          ```
        - otherwise (loadState === "ready"):
          ```tsx
          <div className="flex flex-col gap-4 p-4">
            <h1 className="text-xl font-semibold">Participants</h1>
            {actionError && <p role="alert">{actionError}</p>}
            <ul className="flex flex-col divide-y divide-(--border)">
              <li className="flex items-center justify-between gap-2 py-2">
                <span>Trip creator</span>
              </li>
              {participants.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{p.name}</span>
                  {role.kind === "creator" && (
                    <button
                      type="button"
                      className="btn-text danger"
                      onClick={() =>
                        setConfirmTarget({ id: p.id, name: p.name, actionLabel: "Remove" })
                      }
                    >
                      Remove
                    </button>
                  )}
                  {role.kind === "participant" && role.myParticipantId === p.id && (
                    <button
                      type="button"
                      className="btn-text danger"
                      onClick={() =>
                        setConfirmTarget({ id: p.id, name: p.name, actionLabel: "Leave" })
                      }
                    >
                      Leave
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {confirmTarget && (
              <ConfirmParticipantAction
                actionLabel={confirmTarget.actionLabel}
                participantName={confirmTarget.name}
                onConfirm={handleConfirm}
                onCancel={() => setConfirmTarget(null)}
              />
            )}
          </div>
          ```
          (`btn-text danger` is the exact two-class combination `components/CategoryManager.tsx`
          already uses for its own inline row "Delete" action — read that file's existing
          `className="btn-text danger"` usage if unsure of the exact string. Do not use
          `btn-danger` alone on these row buttons; that class is reserved here for
          ConfirmParticipantAction's heavier confirm button, per
          components/ResetAppDataConfirm.tsx's existing precedent.)

      Constraints: the "Trip creator" row NEVER renders any button, regardless of `role.kind` —
                   there is no server-side record for the creator to target, and the creator must
                   never see a "leave" option for themselves. A participant row other than the
                   viewer's own (`role.myParticipantId !== p.id`) never renders a button when
                   `role.kind === "participant"`. Must not import components/Dashboard.tsx or
                   lib/join.ts's `resolveTripByToken`/`joinTrip` (this component only uses
                   `findJoinedTrip` from that module). Must not modify lib/storage.ts,
                   lib/join.ts, or lib/participants.ts.
      ```

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Commit.**
      Message: `feat(019): add ManageParticipants, the participants list and remove/leave flow`

---

### Task 7: [Route] — `app/trips/[token]/participants/page.tsx`

**Files**
- create: `app/trips/[token]/participants/page.tsx`
- test: `npm run build`, `npx tsc --noEmit`, `npm run lint`

No red step (the component it renders already exists from Task 6; this task is the wiring
itself).

- [x] **Step 1 — Implement to this contract.**
      ```
      File: app/trips/[token]/participants/page.tsx (create, 'use client')
      Exports: default function ParticipantsPage(props: PageProps<"/trips/[token]/participants">):
                 JSX.Element
      Behavior:
        "use client";

        import { use } from "react";
        import ManageParticipants from "@/components/ManageParticipants";

        export default function ParticipantsPage(
          props: PageProps<"/trips/[token]/participants">
        ) {
          const { token } = use(props.params);
          return <ManageParticipants token={token} />;
        }

      Constraints: does NOT read getTrip() and does NOT redirect based on it — unlike most routes
                   in this app, a local solo trip is not a precondition here (spec.md §1.2), and
                   ManageParticipants (Task 6) already handles the "device belongs to neither
                   role" case itself via its own router.replace("/"). Mirrors
                   app/trips/[token]/page.tsx's use(props.params) pattern for a Promise-based
                   dynamic segment; do not hand-write a params prop type.
      ```

- [x] **Step 2 — Verify.**
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/trips/[token]/participants`.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

      > Per REFERENCE.md §5: a brand-new route may fail `tsc` with `TS2344` on
      > `PageProps<"/trips/[token]/participants">` until `npm run build` has regenerated
      > `.next/types/routes.d.ts`. Run `npm run build` **first** if `npx tsc --noEmit` alone
      > reports this on a first attempt, then re-run `npx tsc --noEmit`; this is expected, not a
      > real defect.

- [x] **Step 3 — Commit.**
      Message: `feat(019): add the /trips/[token]/participants route`

---

### Task 8: [UI] — `components/ShareTripLink.tsx` gains a "Manage participants" link

**Files**
- modify: `components/ShareTripLink.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npx playwright test e2e/016-generate-shareable-trip-link.spec.ts`

- [x] **Step 1 — Add the import.** At the top of `components/ShareTripLink.tsx`, add
      `import Link from "next/link";` alongside the existing `useRef, useState` import from
      "react" (as its own import line — do not merge it into an existing import statement).

- [x] **Step 2 — Add the link.** In the `return` branch that renders when `link !== null` (the
      branch containing the `font-mono text-sm break-all` share-URL paragraph and the "Copy
      link"/"Generate new link" button row), add one new element immediately after the closing
      `</div>` of that `flex gap-4` button row, still inside the outer `flex flex-col gap-4` div:
      ```tsx
      <Link href={`/trips/${link.shareToken}/participants`} className="link">
        Manage participants
      </Link>
      ```
      Do not add this link to the `link === null` branch (no share link exists yet, so there is
      nothing to manage). Do not change, remove, or reorder any existing element, class name, or
      text in either branch of this component.

- [x] **Step 3 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 4 — Regression check.** Per spec.md §7 Open Item 2, confirm this additive change
      does not affect feature 016's existing assertions.
      `npx playwright test e2e/016-generate-shareable-trip-link.spec.ts`
      Expected: exit 0, `11 passed` (the file's current test count — no test in it asserts on the
      total number of links or buttons rendered, only on specific named elements this task does
      not touch, so this count must not change).

- [x] **Step 5 — Commit.**
      Message: `feat(019): add a "Manage participants" link to ShareTripLink`

---

### Task 9: [UI] — `components/JoinedTripSummary.tsx` gains a "View participants" link

**Files**
- modify: `components/JoinedTripSummary.tsx`
- test: `npx tsc --noEmit`, `npm run lint`, `npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts`, `npx playwright test e2e/018-switch-between-multiple-trips.spec.ts`

- [x] **Step 1 — Add the link.** `components/JoinedTripSummary.tsx` already imports `Link` from
      "next/link" — do not add a second import. Immediately after the existing
      `<Link href="/" className="link self-start">Back to home</Link>` element, and still inside
      the same outer `flex flex-col gap-4 p-4` div, add:
      ```tsx
      <Link
        href={`/trips/${joinedTrip.shareToken}/participants`}
        className="link self-start"
      >
        View participants
      </Link>
      ```
      Do not change, remove, or reorder any existing element, class name, or text in this
      component (the destination heading, the date-range paragraph, the "Joined as {name}."
      paragraph, the conditional `storageWarning` paragraph, or the existing "Back to home"
      link).

- [x] **Step 2 — Verify.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

- [x] **Step 3 — Regression check.** Per spec.md §7 Open Item 2, confirm this additive change
      does not affect feature 017's or 018's existing assertions (both render this component).
      `npx playwright test e2e/017-join-a-shared-trip-via-link.spec.ts`
      Expected: exit 0, `17 passed` (the file's current test count — must not change).
      `npx playwright test e2e/018-switch-between-multiple-trips.spec.ts`
      Expected: exit 0, `14 passed` (the file's current test count — must not change).

- [x] **Step 4 — Commit.**
      Message: `feat(019): add a "View participants" link to JoinedTripSummary`

---

### Task 10: [Behavioral] — Playwright coverage for the full feature

**Files**
- create: `e2e/019-manage-trip-participants.spec.ts`
- test: `npx playwright test e2e/019-manage-trip-participants.spec.ts`

- [x] **Step 1 — Write the spec**, covering all 10 scenarios from spec.md §4:
      1. `the participants screen lists everyone including a labeled creator` (E2E-019-01)
      2. `the creator can remove a participant, who then disappears from the list` (E2E-019-02)
      3. `a participant sees no remove control on another participant's row` (E2E-019-03)
      4. `a participant can leave, and is redirected home` (E2E-019-04)
      5. `the creator's own row offers no leave action` (E2E-019-05)
      6. `removing one participant leaves an unrelated participant's row unaffected` (E2E-019-06)
      7. `removing one of two same-named participants leaves the other intact` (E2E-019-07)
      8. `cancelling the confirmation leaves the list unchanged` (E2E-019-08)
      9. `confirming leave or remove while the request cannot complete shows one friendly error
         and leaves the list unchanged` (E2E-019-09)
      10. `visiting the participants screen for a trip I don't belong to redirects home`
          (E2E-019-10)

      Helpers to build, mirroring `e2e/017-join-a-shared-trip-via-link.spec.ts`'s and
      `e2e/018-switch-between-multiple-trips.spec.ts`'s own helpers (duplicate the needed shape
      into this new spec file — do not import across spec files):
      - `createRealTripLink(request)`: `POST /api/trips` with a fixed trip body
        (destinationCountry, currency, startDate, endDate), returns
        `{ tripId, shareToken, creatorToken }`.
      - `joinViaApi(request, shareToken, name)`: `POST /api/join/${shareToken}` with `{ name }`,
        returns the parsed `{ participantId, participantToken, trip }` body — used to seed
        participants directly via the API rather than through the join UI, since this feature's
        tests start from an already-populated trip.

      Whenever a scenario below says to seed `travel-expense:joined-trips`, build the array
      value as one object per entry with exactly this shape (matching `lib/types.ts`'s
      `JoinedTrip` interface):
      ```ts
      {
        tripId: string,          // from createRealTripLink's tripId
        shareToken: string,      // from createRealTripLink's shareToken
        participantId: string,   // from that participant's joinViaApi result
        participantToken: string,// from that participant's joinViaApi result
        participantName: string, // the name passed to joinViaApi
        trip: {
          id: string,             // == tripId
          destinationCountry: string,
          currency: string,
          startDate: string,      // "YYYY-MM-DD"
          endDate: string,        // "YYYY-MM-DD"
        },
      }
      ```
      `trip`'s five fields come from `createRealTripLink`'s own fixed trip body (the same
      destinationCountry/currency/startDate/endDate values used to create the trip). Whenever a
      scenario says to seed `travel-expense:shared-trip-link`, use exactly
      `{ tripId, shareToken, creatorToken }` from `createRealTripLink`'s result, with no other
      fields.

      Per-scenario seeding and assertions:
      - **E2E-019-01**: create a trip+link, join two participants via `joinViaApi` (e.g. "Alex"
        and "Blair"). Seed `localStorage`'s `travel-expense:joined-trips` (via
        `page.addInitScript`) with a `JoinedTrip` built from "Alex"'s join result. Visit
        `/trips/{shareToken}/participants`. Assert the text "Trip creator" is visible, and both
        "Alex" and "Blair" are visible.
      - **E2E-019-02**: create a trip+link, join two participants ("Alex", "Blair"). Seed
        `travel-expense:shared-trip-link` (via `page.addInitScript`) with
        `{ tripId, shareToken, creatorToken }` from the created link. Visit
        `/trips/{shareToken}/participants` as the creator. Click the "Remove" button in "Blair"'s
        row (scope the locator to the `<li>` containing the text "Blair"), then click "Remove" in
        the confirm modal. Assert "Blair" is no longer visible on the page and "Alex" still is.
      - **E2E-019-03**: create a trip+link, join two participants ("Alex", "Blair"). Seed
        `travel-expense:joined-trips` with a `JoinedTrip` for "Alex". Visit
        `/trips/{shareToken}/participants` as "Alex". Assert no element with the accessible name
        "Remove" exists anywhere on the page.
      - **E2E-019-04**: create a trip+link, join one participant ("Alex"). Seed
        `travel-expense:joined-trips` with a `JoinedTrip` for "Alex". Visit
        `/trips/{shareToken}/participants`. Click "Leave" in "Alex"'s own row, then click "Leave"
        in the confirm modal. Assert the page navigates to `/`, and that
        `page.evaluate(() => localStorage.getItem("travel-expense:joined-trips"))` parses to an
        array with no entry whose `shareToken` equals the seeded token.
      - **E2E-019-05**: create a trip+link, join one participant ("Alex"). Seed
        `travel-expense:shared-trip-link` for the creator. Visit
        `/trips/{shareToken}/participants` as the creator. Assert no element with the accessible
        name "Leave" exists anywhere on the page.
      - **E2E-019-06**: create a trip+link, join three participants ("Alex", "Blair", "Cass").
        Seed the creator's `travel-expense:shared-trip-link`. Visit the participants screen as
        the creator, remove "Blair" (same click sequence as E2E-019-02). Assert "Alex" and "Cass"
        are both still visible and their rows still render a "Remove" button each.
      - **E2E-019-07**: create a trip+link, call `joinViaApi` twice with the exact same name
        "Alex", capturing both results' distinct `participantId`s as `firstId` and `secondId`.
        Seed the creator's `travel-expense:shared-trip-link`. Visit the participants screen as
        the creator. Locate all `<li>` elements containing the text "Alex" (there will be two);
        click "Remove" in the **second** one, then confirm. Assert exactly one `<li>` containing
        "Alex" remains on the page. Then call `GET /api/trips/{tripId}/participants` directly
        with the `x-creator-token` header and assert the response's `participants` array contains
        an entry whose `id` equals `firstId` and does not contain one whose `id` equals
        `secondId`.
      - **E2E-019-08**: create a trip+link, join one participant ("Alex"). Seed the creator's
        `travel-expense:shared-trip-link`. Visit the participants screen as the creator. Attach a
        request counter to `**/api/trips/*/participants/**` `DELETE` calls (via `page.route`,
        counting matching requests before calling `route.continue()`). Click "Remove" in "Alex"'s
        row, then click "Cancel" in the confirm modal. Assert "Alex" is still visible and the
        `DELETE` counter is `0`.
      - **E2E-019-09**: create a trip+link, join one participant ("Alex"). Seed the creator's
        `travel-expense:shared-trip-link`. Visit the participants screen as the creator. Install
        `page.route("**/api/trips/*/participants/**", (route) => { if (route.request().method()
        === "DELETE") { route.abort(); } else { route.continue(); } })` **before** navigating (the
        initial `GET` to load the list must still succeed). Click "Remove" in "Alex"'s row, then
        confirm. Assert a `role="alert"` element containing the text "Could not reach the server"
        becomes visible, and "Alex" is still listed on the page afterward.
      - **E2E-019-10**: create a trip+link (do not join anyone, and do not seed any
        `localStorage` for this device — no `travel-expense:shared-trip-link`, no
        `travel-expense:joined-trips`). Visit `/trips/{shareToken}/participants`. Assert the page
        navigates to `/`, and that neither "Trip creator" nor any participant row text is ever
        visible at any point (assert this by checking the text is absent immediately after the
        navigation completes, not by racing the redirect).

      Per `.claude/repo-profile.md` § Behavioral gate: seed any required `localStorage` via
      `page.addInitScript` before first render. Scope every `role="alert"` assertion to
      `ManageParticipants.tsx`'s own rendered container (the `<div className="flex flex-col gap-4
      p-4">` block), not the page root, to avoid colliding with Next.js's own route announcer.

- [x] **Step 2 — Run it and confirm it passes.**
      `npx playwright test e2e/019-manage-trip-participants.spec.ts`
      Expected: exit 0, `10 passed`.

- [x] **Step 3 — Regression.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npm run build` → Expected: exit 0, "Compiled successfully", route table includes
      `/api/trips/[id]/participants`, `/api/trips/[id]/participants/[participantId]`, and
      `/trips/[token]/participants`.

- [x] **Step 4 — Commit.**
      Message: `feat(019): add Playwright coverage for managing trip participants`

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

    feat(019): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: doc/features/019-manage-trip-participants/spec.md

Never commit on a failing lint, typecheck, or build.

---

## Completion Summary

**Status:** Complete. All 10 tasks implemented, independently reviewed, and committed — one commit
per task (`9152da6`, `0fbabd9`, `70aa45a`, `3f359f3`, `fa4cc03`, `487678c`, `6e09265`, `08bb4a7`,
`37db109`, `f3c7560`).

### What was built

A creator or joined participant can open `/trips/[token]/participants`, see everyone on the trip with
the creator labeled, the creator can remove another participant, and a non-creator can leave — both
gated behind a confirmation and both needing a reachable server. Server side: `GET`/`DELETE` Route
Handlers under `app/api/trips/[id]/participants[/[participantId]]`, reusing the
`x-creator-token`/`x-participant-token` identity model 016/017 established, with one `DELETE` serving
both remove and self-leave. Client side: `lib/participants.ts` (the fetch wrapper), `ParticipantSummary`
in `lib/types.ts`, `components/ConfirmParticipantAction.tsx`, `components/ManageParticipants.tsx`, the
new route, and one additive entry link each in `components/ShareTripLink.tsx` (creator) and
`components/JoinedTripSummary.tsx` (participant). No Prisma schema change, no new dependency, and
nothing expense-shaped read or written anywhere.

### Deviations from the plan

1. **Task 6 — the plan's export annotation was unsatisfiable.** `JSX.Element` cannot cover the two
   `return null` paths the same task's render rules require. Landed as `JSX.Element | null` with
   `import type { JSX } from "react"`, matching `components/TripSwitcher.tsx`. The plan text is struck
   through with a pointer to the `log.txt` entry.
2. **Task 10 — a `waitForParticipantsScreen()` helper was added** (15s, once per test after `goto`) to
   absorb a dev-server first-compile instead of the default 5s expect timeout. The spec gate verified
   it cannot mask a defect; see the log entry for the reasoning. Two further Task 10 deviations
   (vacuity guards, and E2E-019-09 exercising Remove where spec.md §4's row says Leave) were also
   reviewed and accepted.
3. **Every task's commit also updated `REFERENCE.md`**, which no task's Files manifest lists. That is
   the repo's own doc rule — §4/§6 must not contradict the code in the same change — and matches what
   all four prior 019-adjacent commits did. Task 7's doc pass additionally settled the now-false
   "not yet wired/mounted" clauses the feature's own pieces had left behind.

### Follow-ups not in scope

- **`ManageParticipants` hardening** (flagged by Task 6's gate, each needing a contract the plan pins
  literally, so deliberately not implemented): a double-tap on confirm can fire two DELETEs and the
  second 404s into a spurious friendly error; cancelling while a DELETE is in flight still filters the
  row and, on a self-leave, still navigates home; the mount effect does not reset state on a `token`
  change (unreachable today — nothing navigates participants-screen to participants-screen).
- **`className="link"` on `ShareTripLink`'s new link lacks `self-start`** (Task 8), unlike every other
  `.link` in a flex column. Cosmetic; both plan.md and spec.md pin the class list verbatim.
- **spec.md §2.2 still says `.btn-danger` for the row buttons** where the shipped code uses
  `btn-text danger`. Worth reconciling next time `spec.md` is edited — and worth knowing before writing
  any selector: `btn-danger` matches the modal's confirm button, not a row.
- **REFERENCE.md accuracy pass:** its paragraph under the §4 tree still claims a short list of files
  "are the only other implemented pieces so far" (stale long before this feature), and the `JoinTrip.tsx`
  entry's enumeration of the delegated summary predates the new "View participants" link. Both are
  pre-existing coverage debt, not statements this feature made wrong.
- **Playwright environment fragility** (Task 10, not a spec defect): on a cold or disturbed dev server
  the spec can fail every test on the first `POST /api/trips` with a JSON `SyntaxError`, because the
  shared helper shape (017/018/019 alike) does not check `response.ok` before parsing.

### Final verification

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | exit 0, no output |
| `npm run lint` | exit 0, no output beyond npm's banner |
| `npm run build` | exit 0, "Compiled successfully", route table includes `/api/trips/[id]/participants`, `/api/trips/[id]/participants/[participantId]`, `/trips/[token]/participants` |
| `npx playwright test` (016 + 017 + 018 + 019) | exit 0, `52 passed` |
