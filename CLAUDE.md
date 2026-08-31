@AGENTS.md

# AI Agent Implementation Workflow

This project is implemented feature-by-feature from the specs in [features/](features/), driven by an AI coding agent. This section defines how that loop works. Follow it for any task that says "implement the next feature," "continue implementation," or similar — not for one-off bug fixes or unrelated requests.

## Source of truth

- [REFERENCE.md](REFERENCE.md) is the orientation map — stack, commands, file layout, Next.js 16 gotchas with doc pointers, and the domain facts that span features. Read it before searching the repo, and update it when something it describes changes.
- [features/OVERVIEW.md](features/OVERVIEW.md) sections 1–3 (Product Overview, Confirmed Requirements, Assumptions to Confirm) are the standing context — re-read them before implementing any feature, since individual feature files assume this context and don't repeat it.
- Each `features/NNN.{feature-name}.md` file is one unit of work: its Gherkin scenarios are the acceptance criteria for that feature. Implement all scenarios in a feature file together, not one scenario at a time.
- Per [AGENTS.md](AGENTS.md), read the relevant guide under `node_modules/next/dist/docs/` before writing code that touches a Next.js API you're unsure of — this repo's Next.js version has breaking changes vs. training data.

## Implementation order

Features are numbered by spec/reading order, not build order. Build foundation and shared pieces first so later features don't need rework:

| Order | Feature file | Why it goes here |
|---|---|---|
| 1 | `012.local-storage-persistence.md` | Storage layer every other feature reads/writes through |
| 2 | `004.country-and-currency-mapping.md` | Static country→currency data needed by trip setup |
| 3 | `010.manage-expense-categories.md` | Category list needed by the expense form |
| 4 | `015.mobile-responsive-navigation.md` | App shell/layout every page renders inside |
| 5 | `001.first-time-travel-setup.md` | Core trip creation flow |
| 6 | `002.edit-active-trip.md` | Builds on trip setup |
| 7 | `003.create-new-trip.md` | Builds on trip setup + edit |
| 8 | `005.record-expense.md` | Core expense entry flow |
| 9 | `006.multi-currency-expense-tracking.md` | Extends expense recording |
| 10 | `011.unsaved-expense-warning.md` | Extends the expense form |
| 11 | `007.exchange-rate-management.md` | Needed for currency conversion |
| 12 | `008.optional-trip-budget.md` | Needs exchange rates for full conversion |
| 13 | `009.home-dashboard.md` | Aggregates trip, expenses, categories, rates, budget |
| 14 | `013.reset-app-data.md` | Touches all data types — safest once they all exist |
| 15 | `014.export-expenses.md` | Touches all expense fields — safest last |

Do not reorder or skip features without an explicit user request. Do not implement scenarios or features beyond what's written in the spec files.

## Per-feature loop

For each feature file, in the order above, drive it through the pipeline defined in
[AGENTS.md](AGENTS.md)'s **Feature Implementation Workflow** section — `/feature-spec` →
`/writing-plans` → `/sdd`. This section only adds the per-feature status check and what to do
on failure; it does not repeat the pipeline mechanics documented there.

1. **Check status.** Run `git log --oneline --grep="^feat(<NNN>)"` to confirm the feature hasn't already been committed. If [output/error/](output/error/) has a file for this feature from a prior failed attempt, read it first — it likely explains why the last attempt didn't land.
2. **`/feature-spec <NNN>`** → gated BA/SA spec at `doc/spec/{feature-name}.md`.
3. **`/writing-plans`** against that spec → `doc/spec/{feature-name}.plan.md`.
4. **`/sdd <path-to-plan.md>`** to execute it. `/sdd` owns implementation (via fresh subagents per task), the two independent review gates, and every commit — this loop just reacts to its outcome:
   - **Plan reaches `**Status:** Complete`** → proceed to the next feature.
   - **`/sdd` escalates** (a task fails its two allowed attempts in a row) — it has already stopped and reported what was tried and what the review gates found. Read that report and attempt a genuine root-cause fix — not `@ts-ignore`, not `eslint-disable`, not deleting the failing code, not `--no-verify`. Resume `/sdd` on the same plan. Allow up to 3 total attempts (1 initial + 2 fix attempts) per feature. If still failing after 3 attempts, **stop the loop** and report to the user — do not proceed to the next feature.

Never let a failing build reach git history. Later features are built on top of earlier ones; a broken build compounds instead of staying isolated.

## Progress tracking

Progress is derived from `git log` (commit message prefixes), not a separate status file — a status file can drift from what's actually committed; git history cannot.
