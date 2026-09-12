# `doc/` — the decision trail

Everything the AI implementation pipeline produces, committed on purpose.

These are **decision records, not build output.** They are not deterministically regenerable — re-running `/feature-spec` on the same input yields a different document. What is worth keeping is the reasoning: why a design was chosen, what the adversarial review rejected, and what deviated during execution and why.

## Layout

```
doc/
  features/<NNN>-<slug>/
      spec.md     gated BA/SA analysis from /feature-spec
      plan.md     task-by-task implementation plan from /writing-plans
      log.txt     per-task execution record from /sdd — decisions, deviations, gate verdicts
  requirements/
      YYYY-MM-DD-<slug>.md   impact analysis + feature breakdown from /feature-discovery, for
                             one plain-prose requirement that became several feature files
  workflow/
      *.md        designs and plans for the pipeline itself, not for a product feature
```

## What is authoritative

`features/NNN.{name}.md` — **outside this tree** — is the input and the authority. Its Gherkin scenarios are the acceptance criteria. When anything in `doc/` disagrees with a feature file, the feature file wins, and the derived document is the thing that is wrong.

This is why specs and plans live here rather than beside their feature files: keeping input and output in separate trees keeps that precedence unambiguous.

## What is deliberately not here

`PROGRESS.md` is git-ignored. It is run state — ticked checkboxes that churn on every task and duplicate what git history already records. Per `CLAUDE.md`: *"Progress is derived from git log, not a separate status file — a status file can drift from what's actually committed; git history cannot."* The plan carries its own ticked boxes, and `log.txt` carries the durable record.

## A caveat on older documents

Plans written **before 2026-09-12** predate the contracts-not-code convention. They embed complete final source code, carry compiler "probe" steps against throwaway files, and specify manual browser checks that nothing could run.

They also cite the old flat paths (`doc/spec/NNN.name.md`) internally. Those references are left as written: these are records of what happened, and editing them to look like they were authored under the current layout would make the record untrustworthy.

Read them as history, not as the house style. The current conventions are in `.claude/skills/writing-plans/` and `.claude/repo-profile.md`: a plan states each file's exported signature, behavior, edge cases and constraints — not its body — and behavior a compiler cannot see is verified by a Playwright spec in `e2e/`.
