---
name: feature-discovery
description: "Use when a requirement arrives as plain prose rather than a spec — a layman ask, a one-line feature request, a stakeholder sentence, 'users should be able to X', 'can we add Y' — and it needs impact analysis against this codebase, splitting into right-sized features, and Gherkin scenarios whose edge cases were brainstormed with the user rather than guessed. Also use when a request is too big for one feature file, or when adding any new features/NNN.*.md. Not for analysing a feature file that already exists — that is /feature-spec."
---

# /feature-discovery

Turns one plain-language requirement into the input the rest of the pipeline needs: an impact analysis, a decomposition into right-sized features, and — one invocation per feature — a `features/NNN.{slug}.md` whose Gherkin scenarios were **confirmed by the user**, not inferred.

This skill is **stage 0** of the workflow in [AGENTS.md](../../../AGENTS.md):

```
layman requirement -> /feature-discovery -> features/NNN.{slug}.md
                                         -> /feature-spec -> /writing-plans -> /sdd
```

It writes requirement documents and feature files. That is the entire deliverable.

## Usage

```
/feature-discovery "users should be able to split a bill with friends"   # Mode A — decompose
/feature-discovery 016                                                   # Mode B — author one feature
/feature-discovery                                                       # ask which
```

| Argument              | Mode                       | Deliverable                                              |
| --------------------- | -------------------------- | -------------------------------------------------------- |
| Prose (a phrase/para) | **A — Decompose**          | `doc/requirements/{YYYY-MM-DD}-{slug}.md`, then **stop**  |
| A bare `NNN`          | **B — Author** one feature | `features/NNN.{slug}.md` + index updates                 |
| None                  | —                          | Ask which mode; never guess                              |

Mode A never writes a feature file. Mode B never handles two features. A requirement that yields four features therefore costs one Mode A run and four Mode B runs — that separation is the point, not an inefficiency to optimise away.

## Hard rules

1. **No code.** No application code, no `package.json` change, no dependency, no commit. If the requirement seems trivial enough to just implement, that is still not this skill's job.
2. **One feature per Mode B invocation.** Inherited from `/feature-spec`: analysis quality collapses when several specs are held in context at once.
3. **No feature file until the user has confirmed the scenario list.** Not a summary of it — the list.
4. **No batch-reading `features/`.** Mode A may open at most **3 named existing feature files** it has identified as direct collisions. Everything else comes from `OVERVIEW.md`, `REFERENCE.md`, `git log`, and the real file tree.
5. **Every taxonomy category is closed explicitly** — with scenarios, or with `N/A — <reason>`. Skipping one silently is the failure this skill exists to prevent.
6. **Business language only in scenarios.** A `Scenario:` step never names a React component, hook, file path, library, CSS class, or storage key. Assert what the user sees or what survives a refresh.
7. **A conflict with `OVERVIEW.md` §2 or §3 stops the run and asks.** Standing context is not overridden silently.

## Mode A — impact analysis and decomposition

Six phases, each ending at a gate. A gate that fails does not advance.

| #   | Phase                | Gate              | Passes when                                                                                    |
| --- | -------------------- | ----------------- | ---------------------------------------------------------------------------------------------- |
| 0   | Intake               | **A0 Understood** | The user has confirmed a one-sentence restatement of the requirement                           |
| 1   | Impact analysis      | **A1 Verified**   | Every claim about existing code was checked against the tree; conflicts surfaced, not resolved |
| 2   | Vertical-slice split | **A2 Split**      | Every slice has one user goal and is independently demonstrable in the running app             |
| 3   | Sizing               | **A3 Sized**      | Every slice passes all four sizing tests, or was re-split until it does                        |
| 4   | Numbering & order    | **A4 Placed**     | Each slice has a free `NNN`, a slug, a build position, and a one-line rationale                |
| 5   | Approval & write     | **A5 Approved**   | The user approved the breakdown; the document is written; the run has stopped                  |

