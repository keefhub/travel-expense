# AI Workflow Cost Optimization — Implementation Plan

**Status:** In Progress
**Source:** `docs/superpowers/specs/2026-09-12-ai-workflow-optimization-design.md`
**Goal:** Cut per-feature token and wall-clock cost of the
`/feature-spec` → `/writing-plans` → `/sdd` pipeline by roughly 40%, while making UI behavior
machine-verifiable for the first time and making review gates independent of the code they review.

**Revised:** 2026-09-12 — after Passes A.5/B/C. Every `grep` assertion below was re-run against the
real tree; four in the first draft were unreachable or targeted text that does not exist. The
compiler red step is now **kept** (see Task 6), reversing the first draft and design §3.

**Architecture:**
Three changes stack in dependency order. First, Playwright becomes a proven capability — nothing
references it until a spec actually passes. Second, repo-specific facts move into
`.claude/repo-profile.md` and a sliced context packet, cutting the per-dispatch payload from
12,255 bytes to core+slice (~4.5-5.5 KB); the skills **cite** that profile rather than inlining it. Third, the three skills are edited surgically to consume those artifacts.

**Tech Stack:** Next.js 16.3.3 (App Router), React 19.2.8, TypeScript 5 (`strict`), Tailwind CSS 4.
Data: browser local storage — no backend. Verification: `npm run lint`, `npx tsc --noEmit`,
`npm run build`, and — from Task 1 onward — `npx playwright test`.

> **Execution constraint.** Tasks 5–10 edit the skills that would execute this plan. Run this plan
> **directly, not through `/sdd`**, and treat every skill edit as taking effect on the *next*
> invocation, not the current one. See the design doc's Validation section.

> **Layer tags** here are `[Meta]`, `[Tooling]`, `[Config]`, `[Skill]`, `[Docs]` rather than
> `Types/Data/Domain/UI/Route`, because no task touches `app/`, `lib/`, or `components/`. `/sdd`
> permits an adapted heading shape. Task 4 defines what such tags receive as context.

> **Verification without a compiler.** Most tasks edit Markdown. Their red→green loop runs through
> `grep -c` with exact counts, **all re-measured against the tree on 2026-09-12**. Where a count is
> case-sensitive it is written `grep -c`; where the distinction matters it is written `grep -ci`
> and the reason is stated.

> **`Expected: exit 0, no output` is inaccurate for npm scripts.** `npm run lint` prints two
> banner lines (`> travel-expense@0.1.0 lint`, `> eslint`) before ESLint's own silence. Read those
> `Expected:` lines as "exit 0, no output **beyond npm's banner**." This plan does not change the
> inherited convention, but an implementer comparing literally must not stop on the banner.

---


### Task 1: [Tooling] — Playwright installs and runs Chromium in this environment

**Files**
- modify: `package.json` (add `@playwright/test` devDependency, add `test:e2e` script)
- create: `playwright.config.ts`
- modify: `.gitignore` (ignore `test-results/`, `playwright-report/`)
- test: `npx playwright --version`, `grep -c '"test:e2e"' package.json`, `npx tsc --noEmit`,
  `npm run lint`

> This task proves the harness runs **before** anything depends on it. If Chromium cannot launch
> here, stop the plan and report — Tasks 2, 7, 8 and 9 all assume a working Playwright.

- [x] **Step 1 — Confirm the starting state.**
      `grep -c playwright package.json` → Expected: `0`.
      `ls node_modules/.bin | grep -ci playwright` → Expected: `0`.

      > Corrected during execution. This step originally ran `npx playwright --version` expecting a
      > "not installed" error. `npx` **downloads a missing package to answer the query** — it
      > printed `Version 1.63.0` and exited 0 on a repo with no Playwright dependency at all. An
      > `npx <pkg>` invocation can never prove absence; only the project's own manifest and
      > `node_modules/.bin` can. Both verified `0` before Step 2.

- [x] **Step 2 — Install the test runner.**
      `npm install -D @playwright/test`
      Then `ls node_modules/.bin | grep -c playwright`
      Expected: `1` or greater.

