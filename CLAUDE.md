@AGENTS.md

# AI Agent Implementation Workflow

This project is implemented feature-by-feature from the specs in [features/](features/), driven by an AI coding agent. This section defines how that loop works. Follow it for any task that says "implement the next feature," "continue implementation," or similar — not for one-off bug fixes or unrelated requests.

## Source of truth

- [REFERENCE.md](REFERENCE.md) is the orientation map — stack, commands, file layout, Next.js 16 gotchas with doc pointers, and the domain facts that span features. Read it before searching the repo, and update it when something it describes changes.
- [features/OVERVIEW.md](features/OVERVIEW.md) sections 1–3 (Product Overview, Confirmed Requirements, Assumptions to Confirm) are the standing context — re-read them before implementing any feature, since individual feature files assume this context and don't repeat it.
- [design.md](design.md) is the design system — color/type/spacing tokens, component and interaction-state patterns, motion and icon policy. Read it before implementing or touching any UI, alongside REFERENCE.md and OVERVIEW.md. It governs how things look and behave; it never overrides a feature spec's functional scenarios, and it does not introduce dependencies beyond what REFERENCE.md §2 already lists.
- Each `features/NNN.{feature-name}.md` file is one unit of work: its Gherkin scenarios are the acceptance criteria for that feature. Implement all scenarios in a feature file together, not one scenario at a time.
- [.claude/repo-profile.md](.claude/repo-profile.md) is where this repo's own pipeline facts live — verification commands and when each applies, the behavioral gate, layer slices, known-dirty paths, and gate risk tiers. The skills cite it rather than carrying copies, so fix it there when something changes.
- Per [AGENTS.md](AGENTS.md), read the relevant guide under `node_modules/next/dist/docs/` before writing code that touches a Next.js API you're unsure of — this repo's Next.js version has breaking changes vs. training data.

## Implementation order

Features are numbered by spec/reading order, not build order. Build foundation and shared pieces first so later features don't need rework:

| Order | Feature file                             | Why it goes here                                       |
| ----- | ---------------------------------------- | ------------------------------------------------------ |
| 1     | `012.local-storage-persistence.md`       | Storage layer every other feature reads/writes through |
| 2     | `004.country-and-currency-mapping.md`    | Static country→currency data needed by trip setup      |
| 3     | `010.manage-expense-categories.md`       | Category list needed by the expense form               |
| 4     | `015.mobile-responsive-navigation.md`    | App shell/layout every page renders inside             |
| 5     | `001.first-time-travel-setup.md`         | Core trip creation flow                                |
| 6     | `002.edit-active-trip.md`                | Builds on trip setup                                   |
| 7     | `003.create-new-trip.md`                 | Builds on trip setup + edit                            |
| 8     | `005.record-expense.md`                  | Core expense entry flow                                |
| 9     | `006.multi-currency-expense-tracking.md` | Extends expense recording                              |
| 10    | `011.unsaved-expense-warning.md`         | Extends the expense form                               |
| 11    | `007.exchange-rate-management.md`        | Needed for currency conversion                         |
| 12    | `008.optional-trip-budget.md`            | Needs exchange rates for full conversion               |
| 13    | `009.home-dashboard.md`                  | Aggregates trip, expenses, categories, rates, budget   |
| 14    | `013.reset-app-data.md`                  | Touches all data types — safest once they all exist    |
| 15    | `014.export-expenses.md`                 | Touches all expense fields — safest last               |

Do not reorder or skip features without an explicit user request. Do not implement scenarios or features beyond what's written in the spec files.

## Per-feature loop

For each feature file, in the order above, drive it through the pipeline defined in
[AGENTS.md](AGENTS.md)'s **Feature Implementation Workflow** section — `/feature-spec` →
`/writing-plans` → `/sdd`. This section only adds the per-feature status check and what to do
on failure; it does not repeat the pipeline mechanics documented there.

