---
name: writing-plans
description: "Turn a feature spec, ticket, or freeform requirement into a numbered, task-by-task implementation plan saved as plan.md, with a Files manifest and a literal verification command plus its exact expected output on every step. Use when asked to write a plan, plan a feature, plan an implementation, break work into tasks, create a task breakdown, produce an implementation plan for a features/NNN.*.md or doc/spec/*.md file, or amend/extend/update an existing plan. Also use before starting any multi-file change in this Next.js App Router repo, where data (lib/storage), domain (lib/*), component, and route work must land as separate tasks. Do NOT use to write product requirements, business analysis, acceptance criteria, or Gherkin specs — those are authored under features/ and doc/spec/ and are the input to this skill, not its output. Do NOT use to execute a plan; this skill stops at a saved plan."
---

# writing-plans

Produce an implementation plan. This skill **never writes production code** — its only output is a plan document (plus, when amending, an updated one).

## Resolving `<skill-root>`

Every path in this file is relative to `<skill-root>`, the directory containing **this** SKILL.md.

Derive it from the path you loaded this file from — strip the trailing `/SKILL.md`. Never assume the current working directory, and never assume a platform-specific skills location. If you somehow don't have that path, find it:

```bash
find . -type d -name writing-plans -path '*/skills/*' 2>/dev/null
```

The two reference files are then:

- `<skill-root>/references/PLAN-TEMPLATES.md` — plan header, test-first task template, refactor task template
- `<skill-root>/references/PLAN-MAINTENANCE.md` — how plan.md and log.txt are updated during execution

Read `PLAN-TEMPLATES.md` before drafting. Read `PLAN-MAINTENANCE.md` before writing the Execution section.

## This repo (verified — see Provenance)

Facts a plan written here must respect:

|                    |                                                                                                                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack              | Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict: true`), Tailwind CSS 4, ESLint 9 flat config                                                                                                                                                                           |
| Lint               | `npm run lint` — exit 0, prints nothing on success                                                                                                                                                                                                                                       |
| Typecheck          | `npx tsc --noEmit` — exit 0, prints nothing on success; exit 2 on failure                                                                                                                                                                                                                |
| Build              | `npm run build` — also runs TypeScript; exit 0, prints a "Compiled successfully" line and a route table                                                                                                                                                                                  |
| Dev server         | `npm run dev` (declared in `package.json`)                                                                                                                                                                                                                                               |
| **Test framework** | **None is installed.** `package.json` has no `test` script, and `node_modules/.bin` contains only `eslint`, `next`, and `tsc`. Do not write plan steps that invoke `jest`, `vitest`, `playwright`, or `npm test` — they do not exist here. See _Test-first without a test runner_ below. |
| Path alias         | `@/*` maps to the repo root (`tsconfig.json`)                                                                                                                                                                                                                                            |
| Backend            | None. Data lives in browser local storage; there is no API layer, server, or database.                                                                                                                                                                                                   |

> **Context packet:** the facts in this table, the layer boundaries below, and the design/domain
> facts from `REFERENCE.md`/`OVERVIEW.md`/`design.md` are also distilled in the repo context packet
> at `/memories/repo/travel-expense-context.md`. Read that packet instead of re-reading the raw
> files; re-read the raw files only when a task modifies them.

### Layers (task boundaries)

Only `app/` exists today; the rest are created as features land. These are the boundaries a plan splits tasks along:

| Layer  | Path                  | Holds                                                                          |
| ------ | --------------------- | ------------------------------------------------------------------------------ |
| Types  | `lib/types.ts`        | Shared domain types                                                            |
| Data   | `lib/storage/**`      | Local-storage read/write, key naming, serialization, error surfacing           |
| Domain | `lib/<domain>/*.ts`   | Pure functions — validation, mapping, formatting. No DOM, no storage, no clock |
| UI     | `components/**/*.tsx` | Presentational React components                                                |
| Route  | `app/**/page.tsx`     | App Router entries, client components where they touch storage                 |

**Data, domain, and UI/route changes are always separate tasks.** Never one task that adds a storage call _and_ the form that uses it.

Next.js 16 differs from older training data. When a task depends on an App Router API you are not certain of, add a step that reads the relevant file under `node_modules/next/dist/docs/` and cite it in the plan.

## Input resolution

In order — take the first that applies:

1. **An explicit path** in the request (`features/005.record-expense.md`, `doc/spec/005.record-expense.md`, a ticket file). Use it.
2. **A requirement or ticket ID** (`005`, `feature 12`). Resolve it: `ls features/ doc/spec/ | grep -i <id>`. If it matches more than one file, ask which.
3. **Freeform requirements stated in the conversation.** Use them, and quote them verbatim into the plan's Source field so the plan carries its own source.
4. **Nothing usable** → ask the user what to plan. Do not invent a requirement.

## Where the plan is saved

- **A source document exists** → save the plan beside it: `doc/spec/005.record-expense.md` → `doc/spec/005.record-expense.plan.md`. Keeping plan and source adjacent is what makes the plan findable later.
- **No source document** → `doc/plans/<NNN>-<feature-name>/plan.md`, where `<NNN>` is the next unused 3-digit number under `doc/plans/`. This keeps every generated artifact — specs from `/feature-spec` and plans from this skill — under the single `doc/` root. Compute the number with plain shell — no helper script:

```bash
last=$(ls -d doc/plans/[0-9][0-9][0-9]-* 2>/dev/null | sed 's#.*/##' | grep -oE '^[0-9]{3}' | sort -n | tail -1)
printf '%03d\n' $(( 10#${last:-000} + 1 ))
```

`doc/plans/` does not exist in this repo yet, so this prints `001`. Before writing, confirm the number is free on disk — `ls -d doc/plans/<NNN>-* 2>/dev/null` must print nothing. If it prints a directory, that number is taken: increment and re-check rather than overwriting someone else's plan.

`log.txt` (see `PLAN-MAINTENANCE.md`) always sits next to `plan.md`.

---

# Workflow

## Step 1 — Validate

Before decomposing, write out — in your reply, not just internally:

1. The requirement in **1–2 sentences**.
2. Every **negative constraint**, restated explicitly: `Note: will NOT touch the public API`, `Note: will NOT modify the existing storage key format`, `Note: does NOT add edit or delete for expenses`. Scope sections in the source documents (`features/*.md`, `doc/spec/*.md` — "Out of scope") are the first place to look for these.
3. Every assumption, each as `Assumed: X`.

Then **proceed immediately to Step 2 without waiting for confirmation.** The restatement exists so the user can correct the scope while you draft — a blocking question here costs more than a correction later. Ask only if you have no usable requirement at all (input resolution case 4).

This step produces a plan. It never produces code, and it never edits a file under `app/`, `lib/`, or `components/`.

## Step 2 — Decompose

Numbered tasks, each titled:

```
Task N: [Layer] — [Specific Outcome]
```

e.g. `Task 3: [Domain] — validateExpense rejects a non-positive amount`. Titling every task with its layer makes dependency order visible at a glance: Types → Data → Domain → UI → Route.

Rules:

- **One task = one engineer, one session, 3–8 steps.** More than 8 steps means it is two tasks.
- **Data, backend, and UI changes are always separate tasks.** In this repo that reads: `lib/storage/**`, `lib/<domain>/**`, and `components/` + `app/` never share a task.
- **A step containing "and also", or a second verb, gets split.** "Add the field and wire it to storage" is two steps.
- Every task opens with a **Files** manifest before its first step:

```markdown
**Files**

- create: `lib/expenses/validateExpense.ts`
- modify: `lib/types.ts`
- test: `npx tsc --noEmit`, `npm run lint`
```

Under `test:` list the exact verification commands that prove this task landed — in this repo, the commands from the table above.

- Tasks are ordered so that each one's verification can actually pass at that point in the sequence. A task whose typecheck only passes after a later task lands is mis-ordered.

## Step 3 — Test-first steps

**Every step carries literal code or an exact command, AND its exact expected output.** Not "verify it works" — the output string an implementer compares against:

```
Expected: 1 test failed — parseInterval is not defined
```

**Banned as steps:** "Add tests", "handle edge cases", "polish", "wire it up", "make sure it works". Each hides an unspecified amount of work and gives the implementer nothing to compare against.

### Test-first without a test runner

This repo has no test runner (see the table above), so the red→green loop runs through the **compiler**, which is a real and verified failure signal here:

1. **Write the call site first** — the code that uses the function you are about to write, or a type-level assertion of the contract.
2. **Run `npx tsc --noEmit` and expect a specific, quoted failure.** Both formats below were produced by this repo:

```
Expected: exit 2, output exactly —
lib/expenses/validateExpense.ts(1,10): error TS2305: Module '"@/lib/types"' has no exported member 'ExpenseFormValues'.
```

```
Expected: exit 2, output exactly —
app/expenses/new/page.tsx(3,31): error TS2307: Cannot find module '@/lib/expenses/validateExpense' or its corresponding type declarations.
```

3. **Write the minimal implementation** — enough to satisfy that error and nothing more.
4. **Re-run `npx tsc --noEmit`.** `Expected: exit 0, no output.`
5. **Regression run:** `npm run lint` (`Expected: exit 0, no output.`) then `npm run build` (`Expected: exit 0, ending with a route table listing the app's routes.`)

For behavior a compiler cannot see — a warning banner, a redirect, a chart — the verification step is an explicit manual check, written so it can only be answered yes or no:

```
- Run `npm run dev`, open http://localhost:3000/expenses/new, enter a date after
  the trip end date, and submit.
  Expected: the expense saves, and the text "This date is outside your trip
  dates." appears above the date field. The form does not block submission.
```

"Open the page and check it looks right" is not a verification step.

If a test runner is ever added to `package.json`, use it and quote its real output instead — but run the command and see its output before putting it in a plan.

### Refactor template

For **mechanical, behavior-preserving changes only** — a rename, a file move, an extraction with no logic change. It replaces the red step with a build verification: apply change → `npm run lint && npx tsc --noEmit && npm run build` → commit. The full template is in `<skill-root>/references/PLAN-TEMPLATES.md`.

**When in doubt, use test-first.** If the change alters _any_ observable behavior, it is not a refactor.

## Step 4 — Review

Pass A (self-review) runs first, in-session. Passes A.5, B (when applicable), and C are then
**dispatched in parallel in the same message** — three fresh subagents, each receiving the frozen
draft plan and the requirements source, none seeing the others' output. When all three return,
reconcile their findings into the plan before Step 5. Parallel dispatch costs the same tokens as
sequential but roughly a third of the wall-clock; never stagger the dispatch (a pass that sees
another's output is anchored by it and silently merges the reviews).

### Pass A — Self-review

Check the draft yourself:

- Every requirement in the source maps to at least one task.
- No placeholders, no `TODO`, no `<fill this in>`, no "TBD".
- Symbol names, file paths, and type names are consistent across tasks — `validateExpense` in Task 3 is not `validateExpenseForm` in Task 6.
- No task violates a negative constraint from Step 1.
- Every step has a verification command and an expected output.

### Pass A.5 — Independent coverage check (every plan)

A self-review misses the same requirement it already forgot to map. That is why this pass gets its own agent and its own narrow prompt.

Dispatch a **fresh general-purpose subagent** with the requirements source and the draft plan, and **no other context** — no conversation history, no rationale, no reassurance about what you already checked. Its only job:

> You are given two documents: a requirements source and a draft implementation plan.
>
> REQUIREMENTS SOURCE:
> <paste the full source document, or the verbatim freeform requirements>
>
> DRAFT PLAN:
> <paste the full draft plan>
>
> Do exactly two things, and nothing else:
>
> 1. List every requirement, rule, or acceptance criterion in the source that is NOT covered by any task in the plan. Quote the source text and give its line or section.
> 2. List every task in the plan that claims to implement something the source does not contain. Quote the task text.
>
> Do not evaluate the technical approach. Do not suggest improvements. Do not comment on style, ordering, or wording. Output only the two lists; write "None" under a heading if it is empty.

**Fix everything it returns before continuing** — either add the missing task, delete the unsourced one, or record it in the plan as an explicit `Assumed:` line if it is a deliberate addition.

### Pass B — Adversarial critique (non-trivial plans only)

A plan is **non-trivial** if either holds:

- it spans **3 or more tasks AND touches 3 or more files**, or
- it makes an **architectural decision**: a new service or module boundary, a data-model change, an API or storage-contract change, or a transactional boundary.

Otherwise **skip this pass entirely** — do not dispatch, do not mention it.

Dispatch a **general-purpose subagent** with the draft plan and a one-sentence statement of the goal:

> GOAL: <one sentence — what this plan is meant to achieve>
>
> PLAN:
> <paste the full draft plan>
>
> Argue against this approach. Assume it is flawed and find where. Consider: a
> simpler design that meets the same goal; ordering that will break mid-way;
> hidden coupling between tasks; state or concurrency the plan ignores; a data
> or storage contract that will need changing again immediately.
>
> Flag every finding as exactly one of:
>
> - **Blocking** — the plan will produce wrong or unbuildable results as written.
> - **Advisory** — a preference or an improvement that is not required.
>
> Be specific: name the task number and what breaks.

**Incorporate every Blocking finding.** Advisory findings are yours to judge. In your reply, **summarize the critique in a few sentences — never paste it verbatim.**

### Pass C — Plan document review (every plan)

Dispatch a **general-purpose subagent** with this exact prompt:

> Review this implementation plan as someone who will have to build from it, alone, with no access to the conversation that produced it.
>
> PLAN:
> <paste the full plan>
>
> SOURCE REQUIREMENTS:
> <paste the source document>
>
> Check four things:
>
> 1. **Completeness** — is any step missing information an implementer needs? Does every step have a verification command and a concrete expected output?
> 2. **Alignment** — does the plan build what the source asks for, no more and no less?
> 3. **Task boundaries** — is any task too large for one session (more than 8 steps), or does any single task mix data, domain, and UI work that should be separate?
> 4. **Buildability** — can the tasks be executed in the written order, with each task's verification actually passing at that point? Name any task that depends on something a later task creates.
>
> CALIBRATION: flag only what would make an implementer build the wrong thing or get stuck. Wording, formatting, tone, and stylistic preferences are NOT issues — do not report them. If a section is fine, say so in one line and move on.
>
> For each issue: name the task number, state what an implementer would get wrong, and give the fix.

Apply what it returns. Report to the user only the issues you acted on.

## Step 5 — Handoff

1. Save the plan at the resolved path (create the directory if needed).
2. Append this closing section, verbatim, to the plan:

```markdown
## Execution

Work **one task at a time, in order.** Do not read ahead and batch tasks.

For each task:

1. Read the task's **Files** manifest before touching anything.
2. Run each step's verification command and compare the real output against the
   step's stated `Expected:` line. A mismatch means stop and diagnose — never
   edit the plan's expected output to match what you got.
3. Finish with the regression run: `npm run lint`, `npx tsc --noEmit`,
   `npm run build` — all three must exit 0.
4. Commit the task.
5. Update `plan.md` and the adjacent `log.txt` before starting the next task:
   tick the task's checkboxes, set `**Status:** In Progress` on the first
   completion, and append a log entry with Completed / Summary / Key Decisions /
   Deviations / Files Changed. Those two files are the resumption state for
   whoever picks this up cold.

Commit message format — Conventional Commits, scope is the feature number:

    feat(005): add expense form with trip-period validation

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: features/005.record-expense.md

Never commit on a failing lint, typecheck, or build.
```

3. Tell the user where the plan was saved and how many tasks it contains.

**Do not start executing tasks from inside this skill.** Producing the plan is the whole job; if the user wants it built, that is a separate request.

---

# Amending an existing plan

Triggered by "amend the plan", "add to the plan", "update the plan", "the requirements changed".

1. **Read `plan.md` and the adjacent `log.txt` first — both, fully, before editing anything.** `log.txt` is where deviations from the original plan are recorded; without it you will amend a plan that no longer matches the code.
2. **Preserve every completed `- [x]` task byte-for-byte.** Do not renumber, reword, reformat, or "tidy" them. They are the record of what was actually built.
3. **Append new tasks continuing the existing numbering.** If the plan ends at Task 7, the new work starts at Task 8.
4. **Add a dated amendment note to the header:**

```markdown
**Amended:** 2026-08-31 — added Tasks 8–10 to support multi-currency expense
entry, after the requirement to allow non-trip currencies was confirmed.
```

State what changed _and why_.

5. **Note any interaction** where a new task changes something an earlier task set up, inline in the new task:

```markdown
> Interaction: Task 9 changes the storage shape written by Task 2. Records
> already written in the Task 2 format must be migrated, not assumed absent.
```

6. **Re-run Pass A and Pass C.** Re-run **Pass B only if the amendment is itself architectural** (new module boundary, data-model change, storage-contract change, transactional boundary).

---

# Provenance

**Verified 2026-08-31** against this repository. Every claim above about this repo was checked by running one of these commands. Re-run them when something here stops matching reality.

| Claim                                                                              | Verification command                                                                | Observed                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack and versions                                                                 | `cat package.json`                                                                  | next 16.3.3, react 19.2.8, typescript ^5, tailwindcss ^4, eslint ^9                                                                                                                                                                                                                                                 |
| Lint command                                                                       | `npm run lint`                                                                      | exit 0, no output                                                                                                                                                                                                                                                                                                   |
| Typecheck command                                                                  | `npx tsc --noEmit`                                                                  | exit 0, no output                                                                                                                                                                                                                                                                                                   |
| Typecheck failure format                                                           | `npx tsc --noEmit` against a file importing a missing module, then a missing export | exit 2; `lib/__probe/probe.ts(1,31): error TS2307: Cannot find module '@/lib/__probe/missing' or its corresponding type declarations.` and `lib/__probe/probe.ts(1,10): error TS2305: Module '"@/lib/__probe/mod"' has no exported member 'parseInterval'.` (probe files removed after checking)                    |
| Build command                                                                      | `npm run build`                                                                     | exit 0, "Compiled successfully" then a route table (`/`, `/_not-found`)                                                                                                                                                                                                                                             |
| No test runner                                                                     | `cat package.json` (no `test` script); `ls node_modules/.bin`                       | only `eslint`, `next`, `tsc` — no jest, vitest, playwright, mocha, cypress                                                                                                                                                                                                                                          |
| Strict TypeScript, `@/*` alias                                                     | `cat tsconfig.json`                                                                 | `"strict": true`, `"paths": {"@/*": ["./*"]}`                                                                                                                                                                                                                                                                       |
| ESLint 9 flat config                                                               | `cat eslint.config.mjs`                                                             | `defineConfig([...nextVitals, ...nextTs, ...])`                                                                                                                                                                                                                                                                     |
| Existing source layout                                                             | `find app -type f`                                                                  | only `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/favicon.ico`                                                                                                                                                                                                                                         |
| Layer names (`lib/types.ts`, `lib/storage`, `lib/<domain>`, `components/`, `app/`) | `grep -rn 'lib/\|components/' doc/spec/ features/`                                  | the §2.4 module map in `doc/spec/005.record-expense.md` used exactly these paths. Note: `doc/spec/` is regenerated per feature and was empty again at the time of writing — re-derive from whatever spec documents exist when you re-check.                                                                         |
| No backend                                                                         | `sed -n '1,20p' features/OVERVIEW.md`                                               | "stores all data in browser local storage. It does not use a backend service, SQL database, or external database."                                                                                                                                                                                                  |
| Next.js docs location                                                              | `ls node_modules/next/dist/docs/`                                                   | `01-app`, `02-pages`, `03-architecture`, `04-community`, `index.md`                                                                                                                                                                                                                                                 |
| `doc/plans/` numbering starts at 001                                               | `ls -d doc/plans/[0-9][0-9][0-9]-*`                                                 | `No such file or directory` — `doc/plans/` does not exist                                                                                                                                                                                                                                                           |
| Commit convention                                                                  | `git log --oneline`                                                                 | **only one commit** (`d9e2702 Initial commit from Create Next App`) — no convention is derivable from history. The Conventional Commits format above is the convention this repo documents for itself in `CLAUDE.md`'s feature loop; treat it as documented, not observed, and re-check it once real commits exist. |