- [x] **Step 3 — Install the browser binary.**
      `npx playwright install chromium`
      Expected: exit 0. Chromium downloads, or Playwright reports it is already installed.

- [x] **Step 4 — Confirm the runner is live.**
      `npx playwright --version`
      Expected: exit 0, output matching `Version 1.<minor>.<patch>`.

- [x] **Step 5 — Add the config.** Create `playwright.config.ts` with `testDir: "./e2e"`,
      `baseURL: "http://localhost:3000"`, a `webServer` block running `npm run dev` with
      `reuseExistingServer: !process.env.CI`, and a single `chromium` project.

- [x] **Step 6 — Add the script.** In `package.json`, add `"test:e2e": "playwright test"` to
      `scripts`.

- [x] **Step 7 — Ignore run artifacts.** Add `test-results/` and `playwright-report/` to
      `.gitignore`.

- [x] **Step 8 — Verify config and script landed.**
      `grep -c '"test:e2e"' package.json` → Expected: `1`.
      `ls playwright.config.ts` → Expected: exit 0, prints the path.
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

---

### Task 2: [Tooling] — A Playwright spec passes against committed feature 010

**Files**
- create: `e2e/010-categories.spec.ts`
- test: `npx playwright test e2e/010-categories.spec.ts`

> Feature 010 (manage expense categories) is a good proving ground: it is committed, its UI is
> entirely client-rendered from local storage, and none of its behavior is reachable by `tsc`.
> A pass here is evidence the harness covers behavior the compiler structurally cannot see.

> **Seed from the first step.** `app/categories/page.tsx` calls `router.replace("/")` when
> `getTrip()` returns `null`, rendering `null` until then. An unseeded spec cannot reach the
> heading — so the first draft's "navigate and assert the heading, expect 1 passed" step was
> known-false. Seeding belongs in the first spec written, not in a later repair step.

- [x] **Step 1 — Read the real storage keys.** Read `REFERENCE.md` §6 and record the exact key
      names for the active trip and the category list. Do not guess them.

- [x] **Step 2 — Write the spec with its fixture.** Create `e2e/010-categories.spec.ts` with a
      `beforeEach` seeding an active trip via `page.addInitScript` using those keys, plus one test
      navigating to `/categories` and asserting the heading is visible.

- [x] **Step 3 — Run it.**
      `npx playwright test e2e/010-categories.spec.ts`
      Expected: exit 0, output containing `1 passed`.
      If this fails, the seeded keys are wrong — re-read §6 rather than changing the assertion.

- [x] **Step 4 — Cover behavior only a browser can reach.** Add tests asserting:
      default categories are listed and show no rename/delete action; a custom category added via
      the UI appears with both actions; a blank name is rejected.

- [x] **Step 5 — Run the spec.**
      `npx playwright test e2e/010-categories.spec.ts`
      Expected: exit 0, output containing `4 passed`.
      (Scoped to this spec file deliberately — a whole-suite count would break the moment a later
      feature adds a fifth test.)

- [x] **Step 6 — Regression run.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.

---

### Task 3: [Config] — `.claude/repo-profile.md` holds this repo's verification facts

**Files**
- create: `.claude/repo-profile.md`
- test: `grep -c` assertions below

- [x] **Step 1 — Confirm it does not exist yet.**
      `ls .claude/repo-profile.md`
      Expected: exit 2, `ls: cannot access '.claude/repo-profile.md': No such file or directory`.

- [x] **Step 2 — Write the profile** with these five sections, named exactly:
      `## Verification commands` — `tsc` + `lint` always; `npm run build` only when a task touches
      routes, config, or dependencies; `npx playwright test e2e/<spec>` for behavioral scenarios.
      `## Behavioral gate` — Playwright. There is still **no unit-test runner**.
      `## Layer slices` — which slice each `[Layer]` tag receives, and the fallback: no matching
      slice → core packet alone, never a guess.
      `## Known-dirty paths` — `doc/`, `output/`, `<plan-dir>/PROGRESS.md`, `<plan-dir>/log.txt`,
      and `AGENTS.md` (`next dev` upserts a managed block into it, and Playwright's `webServer`
      starts `next dev`).
      `## Gate risk tiers` — two gates for Types/Data/Domain or any task touching `lib/` or a
      module boundary, **regardless of its label**; one combined gate for pure UI and route
      wiring. Task-level tiering outranks the feature-level thin rule.

