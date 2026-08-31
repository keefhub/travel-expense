# Plan maintenance

How `plan.md` and its adjacent `log.txt` are kept current **while the plan is being executed**.

**`plan.md` and `log.txt` are the resumption state.** Someone picking this work up cold — a different engineer, a new session with no conversation history — should be able to read those two files and know exactly what is done, what is next, and what changed along the way. Nothing else carries that. Keep them accurate at every task boundary, not at the end.

A diff can reconstruct *what* changed. It cannot reconstruct **Key Decisions** and **Deviations** — why one approach was taken over another, and where reality forced a departure from the plan. Those two lines are the entire reason `log.txt` exists; write them properly or the log is worthless.

---

## After each task

Do all three, before starting the next task:

### 1. Tick the checkboxes

Every step of the completed task goes from `- [ ]` to `- [x]`, and so does the task heading if it carries one. Tick only what is actually done — a half-ticked task is more useful than an optimistically full one.

### 2. Set the Status

On the **first** task completion, change the header:

```markdown
**Status:** In Progress
```

Leave it there until the final task, then set `**Status:** Complete` and add the Completion Summary (below).

### 3. Append to `log.txt`

`log.txt` lives beside `plan.md` and is **append-only** — never edit or delete an existing entry, even a wrong one. Correct it with a new entry that says what was wrong.

```
=====================================================================
Task 3: [Domain] — validateExpense rejects a non-positive amount
Completed: 2026-08-31

Summary:
  Added ExpenseFormValues and ValidationResult to lib/types.ts and
  implemented lib/expenses/validateExpense.ts. Amount validation only;
  the remaining field rules land in Task 4.

Key Decisions:
  - validateExpense takes no clock parameter. Future-dated expenses are
    valid per the spec, so "today" is not an input to validation; adding
    it later would be a new business rule, not an implementation detail.
  - Errors and warnings are returned as separate maps so a caller cannot
    accidentally treat a non-blocking warning as a blocking error.

Deviations:
  - Plan said "modify lib/types.ts". lib/types.ts did not exist yet
    (Task 1 created lib/storage/types.ts instead), so it was created here.
    Task 5's Files manifest should read "modify", not "create".

Files Changed:
  - lib/types.ts (created)
  - lib/expenses/validateExpense.ts (created)

Verification:
  npm run lint       exit 0, no output
  npx tsc --noEmit   exit 0, no output
  npm run build      exit 0, route table unchanged
=====================================================================
```

Field rules:

- **Completed** — the date, `YYYY-MM-DD`.
- **Summary** — 1–3 sentences on what actually landed. Not the task title again.
- **Key Decisions** — every choice that a future reader could not infer from the code. A decision *not* to do something counts. If there genuinely were none, write `None.` — do not leave the heading off.
- **Deviations** — anything that differed from the plan as written: an extra file, a different name, a step that turned out unnecessary, a verification whose real output differed from the `Expected:` line. **If the plan was wrong, fix the plan too** (see below) and record that here. `None.` if there were none.
- **Files Changed** — every path, marked created / modified / deleted.
- **Verification** — the commands run and their real results.

---

## When the plan itself turns out to be wrong

Plans meet reality and lose. That is expected; hiding it is not.

**Superseded steps are struck through, never deleted:**

```markdown
- [x] ~~Step 4 — Add the migration guard to lib/storage/read.ts.~~
      Superseded by Task 7: no records exist in the old format, so no
      migration is needed. See log.txt, Task 4.
```

The strikethrough plus a one-line reason keeps the plan honest about the path taken. Deleting the step makes the log reference an entry that no longer exists, and makes a reader wonder whether the work was skipped or forgotten.

The same applies to a task made obsolete mid-flight: strike its steps, add the reason, and log it as a Deviation. Do not renumber the remaining tasks — task numbers are referenced from `log.txt` and from commit messages, and renumbering silently breaks both.

---

## At the end

When the final task is done, set `**Status:** Complete` and append this block to the end of `plan.md`:

```markdown
## Completion Summary

**Completed:** 2026-08-31
**Tasks:** 7 of 7

**What was built:**
The record-expense route, its form component, pure validation and expense
construction in `lib/expenses/`, and the guarded append call in
`lib/storage/`. Expenses save against the active trip and appear on the
dashboard.

**Deviations from the plan:**
- `lib/types.ts` was created in Task 3 rather than Task 1 (log.txt, Task 3).
- The Task 4 migration guard was dropped as unnecessary (log.txt, Task 4).

**Follow-ups not in scope here:**
- Editing and deleting a saved expense — not in the source spec.

**Final verification:**
npm run lint      exit 0, no output
npx tsc --noEmit  exit 0, no output
npm run build     exit 0
```

**Follow-ups not in scope here** is a list, not a promise: record what was noticed and deliberately left, so the next person does not re-discover it. Do not implement anything from it under this plan.