### Phase 0 — Intake (gate A0)

Restate the requirement in **one sentence** and ask whether that is what they mean. Do not analyse first. A misread requirement wastes every phase after it.

If the requirement is genuinely one small change to behaviour that already exists, say so and offer the alternative: amend the existing `features/NNN.*.md` instead of creating a new one. Creating a feature for a clause that belongs in an existing file fragments the acceptance criteria.

### Phase 1 — Impact analysis (gate A1)

Read, in this order — and stop as soon as you have what the analysis needs:

- `git log --oneline --grep="^feat("` — what is **actually built**, as opposed to specified.
- `features/OVERVIEW.md` §§1–4 — standing context, plus the §4 index, which gives you every existing feature's title without opening any of them.
- `REFERENCE.md` §4 (file layout) and §6 (cross-feature domain facts).
- The real tree: `git ls-files lib app components`.
- At most **3** existing `features/NNN.*.md` you have named as direct collisions.

Then produce:

- **Touched modules** — a table of existing files or directories this requirement reaches, each with the reason. Mark every row `read` or `write`.
- **New surface** — new storage keys, new `lib/<domain>/` boundaries, new routes, new components. A new storage key or module boundary is the strongest signal that a slice is its own feature.
- **Migration risk** — does existing persisted data need a shape change? Local storage has no migration framework here; say what happens to data already sitting in a browser.
- **Standing-context conflicts** — anything contradicting `OVERVIEW.md` §2 Confirmed Requirements or §3 Assumptions. **Surface these to the user and stop.** Do not pick a side.
- **What already covers part of this** — if a built feature already does some of it, say which part, so the decomposition does not re-specify it.

**Verify before you assert.** Marking a file "changed" when it does not exist, or claiming a dependency has landed when no `feat()` commit says so, sends the whole downstream chain after something that was never written. Check, then write what you found.

### Phase 2 — Vertical-slice split (gate A2)

Split by **user goal**, never by layer. Each slice must be a thing a user can do.

| Split this way                                                  | Not this way                                       |
| --------------------------------------------------------------- | -------------------------------------------------- |
| "Record who a bill is split with" / "See what each person owes" | "Add the split storage key" / "Build the split UI" |
| One CRUD step per slice, when each step is separately useful    | All of create+read+update+delete in one slice      |
| A read-only view separated from the editing flow                | A slice that only writes data nothing reads yet    |

A slice that produces no user-observable behaviour is not a feature — it is a task, and `/writing-plans` will create it from the feature that needs it. Never emit a "foundation" feature whose scenarios a user could not act out.

### Phase 3 — Sizing (gate A3)

Every slice passes **all four**:

1. **One primary user goal** — expressible as a single `As a … I want … So that …`.
2. **≤ ~7 scenarios estimated**, including the edge cases Mode B will find.
3. **Independently demonstrable** in the running app once built.
4. **At most one new storage key or module boundary.**

Fail any test → re-split. Two slices that each fail test 3 on their own usually want merging; one slice failing tests 2 and 4 wants splitting.

### Phase 4 — Numbering and build order (gate A4)

- `NNN` = next free number from `ls features/`, zero-padded, ascending across the new slices.
- Slug = kebab-case of the feature title.
- **Build position** — where each slice lands in the order table in [CLAUDE.md](../../../CLAUDE.md), with one line of why. Dependencies may only point at already-built features or lower-numbered new slices. A cycle means Phase 2 split wrongly.

Feature numbers are **spec/reading order**; build order is separate. State both.

### Phase 5 — Approval and write (gate A5)

Present the breakdown — one line per slice: number, title, user goal, scenario-count estimate, dependencies, build position. Get approval. Then write `doc/requirements/{YYYY-MM-DD}-{slug}.md` containing the confirmed restatement, the impact analysis, the slice table, the rejected splits and why, and the open questions.

Then **stop**, and print the next commands:

```
/feature-discovery 016    # Record who a bill is split with
/feature-discovery 017    # See what each person owes
```

Do not continue into Mode B in the same run, even if asked to "just keep going" — a sweep run against a context already full of decomposition reasoning is the shallow sweep this skill exists to avoid. Offer instead to stop here so the next run starts clean.

## Mode B — brainstorm and author one feature

| #   | Phase          | Gate             | Passes when                                                                         |
| --- | -------------- | ---------------- | ----------------------------------------------------------------------------------- |
| 0   | Load           | **B0 Loaded**    | The slice entry and standing context are loaded; no other raw feature file was read |
| 1   | Happy path     | **B1 Confirmed** | The user confirmed the goal and the primary scenario                                |
| 2   | Taxonomy sweep | **B2 Swept**     | All 10 categories closed with scenarios or `N/A — <reason>`                          |
| 3   | Draft review   | **B3 Reviewed**  | The user reviewed the full scenario list, in Gherkin, and approved it                |
| 4   | Write          | **B4 Written**   | `features/NNN.{slug}.md` matches the output recipe exactly                           |
| 5   | Index updates  | **B5 Indexed**   | `OVERVIEW.md` §4 and §2, `REFERENCE.md` §7, `CLAUDE.md` order table all updated      |

### Phase 0 — Load (gate B0)

Read the slice's entry in its `doc/requirements/` document, plus `features/OVERVIEW.md` §§1–3. If no decomposition document exists for this number, ask whether to run Mode A first — authoring a feature with no impact analysis behind it is guessing.

Do not open other `features/NNN.*.md`. If a neighbour is a dependency, read its `doc/features/<NNN>-<slug>/spec.md` if one exists; otherwise record the dependency as an assumption.

### Phase 1 — Happy path first (gate B1)

Present, and get confirmed, before touching edge cases:

- the one user goal, as `As a … I want … So that …`
- the **primary scenario** in Given/When/Then
- the data it reads and writes, in business terms

Edge cases brainstormed against an unconfirmed happy path get thrown away.

### Phase 2 — Taxonomy sweep (gate B2)

**The core of this skill.** Walk all ten categories in [references/EDGE-CASE-TAXONOMY.md](references/EDGE-CASE-TAXONOMY.md) — that file carries the candidate prompts, written for this app's local-storage / one-active-trip / fixed-rate / currency-code reality. Read it before sweeping.

| #   | Category                    | The question it forces                                            |
| --- | --------------------------- | ----------------------------------------------------------------- |
| 1   | Empty & zero state          | What shows before any data exists? Is zero different from absent? |
| 2   | Boundaries & precision      | Min, max, first, last, longest, rounding                          |
| 3   | Invalid & malformed input   | What can the user type that must be refused, and how?             |
| 4   | Duplicates & collisions     | Same name, same day, rename onto an existing name                 |
| 5   | State & lifecycle conflicts | No active trip, trip ended, referenced record deleted             |
| 6   | Persistence failure         | Quota exceeded, corrupt JSON, partial write, older shape          |
| 7   | Navigation & interruption   | Refresh, back, unsaved input, deep link to a deleted record       |
| 8   | Offline & time              | Offline after load, future dates, day boundaries, clock           |
| 9   | Presentation & scale        | Long lists, mobile vs desktop, a chart with 0 or 1 category       |
| 10  | Multi-actor & permissions   | Two tabs, two devices, anything shared                            |

For each category: propose **2–4 concrete candidates**, each phrased as a user-visible question, and ask the user to mark each **in scope / out of scope / defer**. Batch them — use multiple-choice questions, up to four candidates per round, rather than one message per candidate.

Propose candidates. Do not decide them. A candidate the user has not ruled on is not an answer, and "probably fine" is not a ruling.

Close every category. `N/A — this feature persists nothing, so there is no failure mode` is a perfectly good close; leaving category 6 unmentioned is not.