- [x] **Step 3 — Verify each section by name** (five separate assertions, not a brittle
      `grep -c '^## '` that any extra heading would break):
      `grep -c '^## Verification commands' .claude/repo-profile.md` → `1`
      `grep -c '^## Behavioral gate' .claude/repo-profile.md` → `1`
      `grep -c '^## Layer slices' .claude/repo-profile.md` → `1`
      `grep -c '^## Known-dirty paths' .claude/repo-profile.md` → `1`
      `grep -c '^## Gate risk tiers' .claude/repo-profile.md` → `1`

- [x] **Step 4 — Verify the two rules other tasks cite.**
      `grep -c 'routes, config, or dependencies' .claude/repo-profile.md` → `1` or greater.
      `grep -c 'regardless of its label' .claude/repo-profile.md` → `1` or greater.

---

### Task 4: [Config] — Context packet split into a shared core plus five layer slices

**Files**
- modify: `memories/repo/travel-expense-context.md` (becomes the shared core)
- create: `memories/repo/slices/{types,data,domain,ui,route}.md`
- test: `wc -c`, `ls | wc -l` assertions below

> **Correctness fix, not just a split.** The packet header reads *"as of feature 005 complete; 006
> not yet started"* while all 15 features are committed. That packet is pasted into every dispatch,
> so this stale line has been feeding wrong project state to every implementer and reviewer.

> **Five slices, not four.** `writing-plans` defines the chain as Types → Data → Domain → UI →
> Route. A `[Types]` task with no slice makes Task 6's paste rule unsatisfiable on first use.

- [x] **Step 1 — Confirm the stale claim is present.**
      `grep -c 'feature 005 complete; 006 not yet started' memories/repo/travel-expense-context.md`
      Expected: `1`.

- [x] **Step 2 — Confirm the real state contradicts it.**
      `git log --oneline --grep='^feat(015)' | wc -l`
      Expected: `3`.

- [x] **Step 3 — Correct the file layout section.** Update the heading to state that all 15
      features in `features/` are committed, and refresh the tree beneath it against
      `find app lib components -type f`.

- [x] **Step 4 — Extract the five slices.** Move layer-specific content out of the core into
      `memories/repo/slices/`. Each slice holds only what a task of that layer needs: its paths,
      its boundary rules, its verification commands.

- [x] **Step 5 — Verify the stale line is gone.**
      `grep -c 'feature 005 complete; 006 not yet started' memories/repo/travel-expense-context.md`
      Expected: `0`.

- [x] **Step 6 — Verify all five slices exist.**
      `ls memories/repo/slices/*.md | wc -l`
      Expected: `5`.

- [x] **Step 7 — Verify the size budget on slices AND core.** A dispatch receives core **plus**
      slice, so capping only the slices would leave the payload unchanged.
      `wc -c memories/repo/slices/*.md` → Expected: every per-file byte count below `2500`.
      `wc -c memories/repo/travel-expense-context.md` → Expected: below `3000` (from `12255`).

---

### Task 5: [Skill] — `sdd` gains the clean-tree precondition

**Files**
- modify: `.claude/skills/sdd/SKILL.md` (Core invariants, Step 0)
- test: `grep -c` assertions below

> **Do not touch Step 6's staging text.** The first draft of this plan called for deleting a
> `git add -p` workaround from this skill. `grep -c 'add -p' .claude/skills/sdd/SKILL.md` returns
> `0` — no such text exists. Step 6 already specifies manifest-scoped staging with a
> never-`git add -A` rail and an unexpected-staged check. That text is correct; leave it alone.
> The overhead seen in `010`'s log was improvised at runtime because the tree was dirty, and
> fixing the tree removes it with no skill edit.

- [ ] **Step 1 — Confirm no precondition exists today.**
      `grep -ci 'clean.tree\|working tree' .claude/skills/sdd/SKILL.md`
      Expected: `0`.

