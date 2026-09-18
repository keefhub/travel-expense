# Travel Expense — Core Context Packet

Orientation handed to every subagent dispatch, paired with **one** slice from
`memories/repo/slices/` chosen by the task's `[Layer]` tag. No matching tag → this core alone.

Verification commands, gate tiers, and known-dirty paths live in `.claude/repo-profile.md` — read
that, not a copy here. When this packet contradicts the code, the code wins; fix it in the same
change.

## What this app is

Mobile-first, offline-capable travel expense tracker. A trip that is never shared stays entirely in
browser `localStorage`, exactly as v1 (features 001–015). Starting with feature 016, a trip whose
creator generates a shareable link becomes **server-backed**: a `Trip` row in Neon Postgres
(Prisma), reachable via Route Handlers under `app/api/`. Solo (unshared) trips never touch the
server. One local solo trip at a time; a device can additionally belong to any number of shared
trips. Mobile bottom nav (Home, Add Expense, Categories, Settings) is the app shell every page
renders inside — it is solo-trip-scoped only; shared-trip routes (`/join/[token]`, from 017) render
outside it and do not gate on a local trip existing.

**Features 001–016 are implemented and committed.** Feature 017 (join a shared trip via link) is
in progress. Progress lives in `git log` (`feat(NNN)` prefixes), not a status file.

## Stack

Next.js 16.3.3 (App Router) · React 19.2.8 · TypeScript 5 `strict` · Tailwind CSS v4 (CSS-first,
tokens in `app/globals.css`) · ESLint 9 flat config · `@playwright/test` in `e2e/`, no unit-test
runner · path alias `@/*` → repo root.

Runtime deps: `next`/`react`/`react-dom`, plus (since 016) `@neondatabase/serverless`,
`@prisma/adapter-neon`, `@prisma/client` (exact-pinned), dev-only `prisma`/`dotenv` — the first and
only backend/database dependencies in this repo, used solely by `lib/db.ts` and `app/api/**`. No
chart, date, form, or state library. Never add a dependency silently; raise it first.

**`prisma generate` is mandatory before typecheck/build.** Prisma 7's `@prisma/client` has no
`postinstall` hook (unlike ≤6), and `@prisma/client/default.d.ts` is only `export * from
'.prisma/client/default'` — generated into `node_modules/.prisma/client`, never committed. Without
generating, `import { PrismaClient }` fails with `TS2305: has no exported member 'PrismaClient'`.
`package.json` therefore runs it in both `postinstall` and `build`.

## Layers (task/file boundaries)

| Layer  | Path               | Holds                                                        |
| ------ | ------------------ | ------------------------------------------------------------ |
| Types  | `lib/types.ts`     | Shared domain interfaces                                     |
| Data   | `lib/storage.ts`   | `localStorage` read/write, keys, serialization, errors       |
| Domain | `lib/<name>.ts`    | Pure functions. No DOM, no storage, no clock                 |
| UI     | `components/*.tsx` | Presentational/interactive React client components           |
| Route  | `app/**/page.tsx`  | App Router entries; `'use client'` where they touch storage  |

Data, domain, and UI/route work are always separate tasks and separate commits.

## Next.js 16 gotchas (this version ≠ training data)

- `params`/`searchParams` are Promises — `await` them.
- `PageProps<'/route'>` / `LayoutProps<'/route'>` are globally generated types — don't hand-write
  prop interfaces.
- Everything under `app/` is a Server Component by default; `localStorage` is client-only, so every
  screen needing it is `'use client'`.
- Never read `localStorage` during render/SSR. Use `useSyncExternalStore` over a per-mount store —
  not `useEffect`+`setState`, which trips `react-hooks/set-state-in-effect`.
- Read the guide under `node_modules/next/dist/docs/01-app/` before using an unfamiliar API.

## Where the details are

Storage keys and the `lib/storage.ts` API: `REFERENCE.md` §6. Per-feature acceptance criteria:
`features/NNN.*.md`. Standing product context: `features/OVERVIEW.md` §1–3.
