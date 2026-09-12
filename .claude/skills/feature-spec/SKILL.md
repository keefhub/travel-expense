---
name: feature-spec
description: "Analyze ONE feature spec and produce a gated BA analysis, technical specification, BDD acceptance criteria, unit-test mapping, AC verification matrix, and contrarian review, written to doc/spec/{feature-name}.md. Two roles collaborate: Business Analyst (BA) and Solution Architect (SA), with a pass/fail gate between every phase. Use for feature analysis, acceptance-criteria verification, BDD generation, or specification creation. Processes exactly one feature per invocation — never batch-reads features/."
---

# /feature-spec

Turns one `features/NNN.{feature-name}.md` Gherkin spec into a reviewed, traceable design document at `doc/spec/{feature-name}.md`, ready for the implementation loop in [CLAUDE.md](../../../CLAUDE.md) to build against.

This skill **analyzes and documents**. It does not write application code, install packages, or commit. Producing the spec file is the whole deliverable.

## Usage

```
/feature-spec 005                    # target features/005.*.md
/feature-spec 005.record-expense     # same, explicit
/feature-spec                        # infer from conversation; ask if ambiguous
```

## Hard rule — one feature per invocation

**Load exactly one feature file per run.** This is the constraint the skill exists to enforce; analysis quality collapses when fifteen specs are held in context at once and cross-contaminate each other's requirements.

- Do **not** `cat features/*.md`, glob-read the directory, or open a second `features/NNN.*.md` "for context."
- The only other spec input allowed is **`features/OVERVIEW.md` sections 1–3** (Product Overview, Confirmed Requirements, Assumptions to Confirm) — the standing context every feature assumes. Read those sections only; skip section 4, which is just the file index.
- If a neighbouring feature is genuinely a dependency, read **its already-written `doc/spec/` file** if one exists. If it doesn't, do not open the raw feature file — record the dependency as an assumption in Open Questions and move on.
- If the user asks for several features, or for "all of them," run this skill once per feature **sequentially**: complete and write one spec file, report it, then start the next. Never merge two features into one document or one analysis pass.

## Thin-feature shortcut

A feature file with **≤2 Gherkin scenarios and no new storage key or module boundary** does not
need a full `doc/spec/` document — the feature file itself is the plan's input. For such a feature,
emit only a short handoff note (purpose, the ≤2 business rules, and a one-line module map) and let
the caller proceed straight to `/writing-plans` with the feature file as the source. Do not pad a
thin feature into a 300-line document; `writing-plans` and `/sdd` carry the traceability for these.

Do **not** apply the shortcut to features that introduce a new storage key, a new module boundary
(e.g. a new `lib/<domain>/`), or a storage-contract change — those always get the full treatment.

## Roles

Two roles produce the document. Every phase is owned by one of them, and each writes in that role's voice. Keep them genuinely separate — the value of the pairing comes from the SA being able to reject the BA's ambiguity, and the BA being able to reject the SA's scope creep.

| Role                        | Owns                                                                                             | Speaks in terms of                                              | Must never                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------- |
| **BA** — Business Analyst   | Phase 1 (business analysis), Phase 3 (BDD acceptance criteria), Phase 5 (AC verification matrix) | user goals, business rules, states, edge cases, acceptance      | name a React component, hook, file path, or library     |
| **SA** — Solution Architect | Phase 2 (technical specification), Phase 4 (unit-test mapping)                                   | data model, module boundaries, state, validation, errors, tests | introduce behaviour the BA did not derive from the spec |

Phase 6 is adversarial: **each role reviews the other's artifacts**, not its own.

## Phases and gates

Run in order. Each phase ends at a gate. **A gate that fails does not advance** — fix that phase's output and re-check, up to 2 revision passes per gate. If a gate still fails after 2 revisions, stop escalating: write the unresolved item into **Open Questions & Risks** in the output document, mark the gate `PASSED WITH OPEN ITEMS`, and continue. Never mark a gate passed when it isn't; never invent an answer to make a gate pass.