- [ ] **Step 2 — Add the invariant.** Add a ninth **Core invariant** requiring a clean working
      tree, with the design doc §1 definition: "dirty" means tracked files with uncommitted
      modifications; untracked paths no task will touch are permitted but must be declared.

- [ ] **Step 3 — Pin the check as Step 0's FIRST item.** Renumber the existing six items to 2–7.
      Step 0 items 3 and 4 *create* `PROGRESS.md` and `log.txt`; a precondition appended after them
      would trip on files `/sdd` had just written. The new item 1 runs `git status --short`, treats
      `.claude/repo-profile.md`'s Known-dirty paths as permanently permitted, and stops with a
      report if any other tracked modification is undeclared.

- [ ] **Step 4 — Cite the profile, do not inline it.** The permitted-path list lives in
      `.claude/repo-profile.md`; Step 0 points at it rather than copying it.

- [x] **Step 5 — Verify the invariant and the check landed.**
      `grep -c '^9\. \*\*Clean working tree' .claude/skills/sdd/SKILL.md` → Expected: `1`.
      `grep -c '^1\. \*\*Clean-tree precondition' .claude/skills/sdd/SKILL.md` → Expected: `1`.
      `grep -c 'repo-profile' .claude/skills/sdd/SKILL.md` → Expected: `1` or greater.

      > Corrected during execution. This step originally asserted `grep -ci 'working tree'` ≥ 2,
      > which returned `1`: the invariant uses that phrase but Step 0's item reads "Clean-tree
      > precondition". The proxy string did not match how the text actually reads, so the check was
      > replaced with two assertions naming the two real sites rather than padding the prose to
      > satisfy a grep.

- [ ] **Step 6 — Verify Step 6's staging rail was NOT disturbed.**
      `grep -c 'git add -A' .claude/skills/sdd/SKILL.md`
      Expected: `1` — unchanged from before this task.

---

### Task 6: [Skill] — `sdd` gate prompts get a baseline contract and layer-based tiering

**Files**
- modify: `.claude/skills/sdd/SKILL.md` — Step 0 item 6 (packet read), Step 2 implementer prompt,
  Step 3 both gate prompts **and** the thin-feature paragraph, Step 4 gate decision, Step 5
  re-review exception, Step 7 log template, the `REFERENCE.md` ownership section
- test: `grep -c` assertions below

> **"Thin feature" appears at four sites** (lines 152, 233, 251, 323), not one. Replacing only the
> Step 3 paragraph would leave `sdd` tiering by layer in one place and by feature size in three
> others. All four must move together.

- [ ] **Step 1 — Confirm the four sites.**
      `grep -cin 'thin feature' .claude/skills/sdd/SKILL.md`
      Expected: `4`.

- [ ] **Step 2 — Add the baseline contract to both gate prompts.** Each gains three elements
      before its instructions: the exact `git diff` the controller intends to commit, pasted in;
      the declared known-dirty paths, by name; and the pipeline position, verbatim — *"the commit
      does not exist yet; `PROGRESS.md` and `log.txt` are written after you pass. Their absence is
      never a gap."*

- [ ] **Step 3 — Replace tiering at all four sites.** Step 3's paragraph, Step 4's gate decision,
      Step 5's re-review exception, and Step 7's log template all switch from thin-feature tiering
      to the layer-based rule, citing `.claude/repo-profile.md` § Gate risk tiers as its source
      rather than restating the criteria.

- [ ] **Step 4 — Swap the pasted packet for core + slice, at all three sites.** Step 0 item 6
      (which currently tells the controller to read and regenerate the monolithic packet), the
      Step 2 implementer prompt, and the Gate B prompt. The rule: paste the core plus the one
      slice matching this task's `[Layer]` tag; where no slice matches the tag, paste the core
      alone and say so — never guess a slice.

- [ ] **Step 5 — Tell subagents to report an insufficient slice.** Add one line to the implementer
      and Gate B prompts: if the slice lacks something the task needs, report that rather than
      guessing, so the slice gets corrected.