1. **Check status and the tree.** Run `git log --oneline --grep="^feat(<NNN>)"` to confirm the feature hasn't already been committed. Also confirm the working tree is clean, or that any dirty tracked paths are declared — `/sdd` now refuses to start otherwise, because every reviewer sees the same `git status` and undeclared changes produce wrong-baseline gate findings. If [output/error/](output/error/) has a file for this feature from a prior failed attempt, read it first — it likely explains why the last attempt didn't land. Each feature's `spec.md`, `plan.md`, and `log.txt` live together in [doc/features/](doc/features/)`<NNN>-<slug>/` — see [doc/README.md](doc/README.md).
2. **`/feature-spec <NNN>`** → gated BA/SA spec at `doc/features/{NNN}-{slug}/spec.md`.
   _(Thin-feature shortcut: if the feature file has ≤2 Gherkin scenarios and introduces no new
   storage key or module boundary, skip this step and pass the feature file straight to
   `/writing-plans` — see Cost optimization below.)_
3. **`/writing-plans`** against that spec → `doc/features/{NNN}-{slug}/plan.md`.
4. **`/sdd <path-to-plan.md>`** to execute it. `/sdd` owns implementation (via fresh subagents per task), the review gates — two for tasks touching types, data, domain, `lib/` or a module boundary; one combined gate for pure UI and route wiring — and every commit — this loop just reacts to its outcome:
   - **Plan reaches `**Status:** Complete`** → proceed to the next feature.
   - **`/sdd` escalates** (a task fails its two allowed attempts in a row) — it has already stopped and reported what was tried and what the review gates found. Read that report and attempt a genuine root-cause fix — not `@ts-ignore`, not `eslint-disable`, not deleting the failing code, not `--no-verify`. Resume `/sdd` on the same plan. Allow up to 3 total attempts (1 initial + 2 fix attempts) per feature. If still failing after 3 attempts, **stop the loop** and report to the user — do not proceed to the next feature.

Never let a failing build reach git history. Later features are built on top of earlier ones; a broken build compounds instead of staying isolated.

## Cost optimization

Five rules keep the token/time cost of this loop down without weakening its gates. The skills
enforce them; this section is the standing summary.

1. **Read standing context once per session.** Subagents receive the core packet at
   `memories/repo/travel-expense-context.md` (~3 KB) plus **one** layer slice from
   `memories/repo/slices/` chosen by the task's `[Layer]` tag (~1.5–2.5 KB) — not the raw
   `REFERENCE.md`/`OVERVIEW.md`/`design.md`, and not the old 12 KB monolithic packet. Where no
   slice matches the tag, the dispatch gets the core alone; never guess a slice. Re-read the raw
   files only when a task modifies them, and refresh the core or affected slice in that same change.
2. **Plans carry contracts, not code.** A plan states each file's exported signature, behavior,
   edge cases, negative constraints, and verification command — not the function body. The
   implementer writes the code, so the review gates review work they did not author. The compiler
   red step stays: `TS2305` asserts a named export's shape, which is the one mechanical check that
   an implementation matches its contract.
3. **Gate count is risk-tiered per task, not per feature.** Two independent gates for tasks
   touching types, data, domain, `lib/`, or a module boundary; one combined gate for pure UI and
   route wiring. `.claude/repo-profile.md` § Gate risk tiers is the source. Task-level tiering
   outranks rule 4 — a task touching `lib/` gets two gates even inside a thin feature.
4. **Thin features skip `/feature-spec`.** A feature file with ≤2 Gherkin scenarios and no new
   storage key or module boundary goes straight to `/writing-plans`. This governs *only* whether
   the spec stage runs; it no longer decides gate count. A full three-stage pass is still required
   for architectural features (e.g. 012 storage, 009 dashboard, any new module boundary or storage
   contract).
5. **Fan out the `writing-plans` review passes.** Passes A.5, B, and C run in parallel against the
   frozen plan, then reconcile — same tokens, less wall-clock. `/sdd` tasks and features stay
   sequential: task order is a dependency chain (each task's typecheck passes only after the prior
   one), and features are built in the order above.

**Playwright is the behavioral gate.** Anything a compiler cannot see — a banner, a redirect, a
chart, a responsive layout — is verified by a spec in `e2e/`, never by a manual browser checklist
that nobody runs. There is still no unit-test runner.

## Progress tracking

Progress is derived from `git log` (commit message prefixes), not a separate status file — a status file can drift from what's actually committed; git history cannot.
