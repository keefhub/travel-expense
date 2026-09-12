---
name: sdd
description: "Execute an implementation plan (plan.md with numbered tasks) one task at a time via fresh subagents, gated by two independent reviews (spec compliance, code quality) before anything is committed. Use when asked to run/execute a plan with subagents, 'subagent-driven development', or to drive a plan.md produced by the writing-plans skill through to completion autonomously. Persists resumable state to PROGRESS.md and log.txt beside the plan. Does not write plans (see writing-plans) and does not review already-merged code (see code-review)."
---

# /sdd

Execute a `plan.md` task-by-task using **fresh subagents** for implementation and **two independent review gates** per task, with the controller (this session, never a subagent) owning every commit. This replaces the solo "## Execution" loop that `writing-plans` appends to its plans — leave that section in the plan file as-is, just don't follow it while `/sdd` is driving.

## Usage

```
/sdd <path-to-plan.md>
```

e.g. `/sdd doc/features/005-record-expense/plan.md`.

## Core invariants

These are non-negotiable — do not shortcut them under time pressure or when a task "looks trivial":

1. **One task in flight at a time.** Never start task N+1 while task N's implementation or review is still in progress. Within a task, the two review gates run **in parallel** (dispatched in the same message, not sequentially).
2. **Fresh subagent per task.** Every implementer and every reviewer is a brand-new `Agent` call with no memory of prior tasks. Its prompt must contain the full task text and every piece of context it needs, pasted in — never "see the plan we discussed" or "as before." The implementer is explicitly told not to run `git add` or `git commit`.
3. **Two mandatory review gates**, each a separate fresh subagent that reads the actual changed files itself (`git status`, `git diff`, then `Read` the full files) — never trusts the implementer's self-reported summary:
   - **Spec/requirements reviewer** — did it build what the task and source spec asked for; lists gaps.
   - **Code-quality reviewer** — is it correct and consistent with this codebase's own patterns; lists bugs/issues.
     Both must return `PASS` before the task can be committed.
4. **Persistent, file-based state**: `PROGRESS.md` (one checkbox per task) and `log.txt` (append-only, one entry per completed task) live beside `plan.md`. Update both **only after both gates pass and the commit exists** — this is what makes a run resumable after the session dies mid-plan. Do not use the in-session todo list as a substitute; it does not survive a restart.
5. **The controller commits, never a subagent.** No implementer or reviewer subagent ever runs `git add`/`git commit`. This session stages, reviews the diff, and commits only after both gates are green.
6. **Dispatch gate before every task** (including the first): confirm the previous task's checkbox, log entry, commit, and both gate verdicts all agree before starting the next one.
7. **Escalate, don't blindly retry.** If the same task fails for the 2nd consecutive time (implementation failure, or a gate still failing after one fix-and-re-review cycle), stop and ask the user how to proceed. Do not attempt a 3rd automatic try.
8. **No branch-guard checks.** This is a personal project — direct commits to the current working branch are fine. Do not add protected-branch logic.
9. **Clean working tree before the run starts.** "Dirty" means **tracked files with uncommitted modifications**. Untracked paths no task will touch are permitted but must be declared. This is not tidiness: every reviewer runs `git status --short` and sees the same tree, so undeclared changes are what produce wrong-baseline review findings — a gate failing on code that is not part of this task at all. The permanently-permitted paths live in [`.claude/repo-profile.md`](../../repo-profile.md) § Known-dirty paths; read them there rather than keeping a copy here.

---

## Step 0 — Setup

1. **Clean-tree precondition — run this FIRST, before anything else in Step 0.** `git status --short`. Treat every path in [`.claude/repo-profile.md`](../../repo-profile.md) § Known-dirty paths as permanently permitted. If any *other* tracked file shows uncommitted modifications, **stop and report** — list the files and ask the user to commit, stash, or declare them. Record whatever they declare; Step 3 of the per-task loop pastes that list into every gate prompt.

   > This is item 1 deliberately. Items 4 and 5 below *create* `PROGRESS.md` and `log.txt`, so a precondition placed after them would trip on files `/sdd` itself had just written.