- [ ] **Step 6 — Move `REFERENCE.md` ownership to the controller.** Remove instruction 4 from the
      implementer prompt. Add a controller step updating `REFERENCE.md` **after the implementer
      returns and before the gates are dispatched**, so the edit sits inside the diff the gates
      review. Leave Gate A's `REFERENCE.md` check in place. The controller reads only the section
      the update table points at, not the whole 30 KB file.

- [x] **Step 7 — Verify the baseline contract reached both prompts.**
      `grep -c 'BASELINE — read this before anything else' .claude/skills/sdd/SKILL.md` → `1`.
      `grep -c 'paste the BASELINE block above' .claude/skills/sdd/SKILL.md` → `2`.

      > Corrected during execution. This originally expected the phrase twice, assuming the block
      > would be duplicated into each gate prompt. It was written once as a shared template with a
      > paste pointer in each prompt instead — one source rather than two copies that can drift.
      > The assertion now checks that shape: one template, two pointers.

- [x] **Step 8 — Verify no tiering rule was orphaned.**
      `grep -cin 'thin feature' .claude/skills/sdd/SKILL.md` → Expected: `1`.

      > Corrected during execution. Expecting `0` was wrong: the surviving mention is the
      > precedence statement ("a task touching `lib/` gets two gates even inside a thin feature"),
      > which *must* name the thin rule in order to override it. The three orphaned gate-count
      > rules are gone; this one is load-bearing.
      `grep -c 'memories/repo/slices' .claude/skills/sdd/SKILL.md` → Expected: `3`.
      `grep -c 'Check REFERENCE.md against what you just built' .claude/skills/sdd/SKILL.md`
      → Expected: `0`.

---

### Task 7: [Skill] — `writing-plans` switches plans from code to contracts

**Files**
- modify: `.claude/skills/writing-plans/SKILL.md` (repo table, Step 3, Provenance)
- test: `grep -c` assertions below

> **Ordering:** must land after Task 1. Until Playwright is installed, the skill's statement that
> it does not exist is true.

> **The red step is KEPT.** Its primary form asserts a named export with a declared shape is
> missing (`TS2305`) — a contract check, not an existence check. Step 3 makes the exported
> signature the plan's whole payload, so this is the one mechanical check that an implementation
> matches its contract. Only the ceremony goes: throwaway `*.probe.tsx` / `lib/__probe/` files and
> the computed column-number formula.

- [ ] **Step 1 — Confirm the skill currently forbids Playwright.**
      `grep -c playwright .claude/skills/writing-plans/SKILL.md`
      Expected: `2`.

- [ ] **Step 2 — Correct the repo table.** Replace the **Test framework** row: no unit-test runner
      still, but `@playwright/test` is installed and `npx playwright test e2e/<spec>` is the
      behavioral gate. Remove `playwright` from the list of commands not to write into plans.
      Point the row at `.claude/repo-profile.md` rather than restating every command.

- [ ] **Step 3 — Rewrite "Test-first without a test runner" for contracts.** The phrase occurs
      **twice** — the section heading and a cross-reference in the Test framework row — and Step 8
      expects both gone. Per design §2, a step
      names the file, exported signature, behavior, edge cases, negative constraints, and
      verification command — not the function body. Use the design doc's `AddCategoryModal` block
      verbatim as the reference shape. **Keep** the red→green loop: write the call site, expect a
      quoted `TS2305`/`TS2307`, implement, expect exit 0.

- [ ] **Step 4 — Delete only the ceremony.** Remove the instruction to create throwaway probe
      files, and the column-number prediction. State that `Expected:` lines match on error code and
      message, not on the column.

- [ ] **Step 5 — Scope the build command.** `npx tsc --noEmit` + `npm run lint` are the default
      pair; `npm run build` is added only for routes, config, or dependencies. Cite the profile.

- [ ] **Step 6 — Add the Playwright step format.** For behavior a compiler cannot see, the
      verification step is `npx playwright test e2e/<spec>.spec.ts` with an expected `N passed` —
      replacing the manual browser checks that were never performed.

- [ ] **Step 7 — Update Provenance.** Correct the "No test runner" row to record
      `@playwright/test` as installed, dated today, verified by `npx playwright --version`. Leave
      the "Typecheck failure format" row intact — the red step it documents is being kept, and it
      is the only line in this file containing the word "probe".

