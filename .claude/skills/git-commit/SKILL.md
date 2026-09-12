---
name: git-commit
description: "Verify (lint, typecheck, build when warranted, Playwright specs) and commit the currently implemented feature with a detailed conventional-commit message. Use after implementing a feature from features/NNN.*.md, or whenever asked to verify and commit the current changes. Fails closed: never commits on a lint, typecheck, build, or Playwright failure, and logs the failure to output/error/{feature}.md instead."
---

# /git-commit

Isolated verify-and-commit pipeline for this repo. [CLAUDE.md](../../../CLAUDE.md)'s feature loop invokes this skill and reacts to whether it succeeded; it does not duplicate these steps.

**Which commands to run comes from [`.claude/repo-profile.md`](../../repo-profile.md) § Verification commands** — that file is the source, this skill is the sequencer. The commit-message rules below are this skill's own.

## Usage

```
/git-commit                 # infer the feature from current git changes
/git-commit 005             # target features/005.*.md explicitly
/git-commit 005.record-expense
```

## Preconditions

Before doing anything else, run `git status`. If there are no staged or unstaged changes, stop and report that there is nothing to commit — do not proceed.

## Step 1 — Identify the feature

- If an argument was given, resolve it to the matching `features/NNN.{feature-name}.md` file.
- If no argument was given, infer it from `git status` / `git diff` (which files changed) and match against the feature currently being worked on in the conversation. If it's ambiguous (changes don't clearly map to one feature file), ask rather than guessing — a wrong feature number in the commit message and error log is worse than a short pause.

Resolve `{feature}` as the spec filename without extension, e.g. `005.record-expense`. This is used for both the commit scope and the error-log filename.

## Step 2 — Lint

Run `npm run lint`.

- **Fails:** go to Step 5 (failure path) with the lint output. Do not attempt the build.
- **Passes:** continue to Step 3.

## Step 3 — Typecheck, then build only if the change warrants it

Run `npx tsc --noEmit` — always.

Then run `npm run build` **only if the change touches routes (`app/**/page.tsx`, layouts), config, or dependencies**, per `.claude/repo-profile.md` § Verification commands. It is the slowest command here and adds nothing over `tsc` for a change that touches neither. If in doubt, run it.

- **Either fails:** go to Step 5 (failure path) with the output.
- **Both pass (or build correctly skipped):** continue to Step 3b.

## Step 3b — Behavioral gate

If the change touches anything under `app/`, `components/`, or an existing spec in `e2e/`, run the specs covering it:

```
npx playwright test e2e/<spec>.spec.ts
```

- **Fails:** go to Step 5 (failure path) with the Playwright output. A failing spec must never enter git history, exactly like a failing lint or build.
- **Passes, or no spec covers this change:** continue to Step 4.

## Step 4 — Commit (success path)

1. Stage only the files actually touched for this feature — inspect `git status --short` and `git add` them individually or by directory. Never `git add -A` or `git add .` blindly; if something unexpected shows up staged (stray debug files, `.env`, credentials-looking content), unstage it and flag it instead of committing it.
2. Read `git diff --staged` to see exactly what changed. Do not write the commit message from memory of the task — base it on the actual diff.
3. Compose the commit message per the format in **Commit message format** below.
4. Commit via heredoc (see the git-safety rules in your system instructions — never `--no-verify`, never amend an existing commit here).
5. Run `git log -1 --stat` to confirm the commit landed and touched the expected files.
6. If `output/error/{feature}.md` exists from a previous failed attempt on this feature, delete it — the feature now has a passing, committed implementation.
7. Report success: the commit hash, subject line, and file count.

## Step 5 — Log and stop (failure path)

Do **not** commit. A failing lint, typecheck, build, or Playwright spec must never enter git history.

1. Write `output/error/{feature}.md`, creating `output/error/` if needed:

   ```markdown
   # {feature} — build failed

   - Date: {ISO date}
   - Command: `npm run lint` | `npx tsc --noEmit` | `npm run build` | `npx playwright test …`   (whichever failed)

   ## Error output

   {full stdout/stderr from the failing command, unedited}

   ## Files touched (uncommitted)

   {output of `git status --short`}
   ```

2. Leave the working tree exactly as it is (uncommitted, unstaged/staged as it was) — don't stash or discard it.
3. Report failure clearly: which command failed, the key error(s), and that details are in `output/error/{feature}.md`. Do not claim success. Do not silently move on to another feature.

Note: retrying a fix and re-invoking this skill is the caller's job (see CLAUDE.md's per-feature loop), not this skill's — this skill always does exactly one lint→build→commit-or-log pass per invocation.

## Commit message format

Conventional Commits, with a body that documents *what actually changed*, not a restatement of the task:

```
<type>(<scope>): <imperative summary, ≤72 chars, no trailing period>

<body: 2-6 bullet points, wrapped at ~72 cols, describing the actual
behavior added/changed, derived from `git diff --staged` — not a
copy of the Gherkin scenario titles>

Spec: features/{feature}.md
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

- `<type>`: `feat` for a new feature from the spec, `fix` for correcting a previously committed feature, `refactor`/`chore`/`docs`/`test` as appropriate for non-feature commits.
- `<scope>`: the feature number, e.g. `005`. Omit only if the commit isn't tied to a single feature file.
- Summary: imperative mood ("add", not "added"/"adds"), specific about the behavior, not just "implement feature 5".
- Body bullets: one behavior per line, e.g. `- validate amount is a positive number before saving` rather than `- added validation`. If the diff touches multiple concerns (e.g. a new component plus a storage helper), give each its own bullet.
- `Spec:` footer line gives traceability from commit back to the acceptance criteria it satisfies.
- Keep the `Co-Authored-By` trailer — these commits are authored by the agent per this repo's standing git-commit conventions (see global git commit instructions).

### Example

```
feat(005): add expense form with trip-period validation

- add RecordExpense form with amount, currency, category, date,
  payment method, and location fields; description is optional
- default expense date to today via Date.now() on mount
- warn (non-blocking) when the entered date falls outside the
  active trip's start/end range
- persist the expense to local storage and redirect to the
  dashboard with a success toast on save

Spec: features/005.record-expense.md
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```
