# AI Feature-Implementation Workflow — Cost Optimization

**Date:** 2026-09-12
**Status:** Approved, not yet implemented
**Scope:** `.claude/skills/{feature-spec,writing-plans,sdd}`, a new repo profile, Playwright

## Problem

The `/feature-spec` → `/writing-plans` → `/sdd` pipeline delivered all 15 features in
`features/`, but at high token and wall-clock cost per feature. The cost is not spread evenly —
it concentrates in a few identifiable mechanisms, each measurable in the artifacts the pipeline
left behind.

### Evidence

Measured from `doc/spec/*` and the `log.txt` files of completed runs:

| Signal | Evidence |
| --- | --- |
| Plans embed byte-exact final source code | 45 KB plan generated from a 2.6 KB feature file. `010` Task 4 log: "the implementer's diff matched the plan's Step 1 code byte-for-byte." |
| Each line of code is handled ~7 times | Controller writes it in the plan → 3 plan-review subagents read it (Passes A.5/B/C) → implementer retypes it → Gate A reads it → Gate B reads it |
| Unrunnable browser steps in every plan | 6–27 browser/manual references per plan file. Every UI task logs "NOT PERFORMED — no browser automation," then spends tokens on dev-server + curl substitutes, and both gates spend more re-verifying that disclosure |
| False-positive gate failures cost full serial cycles | `010` Task 1: Gate B reviewed the working tree instead of `HEAD`, flagging classes from an unrelated uncommitted theme refactor. `010` Task 4: Gate A flagged the absent commit and unticked `PROGRESS.md` as "gaps" — the correct state at that point in the pipeline |
| Probe steps prove almost nothing | No test runner exists. Each step creates a `.probe.tsx`, runs a full `tsc`, compares an exact error string (the plan carries a formula for computing the column number), then deletes the file. It proves only that the target file does not exist yet |
| `npm run build` runs on every task | Including tasks that create an unmounted component, where `tsc` + `lint` settle the question |
| `feature-spec` §4 maps unit tests | The repo has no test runner and no test files. The mapping is never consumed |
| The 12 KB context packet is pasted into every dispatch | ~15–19 dispatches per feature × ~3k tokens |

### Root cause behind two of these

The working tree was dirty during runs (an unrelated theme refactor, untracked `doc/`). That
single fact produced both the per-task `git add -p` isolation overhead and the Gate B
false-positive FAIL in `010` Task 1.

## Goals

- Reduce per-feature token cost by roughly 40%.
- Reduce wall-clock, primarily by eliminating serial false-positive review cycles.
- Raise quality in two places: make UI behavior machine-verifiable, and make review gates
  independent of the code they review.
- Keep the skills portable to other repos; push repo-specific facts into a profile file.

## Non-goals

- Removing the two-independent-gate model. It is the quality core and it stays.
- Removing `PROGRESS.md` / `log.txt` resumable state.
- Removing the escalation rules (two strikes, then stop and ask).
- Reordering or re-running any already-committed feature.

## Design

### 1. Clean-tree precondition (`sdd` Step 0)

`/sdd` refuses to start against a dirty working tree, unless the user declares known-dirty paths
explicitly. The declared list is pasted into every gate prompt so reviewers know what is not
theirs to judge.

"Dirty" means tracked files with uncommitted modifications. Untracked paths that no task in the
plan will touch (for example `doc/`) are permitted, but must still be declared, since a reviewer
running `git status --short` will see them.

This removes the per-task `git add -p` dance and eliminates the wrong-baseline class of
false-positive FAIL at its source.

### 2. Plans carry contracts, not code (`writing-plans`)

A task step specifies the file, its exported signature, its behavior, its edge cases, its
negative constraints, and its verification command — but not the function body.

```
File: components/AddCategoryModal.tsx  (create, 'use client')
Exports: default ({ onAdded, onCancel }: { onAdded: (name: string) => void;
         onCancel: () => void }) => JSX.Element
Behavior: form submit -> addCategory(name); on !ok map reason
          duplicate|storage|blank to an inline role="alert"; on ok onAdded(name.trim())
Constraints: z-50 (paints above the fixed BottomNav); must not modify lib/categories.ts
Verify: npx tsc --noEmit && npm run lint   -> exit 0, no output
```

Consequences:

- Plan size drops from ~35 KB to ~14 KB, which multiplies through the three parallel plan-review
  passes that each read the whole plan.
- The implementer subagent writes code instead of transcribing it.
- The review gates review code they did not author. This is what independent review is for, and
  it is not currently true.

Passes A.5, B, and C stay parallel and otherwise unchanged.

### 3. Probe steps deleted; build scoped (`writing-plans`)

- Test-first probe steps are removed. With no test runner they establish only that a file does
  not exist yet, at the cost of a file create, a full `tsc` run, an exact-string comparison
  including a computed column number, and a delete.
- `npm run build` runs only when a task touches routes, configuration, or dependencies.
  `tsc` + `lint` are the default verification pair.

### 4. Playwright as the behavioral gate

Playwright is added as a dev dependency with a `test:e2e` script. Plans then write executable
steps:

```
Verify: npx playwright test e2e/010-categories.spec.ts
Expected: 4 passed
```