2. Read the plan file at `<path-to-plan.md>` in full. Note its `**Source:**`, `**Goal:**`, `**Architecture:**` header lines and every `### Task N: [Layer] — <outcome>` section (each with a `**Files**` manifest and `- [ ]` steps, per this repo's `writing-plans` skill conventions). If the plan uses a different heading shape, adapt to it — the invariant is "one task, one Files manifest, one verification command per step," not this exact syntax.
3. Let `<plan-dir>` be the directory containing the plan file.
4. **`PROGRESS.md`** — if `<plan-dir>/PROGRESS.md` does not exist, create it (template below) seeded with one unchecked line per task found in the plan. If it exists, read it — it is the source of truth for what's already done, not your memory of a prior session.
5. **`log.txt`** — if `<plan-dir>/log.txt` does not exist, create an empty file. If it already exists (e.g. from prior manual execution of this same plan), leave existing entries untouched and append below them.
6. Find the first unchecked task in `PROGRESS.md`. If none — every task is checked — skip to **Completion** below.
7. Read the **core** context packet (`memories/repo/travel-expense-context.md`) — the orientation
   map handed to every subagent. Each dispatch also receives **one** layer slice from
   `memories/repo/slices/`, chosen by the task's `[Layer]` tag per
   [`.claude/repo-profile.md`](../../repo-profile.md) § Layer slices; where no slice matches the
   tag, the dispatch gets the core alone and is told so. Never guess a slice. Re-read
   [REFERENCE.md](../../../REFERENCE.md) itself only when a task will modify it (see below), and
   refresh the core or the affected slice in that same change if it has gone stale.

**`PROGRESS.md` template:**

```markdown
# SDD Progress — <plan title>

Plan: `<path-to-plan.md>`

- [ ] Task 1: [Layer] — <outcome>
- [ ] Task 2: [Layer] — <outcome>
- [ ] Task 3: [Layer] — <outcome>
```

Each line is ticked with its commit hash appended only in Step 6 below, e.g. `- [x] Task 1: [Data] — add expense storage helpers (a1b2c3d)`.

---

## Keeping REFERENCE.md and CLAUDE.md current

[REFERENCE.md](../../../REFERENCE.md) states its own policy: "if it contradicts the code, the code wins; fix this file in the same change." `/sdd` enforces that policy at every task, since each task is exactly one committed change and the doc update belongs in that same commit — not a cleanup pass at the end of the plan.

**The controller owns this update, not the implementer.** Wire it into the loop as: the implementer builds and reports (Step 2), **the controller updates REFERENCE.md against the table below — after the implementer returns and before the gates are dispatched (Step 2b)** — the spec reviewer then checks that update against the real code as part of the diff it reviews (Step 3, Gate A), and the controller stages it with everything else the task touched (Step 6). Never touch either file from outside a task's own diff.

The timing is the point. Moving the work off the implementer saves every dispatch a 30 KB read, but making the edit *after* the gates would leave the one part of each commit that no reviewer ever sees. Doing it before they are dispatched keeps it inside the reviewed diff.

The controller reads only the section the table points at — not the whole file.

**REFERENCE.md — update in the same task's diff when the task:**

| Task does this                                                                                                                                                                                                                | Update this section            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Adds a file/directory under `app/`, `lib/`, `components/`, or otherwise changes the tree shown in §4                                                                                                                          | §4 Current file layout         |
| Adds, removes, or upgrades a runtime dependency                                                                                                                                                                               | §2 Stack                       |
| Defines or changes a storage key, or a module's public API (the big one: feature 012, the storage layer — §6 explicitly says "record its keys and its public API here so nobody has to read the implementation to find them") | §6 Domain facts                |
| Makes any other fact in §1, §4, §5, or §6 stop matching the code (a "not yet fixed" placeholder gets fixed, a listed gotcha turns out wrong, a new Next.js 16 API surprise gets discovered)                                   | whichever section is now wrong |

A task that touches none of the above leaves REFERENCE.md untouched — do not add speculative or restating-the-obvious lines.

**CLAUDE.md — touch only when the task itself changes the workflow**, not when it implements product code: a new skill, a revised implementation order, a changed per-feature loop step. This will be rare-to-never for ordinary feature tasks; most plans executed by `/sdd` should never modify CLAUDE.md. If a task's own plan text calls for a process change, update it there and say so in the log entry's Key Decisions.

---

## The per-task loop

Run this loop once per task, strictly in order. Do not read ahead and batch tasks.

### Step 1 — Dispatch gate

Before starting this task (skip these checks only for the very first task of the run):

- [ ] `PROGRESS.md` shows the previous task checked, with a commit hash.
- [ ] `log.txt` has a matching entry for the previous task.
- [ ] `git log --oneline -1` shows a commit whose subject matches that task's scope.
- [ ] That `log.txt` entry shows both review gates as `PASS`.

If any of these is false, **stop and tell the user** what's inconsistent — do not guess forward or "fix" state silently.

### Step 2 — Implement (fresh subagent)

Dispatch one `Agent` call, `subagent_type: general-purpose`, run in the foreground (`run_in_background: false` — the next step depends on its result). Build the prompt from this template, with everything in `{{...}}` pasted in literally:

```
You are implementing exactly one task from an implementation plan. Work
only within the scope below — do not read ahead in the plan, do not touch
other tasks, and do NOT run `git add` or `git commit` under any
circumstances; the controller commits after independent review.

PLAN CONTEXT
Goal: {{plan.md Goal line}}
Architecture: {{plan.md Architecture paragraph}}
Source: {{plan.md Source line, if present}}

REPO CONVENTIONS
{{the core packet (memories/repo/travel-expense-context.md) PLUS the one slice from
  memories/repo/slices/ matching this task's [Layer] tag. Where no slice matches the
  tag, paste the core alone and say so. Paste these, never the raw
  REFERENCE.md/OVERVIEW.md/design.md files.}}

If anything this task needs is missing from the context above, say so in your
report rather than guessing — the slice gets corrected.

TASK TO IMPLEMENT (verbatim from plan.md)
{{full "### Task N: ..." section — Files manifest and every step}}

Instructions:
1. Follow the steps in order. Each step names its own verification command
   and an Expected: line — run the command yourself and compare the real
   output.
2. If a real result doesn't match an Expected: line, stop, do not improvise
   beyond what the step describes, and report the mismatch instead of
   pushing forward.
3. Do not perform any step titled "Commit" — stop once the task's
   regression verification (lint/typecheck/build, or the task's final
   check) passes.
4. Leave REFERENCE.md and CLAUDE.md alone. The controller owns both — do
   not read or edit them for this task.
5. Report back: every file created/modified/deleted, the literal output of
   each verification command you ran, and any deviation from the plan as
   written (extra file, different name, a step that turned out
   unnecessary).
```

If the implementer reports it could not complete a step, or a verification command's real output didn't match `Expected:`, treat this as a **failed attempt** for this task (see Escalation).

### Step 2b — Controller updates REFERENCE.md (before dispatching gates)

Check what the implementer actually changed against the REFERENCE.md table in *Keeping REFERENCE.md and CLAUDE.md current*. If a row applies, update that section now — reading only that section, not the whole file. If no row applies, leave REFERENCE.md untouched; do not add speculative or restating-the-obvious lines.

This must happen **before** Step 3, so the edit is inside the diff the gates review.

### Step 3 — Two review gates (parallel, fresh subagents)

**How many gates this task gets** is decided per task by its `[Layer]`, not by the size of the
feature it belongs to. [`.claude/repo-profile.md`](../../repo-profile.md) § Gate risk tiers is the
source of the rule; do not restate its criteria here. In short: a task touching types, data,
domain logic, `lib/`, or any module boundary gets **two** independent gates; pure UI and route
wiring with no `lib/` change gets **one** combined gate — a single fresh subagent given the Gate A
brief with the Gate B checklist appended to its report instruction.

Task-level tiering outranks the feature-level thin rule. A task touching `lib/` gets two gates even
inside a thin feature; `CLAUDE.md`'s thin-feature rule governs only whether `/feature-spec` is
skipped.

**Every gate prompt opens with the baseline contract below, pasted in by the controller.** Both
false-positive classes seen in practice came from its absence — a reviewer judging the working tree
instead of this task's diff, and a reviewer flagging the not-yet-existing commit as a gap.

```
BASELINE — read this before anything else.

THE DIFF UNDER REVIEW (this is the whole change; nothing else is yours to judge):
{{the exact `git diff` the controller intends to commit, pasted verbatim}}

UNRELATED UNCOMMITTED PATHS, declared at Step 0 — NOT part of this task, never a finding:
{{the declared known-dirty list, by name, or "none"}}

WHERE YOU ARE IN THE PIPELINE: the commit does not exist yet. `PROGRESS.md` and `log.txt` are
written by the controller only after you pass. Their absence, an unticked checkbox, and a missing
commit are the correct state right now and are never a gap.

If your reading of the repo disagrees with the diff above, re-read against `git show HEAD:<path>`
before reporting — the working tree may contain changes that are not this task's.
```

Dispatch **both** of the following in the **same message** (two `Agent` tool calls, `subagent_type: general-purpose`, `run_in_background: false`) so they run in parallel and you block on both before deciding.

**Gate A — Spec/requirements reviewer:**

```
{{paste the BASELINE block above, filled in, as the first thing in this prompt}}

You are reviewing whether a just-completed implementation task actually
satisfies its specification. You were not involved in writing the code —
verify everything yourself from the real files, never from a summary
someone else gives you.

TASK AS SPECIFIED (verbatim from plan.md)
{{full "### Task N: ..." section}}

SOURCE REQUIREMENT
{{relevant excerpt from the spec the plan cites (features/NNN.*.md /
  doc/features/<NNN>-<slug>/spec.md), or "None cited — judge against the task text only."}}

Do this, in order:
1. Run `git status --short` and `git diff` (or `git diff --staged` if the
   changes are already staged) to see exactly what changed.
2. Read the full content of every changed file listed — not just the diff
   hunks — so you can judge behavior the diff alone won't show.
3. Check every step and acceptance detail in the task/spec against what
   the code actually does.
4. Check REFERENCE.md against this rule: {{paste the "REFERENCE.md —
   update in the same task's diff when..." table}}. If a row applies and
   REFERENCE.md was NOT updated in this diff, that is a gap. If REFERENCE.md
   was updated, confirm what it now says still matches the real code you
   just read — a stale or inaccurate doc update is also a gap.

Report:
VERDICT: PASS or FAIL
Gaps: anything the task/spec asked for that the code does not do — quote
  the task/spec line and point at the file/line that's missing it. Include
  any REFERENCE.md gap found in step 4 here.
Extras: anything the code does that the task did not ask for (flag, don't
  necessarily fail on it alone).

Do not comment on code style or implementation quality — a separate
reviewer covers that. Do not edit any files.
```

**Gate B — Code-quality reviewer:**

```
{{paste the BASELINE block above, filled in, as the first thing in this prompt}}

You are reviewing a just-completed implementation task for correctness and
consistency with this codebase's own patterns — not against the spec (a
separate reviewer covers that). Verify everything from the real files, not
from a summary someone else gives you.

REPO CONVENTIONS
{{the core packet (memories/repo/travel-expense-context.md) PLUS the one slice from
  memories/repo/slices/ matching this task's [Layer] tag. Where no slice matches the
  tag, paste the core alone and say so.}}

If anything you need to judge this task is missing from the context above, say so
in your report rather than guessing — the slice gets corrected.

TASK AS IMPLEMENTED (verbatim task text from plan.md, for context only)
{{full "### Task N: ..." section}}

Do this, in order:
1. Run `git status --short` and `git diff` to see exactly what changed.
2. Read the full content of every changed file — not just the diff hunks.
3. Check for: logic bugs, unhandled edge cases the task implies, type
   issues ESLint/tsc wouldn't catch, inconsistency with this repo's
   existing patterns (naming, layer boundaries — see the table above —
   error handling style), and dead or duplicated code.

Report:
VERDICT: PASS or FAIL
Issues: each one as file:line, what's wrong, and the concrete fix.

Do not comment on whether the task matches the spec — a separate reviewer
covers that. Do not edit any files.
```

### Step 4 — Gate decision

- **Both PASS** (or the single combined gate PASSes, for a one-gate task) → go to Step 5 (commit).
- **One or both FAIL** (or the combined gate FAILs) → dispatch a fresh fix subagent (`general-purpose`, foreground) scoped to only the failing findings:

```
A reviewer found the following issues in a task you're about to fix. Fix
exactly these — do not expand scope, do not touch files this task didn't
already touch unless the fix genuinely requires it, and do NOT run
`git add` or `git commit`.

TASK (original, for context)
{{full "### Task N: ..." section}}

REVIEWER FINDINGS TO FIX
{{verbatim findings from the failing gate(s)}}

Report back: what you changed and why, file by file.
```

Then re-run **only the gate(s) that failed** — a fresh subagent again, same prompt template as Step 3. **Exception:** if the fix touches files or logic that the _passing_ gate already reviewed, re-run **both** gates (for a one-gate task, simply re-run the combined gate), since the passing verdict no longer covers the current diff.

This fix-and-re-review cycle is the task's **one allowed retry**. If, after it, either gate still fails, that is the task's 2nd consecutive failure — go to **Escalation**, do not fix-and-re-review a second time.

### Step 5 — Escalation

Attempt counts are tracked for the conversation, not persisted to disk (only completed tasks are persisted — see invariant 4). A "failed attempt" is either: the implementer failing to complete Step 2, or a gate still failing after Step 4's one fix-and-re-review cycle.

If the **same task** produces its 2nd failed attempt in a row: **stop**. Do not dispatch a 3rd attempt. Report to the user:

- The task number and title.
- What was tried both times (implementer summary, gate findings).
- A concrete question: retry with guidance, skip and revisit later, or take it over manually.

If a session restarts mid-task, treat the resumed task as a fresh first attempt — there is no persisted attempt counter to recover.

### Step 6 — Commit (controller only, never a subagent)

Once both gates show `PASS`:

1. `git status --short` — stage only the files this task actually touched (per its `**Files**` manifest, plus REFERENCE.md/CLAUDE.md if the implementer updated either per the previous section, and the reviewers' `git diff`). Never `git add -A`/`git add .`. If anything unexpected is staged, unstage and flag it.
2. `git diff --staged` — read it; the commit message must come from the real diff, not the task description.
3. Compose the message in this repo's format (same convention as the `git-commit` skill):

   ```
   <type>(<scope>): <imperative summary, ≤72 chars>

   <2-6 body bullets, one behavior per line, derived from the diff>

   Spec: <plan's Source file, if it points at a features/*.md>
   Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
   ```

   `<type>` is `feat`/`fix`/`refactor`/`chore` as appropriate; `<scope>` is the feature number if the plan is tied to one.

4. Commit via heredoc. Never `--no-verify`, never amend, never force anything.
5. `git log -1 --stat` to confirm the commit landed with the expected files.

### Step 7 — Update persistent state (only after the commit exists)

Do all three:

1. **`plan.md`** — tick this task's `- [ ]` steps to `- [x]` (and the task heading, if the plan format ticks those too). On the _first_ task completed in this run, set the plan header's `**Status:**` to `In Progress` if it isn't already.
2. **`PROGRESS.md`** — tick this task's line and append the commit hash: `- [x] Task N: ... (abc1234)`.
3. **`log.txt`** — append an entry, append-only, using this shape (extends the `writing-plans` log format with the two gate verdicts and the commit):

```
=====================================================================
Task N: [Layer] — <outcome>
Completed: <YYYY-MM-DD>
Commit: <hash>

Summary:
  <1-3 sentences on what actually landed>

Key Decisions:
  <every choice a future reader couldn't infer from the code, or "None.">

Deviations:
  <anything that differed from the plan as written, or "None.">

Files Changed:
  - <path> (created|modified|deleted)

Verification:
  <commands run and their real results>

Review Gate — Spec:    PASS (attempt <n>)
Review Gate — Quality: PASS (attempt <n>)
=====================================================================
```

For a one-gate task, replace the two `Review Gate —` lines with one:

```
Review Gate — Combined: PASS (attempt <n>)
```

If the plan itself turned out to be wrong (an extra file, a superseded step), strike the affected step in `plan.md` with `~~...~~` and a one-line pointer to the `log.txt` entry — do not delete it. Do not renumber tasks; `log.txt` and commit messages reference them by number.

### Step 8 — Loop or finish

Go back to **Step 1** for the next unchecked task. When `PROGRESS.md` shows every task checked:

## Completion

1. Set `plan.md`'s `**Status:**` to `Complete`.
2. Append a `## Completion Summary` block to `plan.md` (What was built / Deviations from the plan / Follow-ups not in scope / Final verification) — same shape `writing-plans`/`PLAN-MAINTENANCE.md` uses.
3. Report to the user: total tasks completed, total commits made, and point them at `log.txt` for the full history.
