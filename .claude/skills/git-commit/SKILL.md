---
name: git-commit
description: "Verify (lint, typecheck, build when warranted, Playwright specs) and commit the currently implemented feature with a detailed conventional-commit message, then push it. Use after implementing a feature from features/NNN.*.md, or whenever asked to verify, commit, and push the current changes. Fails closed: never commits on a lint, typecheck, build, or Playwright failure (logs to output/error/{feature}.md instead), and never pushes to master/main directly — an unconditional final build runs before every push, and a protected-branch commit is pushed via a feature branch instead."
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

- **Fails:** go to Step 6 (failure path) with the lint output. Do not attempt the build.
- **Passes:** continue to Step 3.

## Step 3 — Typecheck, then build only if the change warrants it

Run `npx tsc --noEmit` — always.

Then run `npm run build` **only if the change touches routes (`app/**/page.tsx`, layouts), config, or dependencies**, per `.claude/repo-profile.md` § Verification commands. It is the slowest command here and adds nothing over `tsc` for a change that touches neither. If in doubt, run it.

- **Either fails:** go to Step 6 (failure path) with the output.
- **Both pass (or build correctly skipped):** continue to Step 3b.

## Step 3b — Behavioral gate

If the change touches anything under `app/`, `components/`, or an existing spec in `e2e/`, run the specs covering it:

```
npx playwright test e2e/<spec>.spec.ts
```

- **Fails:** go to Step 6 (failure path) with the Playwright output. A failing spec must never enter git history, exactly like a failing lint or build.
- **Passes, or no spec covers this change:** continue to Step 4.

## Step 4 — Commit (success path)

1. Stage only the files actually touched for this feature — inspect `git status --short` and `git add` them individually or by directory. Never `git add -A` or `git add .` blindly; if something unexpected shows up staged (stray debug files, `.env`, credentials-looking content), unstage it and flag it instead of committing it.
2. Read `git diff --staged` to see exactly what changed. Do not write the commit message from memory of the task — base it on the actual diff.
3. Compose the commit message per the format in **Commit message format** below.
4. Commit via heredoc (see the git-safety rules in your system instructions — never `--no-verify`, never amend an existing commit here).
5. Run `git log -1 --stat` to confirm the commit landed and touched the expected files.
6. If `output/error/{feature}.md` exists from a previous failed attempt on this feature, delete it — the feature now has a passing, committed implementation.
7. Report the commit (hash, subject line, file count), then continue to Step 5 to push it.

## Step 5 — Push (branch guard + final build gate)

The commit in Step 4 already exists in local history — nothing in this step ever undoes it. This step only decides whether, and where, it gets pushed.

1. **Final build gate — always, unconditionally.** Run `npm run build`, even if Step 3 already ran it, and even if Step 3's route/config/dependency heuristic said to skip it. This is the last check before anything leaves the machine, independent of that earlier heuristic. Expected: exit 0, `Compiled successfully`, then the route table (same success shape as `.claude/repo-profile.md` § Verification commands).
   - **Fails:** do not push. Write (or append to, if Step 4 already deleted it) `output/error/{feature}.md` noting the commit hash that landed locally, the `npm run build` output, and that the push was blocked by this failure. Report clearly that the commit succeeded locally but the push did not happen, and why. Stop — do not loop retrying the build and do not push around it.
   - **Passes:** continue.

2. **Never push directly to a protected branch.** `master` and `main` are protected, unconditionally. Check with `git branch --show-current`:
   - **On `master`/`main`:** do not push it. Point a branch at the commit just made and push that instead, leaving the working branch on `master`:
     ```
     git branch -f <branch-name> HEAD
     git push -u origin <branch-name>
     ```
     `git branch -f` here only moves a branch pointer forward along `master`'s own line (or creates the branch if it doesn't exist yet) — it discards nothing, since every commit reachable from the old pointer stays reachable from `master`. Do not `git checkout` the new branch; stay on `master` so the next feature's `/sdd` run continues there uninterrupted.
   - **On any other branch** (already working on a feature branch): push it directly — `git push -u origin <branch>` if it has no upstream yet, plain `git push` otherwise.

   **Branch naming:** `<type>/<slug>`, reusing the commit's `<type>` (Step 4) and `{feature}` (Step 1) — e.g. `feat/005-record-expense` (the feature's dot becomes a hyphen). If the commit isn't tied to a single feature file, derive `<slug>` from the commit subject instead (kebab-case, first ~5 words).

3. **Never force-push.** Plain `git push` (`-u` only for a first push on a new branch). If it's rejected as non-fast-forward, the remote branch moved out from under you — stop and report it. Do not `--force` or `--force-with-lease` past that without the user explicitly asking for it in this conversation.

4. **No remote configured:** if `git remote -v` shows no `origin`, skip pushing, say so in the report, and stop.

5. **Report the result:** the branch that was pushed (or why nothing was pushed), and — since this skill does not open pull requests — that the branch is ready for `gh pr create` whenever the user wants one.

### Red flags — pushing to master/main anyway

| Rationalization | Reality |
|---|---|
| "It's just a docs/chore commit" | The guard is about the branch, not the diff. Docs and chores get a branch too. |
| "Solo project, nobody else pushes here" | The guard exists so a broken build or bad push can't land on `master` unreviewed — that risk doesn't depend on team size. |
| "Branching is slower, master is right there" | `git branch -f` + push is two commands and never touches the working tree. Slower is not a reason to skip a safety rule. |
| "The user asked me to push, so master is fine" | "Push" in this skill always means: through this guard, to a branch. Pushing `master`/`main` directly needs an explicit, separate request naming that branch. |

## Step 6 — Log and stop (pre-commit failure path)

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

Note: retrying a fix and re-invoking this skill is the caller's job (see CLAUDE.md's per-feature loop), not this skill's — this skill always does exactly one lint→build→commit→push-or-log pass per invocation.

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
