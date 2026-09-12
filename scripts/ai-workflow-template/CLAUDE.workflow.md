# AI Agent Implementation Workflow

This project is implemented feature-by-feature from the specs in [features/](features/), driven by an AI coding agent. This section defines how that loop works. Follow it for any task that says "implement the next feature," "continue implementation," or similar — not for one-off bug fixes or unrelated requests.

## Source of truth

- [REFERENCE.md](REFERENCE.md) is the orientation map — stack, commands, file layout, framework gotchas with doc pointers, and the domain facts that span features. Read it before searching the repo, and update it when something it describes changes.
- [features/OVERVIEW.md](features/OVERVIEW.md) sections 1–3 (Product Overview, Confirmed Requirements, Assumptions to Confirm) are the standing context — re-read them before implementing any feature, since individual feature files assume this context and don't repeat it.
- <!-- SCAFFOLD TODO: keep the design.md line below only if this project has a design system doc; delete the line otherwise. --> [design.md](design.md) is the design system — read it before implementing or touching any UI, alongside REFERENCE.md and OVERVIEW.md. It governs how things look and behave; it never overrides a feature spec's functional scenarios.
- Each `features/NNN.{feature-name}.md` file is one unit of work: its Gherkin scenarios are the acceptance criteria for that feature. Implement all scenarios in a feature file together, not one scenario at a time.
- [.claude/repo-profile.md](.claude/repo-profile.md) is where this repo's own pipeline facts live — verification commands and when each applies, the behavioral gate, layer slices, known-dirty paths, and gate risk tiers. The skills cite it rather than carrying copies, so fix it there when something changes.

## New requirements arrive in prose

Everything below assumes the feature file already exists. When a requirement instead arrives as
plain language — a stakeholder sentence, a one-line ask — it enters the pipeline through
**`/feature-discovery`**, which is the only way a new `features/NNN.*.md` gets written. Do not
hand-author a feature file, and do not run `/feature-spec` against a prose requirement.

It runs in two modes: `/feature-discovery "<requirement>"` produces the impact analysis and the
feature breakdown at `doc/requirements/{YYYY-MM-DD}-{slug}.md` and then stops;
`/feature-discovery <NNN>` brainstorms that one feature's edge cases with the user and writes its
feature file, its `## Assumptions` / `## Out of Scope` / `## Deferred` sections, and its rows in
OVERVIEW §2/§4, REFERENCE §7, and the implementation-order table below. One feature per
invocation. It never writes application code and never commits.

## Implementation order

<!-- SCAFFOLD TODO: fill in this repo's actual feature list and build order once features/
exists, e.g.:

| Order | Feature file  | Why it goes here |
| ----- | ------------- | ----------------- |
| 1     | `001....md`   | ...                |

If features are numbered by spec/reading order rather than build order, say so explicitly, the
way the source project does: "Features are numbered by spec/reading order, not build order." -->

Do not reorder or skip features without an explicit user request. Do not implement scenarios or features beyond what's written in the spec files.

## Per-feature loop

For each feature file, in the order above, drive it through the pipeline defined in
[AGENTS.md](AGENTS.md)'s **Feature Implementation Workflow** section — `/feature-spec` →
`/writing-plans` → `/sdd`. This section only adds the per-feature status check and what to do
on failure; it does not repeat the pipeline mechanics documented there.

1. **Check status and the tree.** Run `git log --oneline --grep="^feat(<NNN>)"` to confirm the feature hasn't already been committed. Also confirm the working tree is clean, or that any dirty tracked paths are declared — `/sdd` refuses to start otherwise, because every reviewer sees the same `git status` and undeclared changes produce wrong-baseline gate findings. If [output/error/](output/error/) has a file for this feature from a prior failed attempt, read it first — it likely explains why the last attempt didn't land. Each feature's `spec.md`, `plan.md`, and `log.txt` live together in [doc/features/](doc/features/)`<NNN>-<slug>/` — see [doc/README.md](doc/README.md).
2. **`/feature-spec <NNN>`** → gated BA/SA spec at `doc/features/{NNN}-{slug}/spec.md`.
   _(Thin-feature shortcut: if the feature file has ≤2 Gherkin scenarios and introduces no new
   storage key or module boundary, skip this step and pass the feature file straight to
   `/writing-plans` — see Cost optimization below.)_
3. **`/writing-plans`** against that spec → `doc/features/{NNN}-{slug}/plan.md`.
4. **`/sdd <path-to-plan.md>`** to execute it. `/sdd` owns implementation (via fresh subagents per task), the review gates — two for tasks touching types, data, domain, core library code, or a module boundary; one combined gate for pure UI and route wiring — and every commit — this loop just reacts to its outcome:
   - **Plan reaches `**Status:** Complete`** → proceed to the next feature.
   - **`/sdd` escalates** (a task fails its two allowed attempts in a row) — it has already stopped and reported what was tried and what the review gates found. Read that report and attempt a genuine root-cause fix — not a suppression, not deleting the failing code, not skipping verification. Resume `/sdd` on the same plan. Allow up to 3 total attempts (1 initial + 2 fix attempts) per feature. If still failing after 3 attempts, **stop the loop** and report to the user — do not proceed to the next feature.

Never let a failing build reach git history. Later features are built on top of earlier ones; a broken build compounds instead of staying isolated.

## Cost optimization

<!-- SCAFFOLD TODO: set up memories/repo/<slug>-context.md (a short "core packet" of standing
facts every subagent needs) plus optional memories/repo/slices/*.md tagged by an architecture
layer (e.g. data/domain/route/ui for a layered web app — adapt names to this project's actual
architecture). See scripts/ai-workflow-template/README.md in the source project for the pattern
this was scaffolded from. -->

1. **Read standing context once per session.** Subagents receive a core packet plus at most one
   layer slice chosen by the task's `[Layer]` tag — not the raw REFERENCE.md/OVERVIEW.md/design.md
   in full. Re-read the raw files only when a task modifies them, and refresh the core or affected
   slice in that same change.
2. **Plans carry contracts, not code.** A plan states each file's exported signature, behavior,
   edge cases, negative constraints, and verification command — not the function body.
3. **Gate count is risk-tiered per task, not per feature.** `.claude/repo-profile.md` § Gate risk
   tiers is the source. Task-level tiering outranks the thin-feature shortcut below — a task
   touching core library code gets two gates even inside a thin feature.
4. **Thin features skip `/feature-spec`.** A feature file with ≤2 Gherkin scenarios and no new
   storage key or module boundary goes straight to `/writing-plans`.
5. **Fan out the `writing-plans` review passes.** Independent review passes run in parallel
   against the frozen plan, then reconcile — same tokens, less wall-clock. `/sdd` tasks and
   features stay sequential.

<!-- SCAFFOLD TODO: name this repo's behavioral-gate tool (Playwright, Cypress, RSpec system
tests, etc.) and where its specs live, the way the source project states "Playwright is the
behavioral gate ... in e2e/". -->

## Progress tracking

Progress is derived from `git log` (commit message prefixes), not a separate status file — a status file can drift from what's actually committed; git history cannot.
