<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Feature Implementation Workflow

For any task that means "implement the next feature," "continue implementation," or similar,
carry each `features/NNN.*.md` spec through three skills, one per stage — do not hand-implement
a feature straight from its spec:

1. **`/feature-spec <NNN>`** — gated BA/SA analysis of that one feature: BDD acceptance criteria,
   Playwright scenario mapping, an AC verification matrix, and a contrarian review. Writes
   `doc/spec/{feature-name}.md`.
2. **`/writing-plans`** — turns that spec into a numbered, task-by-task `plan.md` (a Files
   manifest plus a literal verification command and its exact expected output on every step),
   saved beside the spec. Plans state **contracts, not function bodies** — the implementer writes
   the code, so the review gates review work they did not author.
3. **`/sdd <path-to-plan.md>`** — executes the plan task-by-task via fresh subagents, gated by
   independent review before each task is committed: two gates for tasks touching types, data,
   domain, `lib/`, or a module boundary; one combined gate for pure UI and route wiring. Requires
   a **clean working tree** (or declared dirty paths) before it starts — every reviewer sees the
   same `git status`, so undeclared changes produce wrong-baseline findings. Persists resumable
   state (`PROGRESS.md`, `log.txt`) beside the plan, so a run survives a session restart mid-plan.

Only the controller session — never a subagent — commits, and only after both `/sdd` review
gates pass. See `.claude/skills/sdd/SKILL.md` for the exact loop, including its two-strikes
escalation rule.

# Execution Order

Work through features **one at a time**, in the linear order [REFERENCE.md](REFERENCE.md) §7
recommends — build order, not the order the spec files are numbered or read in. Do not reorder,
skip, or batch features ahead of that order without an explicit user request.

Before starting a feature, confirm it is actually next: `git log --oneline --grep="^feat(<NNN>)"`
to check it isn't already committed, and read `output/error/{feature}.md` if it exists — a prior
failed attempt likely explains why the last run didn't land.
