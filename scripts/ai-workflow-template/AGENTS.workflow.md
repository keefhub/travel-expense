# Feature Implementation Workflow

For any task that means "implement the next feature," "continue implementation," or similar,
carry each `features/NNN.*.md` spec through three skills, one per stage — do not hand-implement
a feature straight from its spec:

0. **`/feature-discovery`** — stage 0, and only when there is **no** `features/NNN.*.md` yet: a
   requirement that arrived as plain prose is analysed against the codebase, split into
   right-sized features, and turned into `features/NNN.{slug}.md` files whose edge cases were
   confirmed with the user. Never author a feature file by hand, and never skip straight to
   `/feature-spec` from a prose requirement. Skip this stage entirely when the feature file exists.
1. **`/feature-spec <NNN>`** — gated BA/SA analysis of that one feature: BDD acceptance criteria,
   scenario mapping against this repo's behavioral-gate tool, an AC verification matrix, and a
   contrarian review. Writes `doc/features/{NNN}-{slug}/spec.md`.
2. **`/writing-plans`** — turns that spec into a numbered, task-by-task `plan.md` (a Files
   manifest plus a literal verification command and its exact expected output on every step),
   saved beside the spec. Plans state **contracts, not function bodies** — the implementer writes
   the code, so the review gates review work they did not author.
3. **`/sdd <path-to-plan.md>`** — executes the plan task-by-task via fresh subagents, gated by
   independent review before each task is committed: two gates for tasks touching types, data,
   domain, core library code, or a module boundary; one combined gate for pure UI/presentation and
   route/wiring work. Requires a **clean working tree** (or declared dirty paths) before it
   starts — every reviewer sees the same `git status`, so undeclared changes produce wrong-baseline
   findings. Persists resumable state (`PROGRESS.md`, `log.txt`) beside the plan, so a run survives
   a session restart mid-plan.

Only the controller session — never a subagent — commits, and only after all required review
gates pass. See `.claude/skills/sdd/SKILL.md` for the exact loop, including its two-strikes
escalation rule.

# Execution Order

Work through features **one at a time**, in the order this repo's `REFERENCE.md` (or
`CLAUDE.md`) recommends — build order, not the order the spec files are numbered or read in. Do
not reorder, skip, or batch features ahead of that order without an explicit user request.

Before starting a feature, confirm it is actually next: `git log --oneline --grep="^feat(<NNN>)"`
to check it isn't already committed, and read `output/error/{feature}.md` if it exists — a prior
failed attempt likely explains why the last run didn't land.

<!-- SCAFFOLD TODO: if this repo's framework has breaking changes vs. an AI model's training
data, or unusual conventions worth flagging up front, document them here (or in REFERENCE.md)
with pointers to the vendored docs — mirroring how the source project points at
node_modules/next/dist/docs/. Delete this comment once addressed. -->
