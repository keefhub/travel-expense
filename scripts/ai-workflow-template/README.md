# AI workflow scaffold templates

Used by [../scaffold-ai-workflow.sh](../scaffold-ai-workflow.sh) to port this repo's
feature-discovery → feature-spec → writing-plans → sdd pipeline into another repo.

- `AGENTS.workflow.md`, `CLAUDE.workflow.md` — generic (stack-agnostic) versions of the workflow
  sections from this repo's own `AGENTS.md`/`CLAUDE.md`. The script inserts these between
  `<!-- ai-agent-workflow:begin -->` / `:end` markers in the target repo's files, so re-running
  the script updates the block in place instead of duplicating it, and any of the target repo's
  own existing content is left untouched above and below the markers.
- `*.stub.md` — placeholder versions of `REFERENCE.md`, `features/OVERVIEW.md`, `design.md`,
  `.claude/repo-profile.md`, and the `memories/repo/` core context file. The script only writes
  these when the target file doesn't already exist — it never overwrites a real project doc.
  Each stub is full of `TODO` markers; someone (or an `/init`-equivalent pass) still has to fill
  in this repo's actual stack, commands, domain facts, and gate rules before the pipeline's gates
  mean anything.

What the script deliberately does **not** template:
- The actual skills (`feature-discovery`, `feature-spec`, `writing-plans`, `sdd`, `spec-review`,
  `git-commit`) are copied verbatim from `.claude/skills/` in this repo, not from a template —
  they're the working implementation, not prose to adapt. Review their `SKILL.md` files after
  copying for stack-specific assumptions (this repo's skills mention Next.js/Playwright/App
  Router in places) and adjust for the target repo's actual stack.
- `memories/repo/slices/*.md` — this repo splits its subagent context by Next.js App Router
  layers (data/domain/route/types/ui). That split is architecture-specific, so the script does
  not manufacture same-named slices in the target repo; it only creates the core context stub
  and leaves a TODO pointing at this pattern.