| #   | Phase                   | Role  | Gate                | Gate passes when                                                                                                                       |
| --- | ----------------------- | ----- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Scope & inputs          | —     | **G0 Scope**        | Exactly one feature file resolved; OVERVIEW §1–3 read; output path decided                                                             |
| 1   | Business analysis       | BA    | **G1 Business**     | Every Gherkin scenario maps to ≥1 numbered business rule; every rule traces to spec text or a listed assumption                        |
| 2   | Technical specification | SA    | **G2 Design**       | Every business rule from G1 has a design element that satisfies it; no design element exists without a rule                            |
| 3   | BDD acceptance criteria | BA    | **G3 Acceptance**   | Every AC is atomic, observable, and Given/When/Then-shaped; every original scenario is covered; no AC asserts an implementation detail |
| 4   | Unit-test mapping       | SA    | **G4 Test**         | Every AC has ≥1 named test with a stated assertion; every test names the module it exercises                                           |
| 5   | AC verification matrix  | BA    | **G5 Traceability** | Zero rows with an empty Rule, Design, or Test cell; no orphans in either direction                                                     |
| 6   | Contrarian review       | BA↔SA | **G6 Challenge**    | ≥3 substantive challenges raised, each resolved as Accepted / Rejected-with-reason / Open                                              |

### Phase 0 — Scope & inputs (gate G0)

1. Resolve the argument to exactly one `features/NNN.{feature-name}.md`. If no argument was given and the conversation is ambiguous, **ask** — analysing the wrong feature wastes the whole run.
2. Read that one file.
3. Read `features/OVERVIEW.md` sections 1–3 only.
4. Set `{feature-name}` to the spec filename without extension (e.g. `005.record-expense`). Output path is `doc/spec/{feature-name}.md`.
5. If `doc/spec/{feature-name}.md` already exists, read it and treat this run as a **revision** — preserve resolved Open Questions and prior contrarian outcomes rather than regenerating them from scratch.
6. Check `package.json` for a test runner (`vitest`, `jest`, `node --test`, …). Whatever you find — including nothing — is what Phase 4 writes against; state it explicitly in the document. Do not add a test dependency.

### Phase 1 — Business analysis (BA, gate G1)

Extract what the feature must _do_ and _why_, independent of how. Produce:

- **Purpose** — one paragraph: the user problem and the outcome.
- **Actors & preconditions** — who acts, and what must already be true (an active trip? existing categories?).
- **Business rules** — numbered `BR-{NNN}-01…`. Each rule is a single testable statement with a **Source** column citing either the Gherkin line it came from or the OVERVIEW bullet / assumption number. A rule with no source is a guess — either find the source or move it to Open Questions.
- **Data touched** — the entities this feature reads and writes, in business terms.
- **Edge cases & negative paths** — including ones the Gherkin _doesn't_ state but the rules imply (empty state, boundary dates, storage full, zero expenses). Flag each `[in spec]` or `[derived]`.
- **Out of scope** — what a reader might reasonably expect that this feature explicitly does not cover.

### Phase 2 — Technical specification (SA, gate G2)

Design against the Phase 1 rules only. Produce:

- **Approach** — 3–6 sentences on the shape of the solution and why.
- **Design elements** — numbered `TS-{NNN}-01…`, each citing the `BR-` it satisfies. Cover routes/pages, components, state ownership, storage keys and shapes, pure helper functions, validation, and error handling.
- **Data model** — concrete TypeScript types/interfaces for anything persisted or passed between modules.
- **Module map** — a table of files this feature will add or change, each with a one-line responsibility.
- **Dependencies** — earlier features this builds on, and what it assumes they already provide.
- **Non-functional notes** — mobile-first layout, offline behaviour, local-storage failure modes, anything relevant from OVERVIEW §2.
- **Next.js check** — if the design touches a Next.js API you are not certain of in this version, read the relevant guide under `node_modules/next/dist/docs/` per [AGENTS.md](../../../AGENTS.md) and note what you confirmed. This repo's Next.js differs from training data.

