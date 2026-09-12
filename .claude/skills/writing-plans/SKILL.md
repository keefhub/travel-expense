---
name: writing-plans
description: "Turn a feature spec, ticket, or freeform requirement into a numbered, task-by-task implementation plan saved as plan.md, with a Files manifest and a literal verification command plus its exact expected output on every step. Use when asked to write a plan, plan a feature, plan an implementation, break work into tasks, create a task breakdown, produce an implementation plan for a features/NNN.*.md or doc/features/*/spec.md file, or amend/extend/update an existing plan. Also use before starting any multi-file change in this Next.js App Router repo, where data (lib/storage), domain (lib/*), component, and route work must land as separate tasks. Do NOT use to write product requirements, business analysis, acceptance criteria, or Gherkin specs — those are authored under features/ and doc/features/ and are the input to this skill, not its output. Do NOT use to execute a plan; this skill stops at a saved plan."
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

- `<skill-root>/references/PLAN-TEMPLATES.md` — plan header, contract task template, Playwright task template, refactor task template
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
| **Test framework** | **No unit-test runner** — do not write plan steps invoking `jest`, `vitest`, or `npm test`. `@playwright/test` **is** installed; behavior a compiler cannot see is verified by a spec in `e2e/`, run as `npx playwright test e2e/<spec>.spec.ts`. See _Contract steps, verified by the compiler_ and _Behavior the compiler cannot see_ below. |
| Path alias         | `@/*` maps to the repo root (`tsconfig.json`)                                                                                                                                                                                                                                            |
| Backend            | None. Data lives in browser local storage; there is no API layer, server, or database.                                                                                                                                                                                                   |

> **Where repo facts live:** `.claude/repo-profile.md` is the source for verification commands and
> when each applies, the behavioral gate, layer slices, known-dirty paths, and gate risk tiers —
> read it rather than trusting a copy. Orientation for subagents is the core packet at
> `memories/repo/travel-expense-context.md` plus one slice from `memories/repo/slices/`; re-read the
> raw `REFERENCE.md`/`OVERVIEW.md`/`design.md` only when a task modifies them.

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

1. **An explicit path** in the request (`features/005.record-expense.md`, `doc/features/005-record-expense/spec.md`, a ticket file). Use it.
2. **A requirement or ticket ID** (`005`, `feature 12`). Resolve it: `ls features/ doc/features/ | grep -i <id>`. If it matches more than one file, ask which.
3. **Freeform requirements stated in the conversation.** Use them, and quote them verbatim into the plan's Source field so the plan carries its own source.
4. **Nothing usable** → ask the user what to plan. Do not invent a requirement.

## Where the plan is saved

Every feature owns one folder: `doc/features/<NNN>-<slug>/`, holding `spec.md` (from
`/feature-spec`), `plan.md` (from this skill), and `log.txt` (from `/sdd`). See
[`doc/README.md`](../../../doc/README.md).

- **The feature has a number** (`features/005.record-expense.md`, or an existing
  `doc/features/005-record-expense/spec.md`) → the plan goes to
  `doc/features/005-record-expense/plan.md`. `<NNN>` and `<slug>` come from the feature filename;
  never invent a new number for an existing feature.
- **Pipeline or tooling work, not a product feature** → `doc/workflow/<slug>.plan.md`, beside its
  design document.
- **Neither** (a freeform request with no feature file) → `doc/features/<NNN>-<slug>/plan.md` with
  the next unused number. Compute it with plain shell — no helper script:

```bash
last=$(ls -d doc/features/[0-9][0-9][0-9]-* 2>/dev/null | sed 's#.*/##' | grep -oE '^[0-9]{3}' | sort -n | tail -1)
printf '%03d
' $(( 10#${last:-000} + 1 ))
```

Before writing, confirm the number is free — `ls -d doc/features/<NNN>-* 2>/dev/null` must print
nothing. If it prints a directory, that number is taken: increment and re-check rather than
overwriting an existing plan.

`log.txt` (see `PLAN-MAINTENANCE.md`) always sits next to `plan.md`. `PROGRESS.md` also lands there
but is git-ignored — it is run state, and progress is derived from `git log`.

---

# Workflow

## Step 1 — Validate

Before decomposing, write out — in your reply, not just internally:

1. The requirement in **1–2 sentences**.
2. Every **negative constraint**, restated explicitly: `Note: will NOT touch the public API`, `Note: will NOT modify the existing storage key format`, `Note: does NOT add edit or delete for expenses`. Scope sections in the source documents (`features/*.md`, `doc/features/*/spec.md` — "Out of scope") are the first place to look for these.
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

## Step 3 — Contract steps and their verification

**Every step carries literal code or an exact command, AND its exact expected output.** Not "verify it works" — the output string an implementer compares against:

```
Expected: 1 test failed — parseInterval is not defined
```

**Banned as steps:** "Add tests", "handle edge cases", "polish", "wire it up", "make sure it works". Each hides an unspecified amount of work and gives the implementer nothing to compare against.

### Contract steps, verified by the compiler

**A plan states contracts, not function bodies.** For each file a task touches, give the exported
signature, the behavior, the edge cases, the negative constraints, and the verification command —
then let the implementer write the code. A plan that carries the finished source makes the
implementer a transcription step and leaves the review gates reviewing code the plan's author
wrote, which is not independent review.

The reference shape:

```
File: components/AddCategoryModal.tsx  (create, 'use client')
Exports: default ({ onAdded, onCancel }: { onAdded: (name: string) => void;
         onCancel: () => void }) => JSX.Element
Behavior: form submit -> addCategory(name); on !ok map reason
          duplicate|storage|blank to an inline role="alert"; on ok onAdded(name.trim())
Constraints: z-50 (paints above the fixed BottomNav); must not modify lib/categories.ts
Verify: npx tsc --noEmit && npm run lint   -> exit 0, no output
```

Give literal code only where exactness is the point and prose would be ambiguous — a regex, a
formula, a specific Next.js API call with a known gotcha.

**Keep the red→green loop.** This repo has no unit-test runner, so the compiler is the red signal,
and it is a real one — `TS2305` asserts that *a named export with a declared shape* is missing, not
merely that a file is absent. Since the contract above is the plan's whole payload, this is the one
mechanical check that an implementation matches it:

1. **Write the call site first** — the code that consumes the thing you are about to write.
2. **Run `npx tsc --noEmit` and expect a specific, quoted failure.** Both formats below were
   produced by this repo:

```
Expected: exit 2, error TS2305 on lib/expenses/validateExpense.ts —
Module '"@/lib/types"' has no exported member 'ExpenseFormValues'.
```

```
Expected: exit 2, error TS2307 on app/expenses/new/page.tsx —
Cannot find module '@/lib/expenses/validateExpense' or its corresponding type declarations.
```

**Match on the error code and message, never on the column number.** Predicting columns (the old
`14 + length(<Name>)` formula) bought nothing and broke plans over cosmetic drift. Do **not** create
throwaway `*.probe.tsx` or `lib/__probe/` files whose only purpose is to be deleted — put the red
step in the real consuming file.

3. **Write the minimal implementation** — enough to satisfy that error and nothing more.
4. **Re-run `npx tsc --noEmit`.** `Expected: exit 0, no output.`
5. **Regression run:** the commands `.claude/repo-profile.md` § Verification commands lists for this
   task. `npx tsc --noEmit` and `npm run lint` always; `npm run build` **only** when the task touches
   routes, config, or dependencies.

### Behavior the compiler cannot see

A warning banner, a redirect, a chart, a responsive layout — verified by a **Playwright spec**, never
by a manual browser checklist. A checklist nobody runs is an unverified claim, and this app is
entirely client-rendered from `localStorage`, so that is most of its behavior.

```
- Write `e2e/011-unsaved-warning.spec.ts` covering: a dirty form warns on
  in-app navigation; a clean form does not.
  `npx playwright test e2e/011-unsaved-warning.spec.ts`
  Expected: exit 0, `2 passed`.
```

Scope the command to the spec file, not the whole suite — a whole-suite count breaks the moment
another feature adds a test. See `.claude/repo-profile.md` § Behavioral gate for the two traps specs
hit in this repo (seeding `localStorage` before first render, and Next.js's own `role="alert"`).

"Open the page and check it looks right" is not a verification step.

### Refactor template

For **mechanical, behavior-preserving changes only** — a rename, a file move, an extraction with no logic change. It replaces the red step with a build verification: apply change → `npm run lint && npx tsc --noEmit && npm run build` → commit. The full template is in `<skill-root>/references/PLAN-TEMPLATES.md`.

**When in doubt, use the contract template.** If the change alters _any_ observable behavior, it is not a refactor.

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
| No unit-test runner; Playwright installed (re-verified 2026-09-12)                 | `cat package.json`; `npx playwright --version`                                      | no `jest`/`vitest`/`mocha`/`cypress` and no unit `test` script; `@playwright/test` present with a `test:e2e` script, `Version 1.63.0`. Note `npx <pkg>` **cannot** prove a package absent — it installs one to answer the query; check `package.json` and `node_modules/.bin` instead.                              |
| Strict TypeScript, `@/*` alias                                                     | `cat tsconfig.json`                                                                 | `"strict": true`, `"paths": {"@/*": ["./*"]}`                                                                                                                                                                                                                                                                       |
| ESLint 9 flat config                                                               | `cat eslint.config.mjs`                                                             | `defineConfig([...nextVitals, ...nextTs, ...])`                                                                                                                                                                                                                                                                     |
| Existing source layout                                                             | `find app -type f`                                                                  | only `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/favicon.ico`                                                                                                                                                                                                                                         |
| Layer names (`lib/types.ts`, `lib/storage`, `lib/<domain>`, `components/`, `app/`) | `grep -rn 'lib/\|components/' doc/features/ features/`                                  | the §2.4 module map in `doc/features/005-record-expense/spec.md` used exactly these paths. Re-derive from whatever spec documents exist under `doc/features/` when you re-check.                                                                         |
| No backend                                                                         | `sed -n '1,20p' features/OVERVIEW.md`                                               | "stores all data in browser local storage. It does not use a backend service, SQL database, or external database."                                                                                                                                                                                                  |
| Next.js docs location                                                              | `ls node_modules/next/dist/docs/`                                                   | `01-app`, `02-pages`, `03-architecture`, `04-community`, `index.md`                                                                                                                                                                                                                                                 |
| Feature docs live one folder per feature (verified 2026-09-12)                     | `ls doc/features/`                                                                  | `<NNN>-<slug>/` directories, each holding `spec.md`, `plan.md`, `log.txt`. `PROGRESS.md` is git-ignored. The former flat `doc/spec/NNN.name.{md,plan.md,log.txt}` layout is gone.                                                                                                                                    |
| Commit convention                                                                  | `git log --oneline`                                                                 | **only one commit** (`d9e2702 Initial commit from Create Next App`) — no convention is derivable from history. The Conventional Commits format above is the convention this repo documents for itself in `CLAUDE.md`'s feature loop; treat it as documented, not observed, and re-check it once real commits exist. |