- [ ] **Step 8 — Verify by section heading, not by the word "probe".**
      `grep -c 'Test-first without a test runner' .claude/skills/writing-plans/SKILL.md`
      Expected: `0` — the section was renamed.
      `grep -c 'TS2305' .claude/skills/writing-plans/SKILL.md`
      Expected: `1` or greater — the red step survived.
      `grep -ci 'probe' .claude/skills/writing-plans/SKILL.md`
      Expected: `2` — the untouched Provenance row, plus the new line prohibiting throwaway
      `*.probe.tsx` / `lib/__probe/` files. (Corrected during execution: the prohibition has to
      name the thing it prohibits, so `1` was unreachable without dropping the rule.)

---

### Task 8: [Skill] — `PLAN-TEMPLATES.md` carries the contract template

**Files**
- modify: `.claude/skills/writing-plans/references/PLAN-TEMPLATES.md`
- test: `grep -c` assertions below

- [ ] **Step 1 — Confirm the probe ceremony is present.**
      `grep -ci probe .claude/skills/writing-plans/references/PLAN-TEMPLATES.md`
      Expected: `2` — both inside template 2.

- [ ] **Step 2 — Rewrite template 2 as the contract template.** Files manifest, one contract block
      per file, the kept red→green compiler steps, verification. No function bodies.

- [ ] **Step 3 — Add a Playwright task template.** Write the spec, run
      `npx playwright test e2e/<spec>.spec.ts`, expect `N passed`.

- [ ] **Step 4 — Correct the header and command table.** The header's "no test runner installed"
      and the "There is **no** `npm test` in this repo" line must both reflect the new
      `test:e2e` script.

- [ ] **Step 5 — Leave the refactor template unchanged.** It is still correct.

- [ ] **Step 6 — Verify.**
      `grep -ci probe .claude/skills/writing-plans/references/PLAN-TEMPLATES.md` → Expected: `1`
      — the rule telling an implementer *not* to create a throwaway probe file. (Corrected during
      execution, same reason as Task 7 Step 8: a prohibition must name what it prohibits.)
      `grep -c 'playwright test' .claude/skills/writing-plans/references/PLAN-TEMPLATES.md`
      → Expected: `2` or greater.
      `grep -c 'TS2305' .claude/skills/writing-plans/references/PLAN-TEMPLATES.md`
      → Expected: `1` or greater — the red step survived here too.

---

### Task 9: [Skill] — `feature-spec` maps Playwright scenarios instead of unit tests

**Files**
- modify: `.claude/skills/feature-spec/SKILL.md` — YAML frontmatter `description:`, SA role table,
  gate table, Phase 0, Phase 4, Phase 5, output template
- test: `grep -c` assertions below

> **Six occurrences, not four.** `grep -c 'Unit-test mapping'` returns `4` (lines 61, 109, 182,
> 218), but case-insensitively there are `6`: line 3 is the skill's YAML `description:` — the text
> the Skill tool matches on — and line 47 is the SA role table. Fixing only four leaves the skill
> advertising a capability it no longer has, while Task 10 corrects the same wording in
> `AGENTS.md`, producing exactly the drift this plan exists to remove.

- [ ] **Step 1 — Confirm both counts.**
      `grep -c 'Unit-test mapping' .claude/skills/feature-spec/SKILL.md` → Expected: `4`.
      `grep -cin 'unit-test mapping' .claude/skills/feature-spec/SKILL.md` → Expected: `6`.

- [ ] **Step 2 — Convert all six occurrences** to Playwright scenario mapping, including the
      frontmatter `description:` and the SA role table row.

- [ ] **Step 3 — Rewrite Phase 4's body.** It maps each acceptance criterion to a Playwright spec
      file and test name, feeding the plan's verification steps directly.

- [ ] **Step 4 — Compact Phase 5.** The AC verification matrix stays — it catches uncovered edge
      cases — but as a table with stated columns, not prose.

- [ ] **Step 5 — Update Phase 0's runner check.** It currently inspects `package.json` for a
      unit-test runner. It now cites `.claude/repo-profile.md` § Behavioral gate as the source of
      truth, rather than inlining the fact.