**Verify every claim about existing code before you write it.** Before annotating a file as _changed_ rather than _added_, before writing "extend the existing X", and before saying a dependency has landed, open the tree and check: `git ls-files`, `git log --oneline`, and a look at the actual directory. Then state what you found. A module map that marks a non-existent file "change" sends an implementer looking for something that was never written, and a dependency list that says "assumes N features have landed" is a claim about the repository, not about the spec — it is either verified or it is a guess. Where something genuinely does not exist yet, say so explicitly and say whether that blocks implementation. The same discipline applies to framework behaviour: cite the vendored doc and line you actually read, not what you remember.

### Phase 3 — BDD acceptance criteria (BA, gate G3)

Rewrite and _complete_ the feature's Gherkin as verification-ready criteria. Produce:

- A `gherkin` block of scenarios, each preceded by an ID comment `# AC-{NNN}-01`.
- Every original scenario preserved in meaning — tighten vague wording, and split any scenario asserting two independent things.
- New scenarios for the `[derived]` edge cases from Phase 1.
- `Scenario Outline` + `Examples` where the same behaviour varies only by data (validation ranges, currency codes).
- Every step observable from outside the implementation: assert what the user sees or what is persisted, never "the `useTrip` hook returns…".

### Phase 4 — Unit-test mapping (SA, gate G4)

Map acceptance to executable checks. Produce a table:

| Test ID | AC ID | Type | Target module | Test name | Assertion |
| ------- | ----- | ---- | ------------- | --------- | --------- |

- IDs are `UT-{NNN}-01…`. Type is `unit` / `component` / `integration`.
- Test name is the sentence that would go inside `it(...)`, not a label.
- Assertion states the concrete expected value or observable effect.
- An AC needing more than one test gets more than one row; say so rather than collapsing them.
- Add a short note listing the test file paths this implies, and — if no runner is installed — state plainly that these are planned tests and no runner exists yet.

**Every test must be able to fail.** When a row guards a specific bug, pick probe values at which that bug actually manifests, and check the arithmetic. A timezone test whose clock instant makes the local and UTC dates identical passes against the broken implementation it was written to catch — and a test that certifies its own bug as fixed is worse than no test at all. Where the failure is boundary-shaped, probe the boundary itself, not a value one step away from it.

### Phase 5 — AC verification matrix (BA, gate G5)

The traceability artifact. One row per AC:

| AC ID | Business rule(s) | Design element(s) | Test(s) | Status |
| ----- | ---------------- | ----------------- | ------- | ------ |

`Status` is `Specified` — this document is the deliverable, not an implementation. Below the table, list explicitly:

- **Orphan rules** — `BR-` clauses with no AC.
- **Orphan design** — `TS-` ids with no AC (usually scope creep; challenge it in Phase 6).
- **Uncovered scenarios** — original Gherkin scenarios that no AC covers.
- **Uncovered edge cases** — `[derived]` cases from Phase 1 that no AC covers, each with the reason.

All four lists empty is the gate. Non-empty and unresolvable after 2 passes moves to Open Questions.

**Count obligations, not identifiers.** A rule that says three things — "each expense is uniquely identifiable, is bound to the trip, and records the category name" — is three clauses, and an AC exercising one of them does not cover the rule. Trace `BR-{NNN}-20a/b/c` separately when a rule is compound. Checking that every ID appears _somewhere_ in the matrix produces a clean report over untested behaviour, which is the failure this gate exists to catch.

### Phase 6 — Contrarian review (BA ↔ SA, gate G6)

Attack the document. This is not a summary — a review that finds nothing wrong has failed the gate.