### Phase 3 — Draft review (gate B3)

Write the full Gherkin — happy path plus one `Scenario:` per in-scope edge case — and show it. Use `Scenario Outline` + `Examples` where behaviour varies only by data. Get explicit approval for the scenario list before writing anything into `features/`.

### Phase 4 — Write the file (gate B4)

The file is these parts, in this order, and nothing else:

1. `# Feature N: Title` — `N` unpadded, title in Title Case.
2. One fenced `gherkin` block: the `Feature:` line, the `As a / I want / So that` three-liner, then every `Scenario:` — happy path first, edge cases after, in taxonomy order.
3. `## Assumptions` — numbered. Anything decided during the sweep that the requirement did not state.
4. `## Out of Scope` — bulleted. What a reader would reasonably expect that this feature does not do.
5. `## Deferred` — bulleted. Deferred candidates, each with the reason it was deferred.

An empty section is written as `None.` — never deleted. A missing section reads as an unasked question. See [references/FEATURE-FILE-TEMPLATE.md](references/FEATURE-FILE-TEMPLATE.md) for the exact shape.

### Phase 5 — Index updates (gate B5)

Four edits, all required:

| File                      | Edit                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `features/OVERVIEW.md` §4 | Append the row: number, title, link to the new file                                                      |
| `features/OVERVIEW.md` §2 | Append decisions confirmed in the sweep that later features must inherit as standing context             |
| `REFERENCE.md` §7         | Update the build-order line so the new number appears in position                                        |
| `CLAUDE.md`               | Insert the row in the implementation-order table, with its "why it goes here"                            |

Append to §2 only what is genuinely standing context — a decision later features would otherwise re-litigate. Feature-local detail belongs in the feature file, not in §2.

Then report the path and print the handoff — never run it:

```
/feature-spec 016
```

## Rationalization table

| Excuse                                                      | Reality                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| "This requirement is small, one feature file is fine"       | Run the sizing tests. If it passes all four as one slice, Mode A says so in one line and you have lost nothing.                    |
| "I can decompose and write all four files in this run"      | Rule 2. The fourth sweep on a full context is the shallow sweep this skill exists to prevent.                                      |
| "The edge cases are obvious, I'll write them in"            | The user's app, the user's call. Propose; let them rule.                                                                            |
| "Category 6 doesn't really apply here"                      | Then write `N/A — <reason>`. That takes four words and is auditable.                                                                |
| "The user said just write it"                               | Confirm the scenario list first — it is one message. Then write it.                                                                 |
| "I'll note the storage key in the scenario so it's clear"   | Rule 6. Storage keys are `/feature-spec` output, not acceptance criteria.                                                            |
| "This conflicts with OVERVIEW §2, but my version is better" | Rule 7. Surface it and stop. Changing standing context is the user's decision.                                                       |
| "It's faster to implement this than to specify it"          | Rule 1. This skill's output is the specification.                                                                                    |

## Red flags — stop

- About to write `features/NNN.*.md` without an approved scenario list
- About to open a fourth existing feature file
- A taxonomy category with no scenarios and no `N/A` line
- A proposed slice whose scenarios a user could not act out in the app
- A `Scenario:` step containing a file path, component name, hook, or storage key
- Continuing from Mode A into Mode B in one run
- Writing app code, installing anything, or committing

## Common mistakes

- **Layer slices.** "Add the data model" is a plan task, not a feature. Split by what the user can do.
- **Sweeping before confirming the happy path.** Everything after it gets rewritten.
- **One mega-scenario.** A scenario asserting three independent things cannot fail informatively — split it.
- **Padding a thin feature.** Three genuine scenarios beat nine ceremonial ones; `/feature-spec` has a thin-feature shortcut for exactly this case.
- **Numbering by build order.** Numbers are reading order. Build position is a separate field.
- **Silently answering your own questions.** The value here is the user's ruling, not your guess.