- [ ] **Step 6 — Verify the rename is complete, case-insensitively.**
      `grep -cin 'unit-test mapping' .claude/skills/feature-spec/SKILL.md` → Expected: `0`.
      `grep -cin 'playwright scenario mapping' .claude/skills/feature-spec/SKILL.md`
      → Expected: `6` (Playwright is a proper noun; all six read "Playwright scenario mapping").
      `grep -c 'repo-profile' .claude/skills/feature-spec/SKILL.md` → Expected: `1` or greater.

---

### Task 10: [Docs] — `CLAUDE.md` and `AGENTS.md` match what the skills now do

**Files**
- modify: `CLAUDE.md` (Source of truth, per-feature loop, Cost optimization)
- modify: `AGENTS.md` (Feature Implementation Workflow section only)
- test: `grep -c` assertions below

> Last deliberately — these documents can only be made accurate once the pipeline behaves the new
> way. Leave `AGENTS.md`'s top block alone; `next dev` regenerates it.

- [ ] **Step 1 — Confirm the current rule count.**
      `grep -c 'Three rules keep the token/time cost' CLAUDE.md`
      Expected: `1`.

- [ ] **Step 2 — Rewrite the cost-optimization rules** as the current set: sliced context packet;
      thin features skip `/feature-spec` (feature-level only — it no longer decides gate count);
      plans carry contracts, not code; gate count is risk-tiered by task layer; Playwright is the
      behavioral gate.

- [ ] **Step 3 — Add the clean-tree precondition** to the per-feature loop's step 1.

- [ ] **Step 4 — Add `.claude/repo-profile.md` to Source of truth**, described as where this
      repo's verification commands, gate tiers, and known-dirty paths live.

- [ ] **Step 5 — Correct `AGENTS.md`.** Its Feature Implementation Workflow section describes
      `/feature-spec` as producing "unit-test mapping" (Task 9 removed that). Update to
      "Playwright scenario mapping" and note the clean-tree precondition in the `/sdd` bullet.

- [ ] **Step 6 — Verify.**
      `grep -c 'repo-profile' CLAUDE.md` → Expected: `1` or greater.
      `grep -ci 'contracts, not code' CLAUDE.md` → Expected: `1` or greater.
      `grep -cin 'unit-test mapping' AGENTS.md` → Expected: `0`.

- [ ] **Step 7 — Final regression run.**
      `npx tsc --noEmit` → Expected: exit 0, no output.
      `npm run lint` → Expected: exit 0, no output beyond npm's banner.
      `npm run build` → Expected: exit 0, ending with the route table.
      `npx playwright test e2e/010-categories.spec.ts` → Expected: exit 0, `4 passed`.

---

## Execution

Work **one task at a time, in order.** Do not read ahead and batch tasks.

Run this plan **directly, not through `/sdd`** — Tasks 5–10 edit the skills that would otherwise be
executing it. Skill edits take effect on the next invocation, not the current one.

For each task:

1. Read the task's **Files** manifest before touching anything.
2. Run each step's verification command and compare the real output against the step's stated
   `Expected:` line. A mismatch means stop and diagnose — never edit the plan's expected output to
   match what you got. (`npm run` banner lines are not a mismatch; see the header note.)
3. Finish with **the regression commands that task's own Files manifest lists** — not a fixed
   trio. `npm run build` belongs only to tasks touching routes, config, or dependencies, per
   `.claude/repo-profile.md`.
4. Commit the task.
5. Update this plan and the adjacent `log.txt` before starting the next task: tick the task's
   checkboxes, set `**Status:** In Progress` on the first completion, and append a log entry with
   Completed / Summary / Key Decisions / Deviations / Files Changed.

Commit message format — Conventional Commits. This plan has no feature number, so the scope is
`workflow`:

    chore(workflow): add Playwright as the behavioral verification gate

    - one behavior per bullet, derived from `git diff --staged`
    - not a restatement of the task title

    Spec: docs/superpowers/specs/2026-09-12-ai-workflow-optimization-design.md

Never commit on a failing lint, typecheck, or build.