- **SA challenges the BA's** rules and ACs: ambiguity, untestable wording, a missing negative path, a rule that contradicts OVERVIEW, an assumption dressed up as a requirement.
- **BA challenges the SA's** design and tests: scope creep beyond the spec, over-engineering, a design element no rule asked for, a test that asserts implementation shape, a validation rule the business never stated.
- At least 3 substantive challenges, each recorded as:

| #   | Raised by | Challenge | Resolution | Outcome |
| --- | --------- | --------- | ---------- | ------- |

`Outcome` is `Accepted` (the document was changed — say what changed), `Rejected` (with the reason it doesn't hold), or `Open` (moved to Open Questions, with what would settle it).

Nit-picking wording is not a challenge. Aim at things that would cause the wrong software to be built.

## Output document template

Write `doc/spec/{feature-name}.md`, creating `doc/spec/` if needed. Use this structure:

```markdown
# {NNN}. {Feature Title} — Feature Specification

> Generated by `/feature-spec`. Source of truth: [features/{feature-name}.md](../../features/{feature-name}.md)

|                  |                                 |
| ---------------- | ------------------------------- |
| Feature          | {NNN} — {title}                 |
| Spec source      | `features/{feature-name}.md`    |
| Standing context | `features/OVERVIEW.md` §1–3     |
| Test runner      | {detected, or "none installed"} |
| Date             | {ISO date}                      |

## Gate summary

| Gate            | Phase                   | Role  | Result |
| --------------- | ----------------------- | ----- | ------ |
| G0 Scope        | Scope & inputs          | —     | PASSED |
| G1 Business     | Business analysis       | BA    | PASSED |
| G2 Design       | Technical specification | SA    | PASSED |
| G3 Acceptance   | BDD acceptance criteria | BA    | PASSED |
| G4 Test         | Unit-test mapping       | SA    | PASSED |
| G5 Traceability | AC verification matrix  | BA    | PASSED |
| G6 Challenge    | Contrarian review       | BA↔SA | PASSED |

_(Use `PASSED WITH OPEN ITEMS` where applicable, linking to Open Questions.)_

## 1. Business analysis — BA

### 1.1 Purpose

### 1.2 Actors & preconditions

### 1.3 Business rules

### 1.4 Data touched

### 1.5 Edge cases & negative paths

### 1.6 Out of scope

## 2. Technical specification — SA

### 2.1 Approach

### 2.2 Design elements

### 2.3 Data model

### 2.4 Module map

### 2.5 Dependencies

### 2.6 Non-functional notes

## 3. BDD acceptance criteria — BA

## 4. Unit-test mapping — SA

## 5. AC verification matrix — BA

## 6. Contrarian review — BA ↔ SA

## 7. Open questions & risks

## 8. Implementation checklist
```

Section 8 is a short ordered list an implementer can work straight down, each item referencing its `TS-` id.

## Rules for the writing itself

- **Trace or omit.** Every rule, design element, and AC either cites its source or lives in Open Questions. Unsourced confidence is the failure mode this skill exists to prevent.
- **Respect the spec's boundaries.** Do not design features the Gherkin doesn't ask for. If the feature is thin, the document is short — padding it is worse than brevity.
- **Label assumptions.** OVERVIEW §3 items are unconfirmed by definition; when you rely on one, say which number.
- **No implementation code.** Type definitions and function signatures are specification. Component bodies are not — those belong to the implementation loop.
- **Don't touch `features/`.** The Gherkin specs are the input and stay unmodified.

## Reporting back

After writing the file, report: the output path, the gate result (e.g. `7/7 passed`, or which gates carry open items), the counts (`BR` / `TS` / `AC` / `UT`), and any Open Questions the user needs to answer. If any gate carries open items, lead with that — it is the part the user has to act on.

## After this skill

Phase 6 is a self-review, and a self-review clears itself more readily than it should. To harden a document this skill produced, run [`/spec-review`](../spec-review/SKILL.md) on it — three isolated legs against a frozen packet, one of which verifies every claim against the real codebase. That skill reviews; this one writes.