This replaces the per-task curl substitutes and the "RESIDUAL GAP" prose that every feature from
008 onward ended with. It is the only change here that makes the pipeline able to verify
something it previously could not verify at all.

### 5. Layer-sliced context (`sdd`)

The 12 KB packet at `memories/repo/travel-expense-context.md` is split into a small shared core
plus `[Data]`, `[Domain]`, `[UI]`, and `[Route]` slices of roughly 1.5 KB each. A dispatch
receives the core plus its own task's layer slice.

### 6. Gate prompts get a baseline contract (`sdd`)

Every gate prompt states, verbatim:

- the exact `git diff` the controller intends to commit, pasted in;
- any known-dirty unrelated paths, by name;
- the pipeline position — "the commit does not exist yet; `PROGRESS.md` and `log.txt` are written
  after you pass. Their absence is never a gap."

This eliminates both observed false-positive classes. A FAIL becomes a real signal again.

### 7. Risk-tiered gate count (`sdd`)

- **Two independent gates** for tasks touching storage, domain logic, data shape, or a module
  boundary.
- **One combined gate** for pure UI/route wiring tasks.

These two rules operate on different axes and could otherwise conflict, so their precedence is
fixed: **task-level tiering wins.** `CLAUDE.md`'s thin-feature rule continues to govern only
whether `/feature-spec` is skipped for a feature; it no longer decides gate count. A task
touching `lib/` gets two gates even inside a thin feature.

### 8. REFERENCE.md moves to the controller (`sdd`)

The controller updates `REFERENCE.md` itself, instead of each implementer subagent re-reading a
30 KB file to decide whether a row in the update table applies.

Timing matters here: the controller makes this edit **after the implementer returns and before
dispatching the gates**, so the edit is part of the diff the gates see. Gate A keeps its existing
check that `REFERENCE.md` matches the real code. Moving the work out of the implementer must not
move it out of review — a controller-authored doc edit that no gate reads would be the one piece
of every commit with no independent check on it.

### 9. `feature-spec` trims dead sections

- §4 unit-test mapping becomes **Playwright scenario mapping** — executable, and it feeds the
  plan's verification steps directly.
- §5 AC verification matrix stays, as a compact table rather than prose. It is the traceability
  check that catches uncovered edge cases.
- §6 contrarian review is unchanged; it is in-session and cheap.

### 10. Repo profile (`.claude/repo-profile.md`)

A small file holding what is true of this repo and not of skills in general: verification
commands and when each applies, the layer slices, known-dirty paths, and the fact that
Playwright — not a unit-test runner — is the behavioral gate. The skills read this file and stay
generic. A new project supplies its own profile.

## Expected savings

Derived from artifact sizes and the dispatch counts in `log.txt`. **Estimates, not measurements.**

| Stage | Now | After | Driver |
| --- | --- | --- | --- |
| `feature-spec` | ~15k | ~11k | drop dead §4, compact §5 |
| `writing-plans` | ~50k | ~28k | plan 35 KB → ~14 KB, read by 3 parallel reviewers |
| `sdd` | ~370k | ~215k | layer slices, risk-tiered gates, no probes, no false-positive cycles |
| **Per feature** | **~435k** | **~255k** | **≈ 40%** |

Playwright adds roughly 20k per feature back (writing and running specs) while removing the curl
substitutes and residual-gap prose.

Wall-clock improves more than tokens in one specific place: the gates run in parallel, so cutting
one does not shorten the critical path much, but each false-positive FAIL was a *serial* round
trip — fix dispatch, then re-review both gates, then controller investigation. Feature 010 alone
lost two of those.

## Rollout order

Each step is independently useful, and this is the dependency order.

1. Playwright + `test:e2e` script + one spec written against an already-committed feature, to
   prove the harness runs in this environment.
2. `.claude/repo-profile.md`.
3. `sdd` — clean-tree precondition, baseline contract in gate prompts, layer slices, risk
   tiering, `REFERENCE.md` ownership moves to the controller.
4. `writing-plans` — contracts-not-code, probes deleted, build scoped.
5. `feature-spec` — §4 becomes Playwright mapping, §5 compacted.
6. `CLAUDE.md` / `AGENTS.md` — update the cost-optimization section to match what the skills now
   actually do.

All three skills are edited **surgically, in place**. The gate structure, resumable state,
escalation rules, and plan templates are kept.

## Validation

No backlog remains, so the pipeline is validated on the next real change in this repo. Record:
dispatch count, wall-clock, and whether any gate FAIL was a false positive.

A controlled comparison is possible — re-run feature 010 on a throwaway branch, since its
false-positive cycles are documented — but it costs a full feature's tokens to measure.

## Risks

| Risk | Mitigation |
| --- | --- |
| Contracts-not-code yields implementations that drift from intent | The gates now review code they did not author, which is stronger than before. Contracts must name negative constraints explicitly, as the example does |
| Risk-tiering under-reviews a task misclassified as pure UI | Tiering keys off the `[Layer]` tag the plan already assigns; a task touching `lib/` gets two gates regardless of its label |
| Playwright is flaky or slow in this environment | Step 1 of rollout is a proof spec against existing code, before anything depends on it |
| Layer slices omit a fact a task needed | Slices carry a shared core; a subagent that finds the slice insufficient reports it rather than guessing, and the slice is corrected |
