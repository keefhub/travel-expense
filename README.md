# Travel Expense Tracker

A mobile-first, offline-capable travel expense tracker. No backend, no database, no API
routes — all state lives in the browser's `localStorage`, so the app works offline once
loaded. One active trip at a time; creating a new trip deletes the previous one after
confirmation.

## Features

- Trip setup with country → currency mapping and an optional budget
- Edit the active trip or start a new one
- Record expenses in multiple currencies
- Manual exchange rates
- Expense categories (defaults + custom)
- Home dashboard with total spend, budget, and pie chart
- Export expenses to CSV
- Reset app data
- Mobile-responsive navigation

## Tech stack

| Thing           | Choice                                        |
| --------------- | --------------------------------------------- |
| Framework       | [Next.js](https://nextjs.org) 16 (App Router) |
| UI library      | React 19                                      |
| Language        | TypeScript 5 (`strict`)                       |
| Styling         | Tailwind CSS v4                               |
| Linting         | ESLint 9 flat config (`eslint-config-next`)   |
| Persistence     | Browser `localStorage` (no backend)           |
| Package manager | npm                                           |

Runtime dependencies are only `next`, `react`, and `react-dom`.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

```bash
npm run dev     # start the development server
npm run build   # production build (also the type-check gate)
npm run lint    # run ESLint
npm start       # start the production server
```

There is no separate `typecheck` script — `npm run build` catches type errors.

## Project structure

```
app/          # App Router routes
components/   # shared UI
lib/          # domain logic + localStorage persistence
features/     # feature specifications (source of truth)
doc/          # generated specs, plans, and logs
```

Architecture details and domain rules are documented in [`REFERENCE.md`](REFERENCE.md).

## AI-assisted development workflow

This app is built feature-by-feature by an AI coding agent (Claude Code) working from the
Gherkin specs in [`features/`](features/), not by hand-implementing straight from the spec.
Each feature is carried through three gated stages before it's allowed to touch `git history`:

1. **`/feature-spec`** — a BA/SA pass over one feature spec that produces BDD acceptance
   criteria, a Playwright scenario mapping, and an AC verification matrix, written to
   `doc/features/{NNN}-{slug}/spec.md`. Small "thin" features (≤2 scenarios, no new storage
   key or module boundary) skip this stage and go straight to planning.
2. **`/writing-plans`** — turns that spec into a numbered, task-by-task `plan.md`. Plans state
   each file's contract (exported signature, behavior, edge cases, verification command) rather
   than the function body, so the implementer — not the planner — writes the actual code.
3. **`/sdd`** (subagent-driven development) — executes the plan one task at a time via fresh
   subagents. Every task is independently reviewed before it's committed: two review gates for
   changes touching types, data, domain logic, or a module boundary; one combined gate for pure
   UI/route wiring. A task gets up to two fix attempts before the loop stops and reports back
   instead of pushing a broken build forward.

Progress is tracked entirely through `git log` commit prefixes (e.g. `feat(005)`), not a
separate status file, so it can't drift from what's actually committed. Playwright specs in
`e2e/` are the behavioral gate for anything a type-checker can't see (banners, redirects,
charts, responsive layout) — there's no manual QA checklist and no unit-test runner.

The full mechanics of this loop — implementation order, cost-optimization rules, and escalation
handling — live in [`AGENTS.md`](AGENTS.md) and [`CLAUDE.md`](CLAUDE.md).

### Porting this workflow to another repo

[`scripts/scaffold-ai-workflow.sh`](scripts/scaffold-ai-workflow.sh) copies the skills and
workflow docs above into another repo without overwriting anything already there.

```bash
# from a local checkout, scaffold directly into another repo
bash scripts/scaffold-ai-workflow.sh /path/to/other-repo

# or standalone, with no local checkout of this repo
curl -o scaffold-ai-workflow.sh https://raw.githubusercontent.com/keefhub/travel-expense/master/scripts/scaffold-ai-workflow.sh
chmod +x scaffold-ai-workflow.sh && ./scaffold-ai-workflow.sh .
```

Add `--dry-run` to preview first. Details: [`scripts/ai-workflow-template/README.md`](scripts/ai-workflow-template/README.md).
