# Repo profile — travel-expense

Repo-specific facts the pipeline skills consume. The skills (`feature-spec`, `writing-plans`,
`sdd`) stay generic and **cite this file**; they do not restate its rules. A different project
supplies its own profile and the skills are unchanged.

When something here stops matching reality, fix it here — this file is the source, not a copy.

## Verification commands

| Command | Run it when | Success looks like |
| --- | --- | --- |
| `npx tsc --noEmit` | **Always.** Every task. | exit 0, no output |
| `npm run lint` | **Always.** Every task. | exit 0, no output beyond npm's two banner lines |
| `npm run build` | **Only** when a task touches routes (`app/**/page.tsx`, layouts), config, or dependencies | exit 0, "Compiled successfully", then the route table |
| `npx playwright test e2e/<spec>.spec.ts` | Any task whose behavior a compiler cannot see | exit 0, `N passed` |

`npm run build` is deliberately **not** universal. It is the slowest command here and adds nothing
for a task that only creates an unmounted component — `tsc` and `lint` already settle that.

Two traps, both hit in practice:

- **`npm run <script>` prints two banner lines** (`> travel-expense@0.1.0 lint`, `> eslint`) before
  the tool's own output. `Expected: exit 0, no output` means *no output beyond that banner*. Do not
  stop a run over it.
- **`npx <pkg>` cannot prove a package is absent.** It downloads a missing package to answer the
  query. To check absence, read `package.json` and `node_modules/.bin`.

## Behavioral gate

**Playwright** (`@playwright/test`), config at `playwright.config.ts`, specs in `e2e/`.

There is **no unit-test runner** in this repo, and none is planned. Do not write plan steps that
invoke `jest`, `vitest`, or `npm test` — they do not exist. Behavior a compiler cannot see is
verified by a Playwright spec, never by a manual browser checklist: this app is entirely
client-rendered from `localStorage`, so an unverified UI claim is an unverified claim.

Two facts every spec here needs:

- **Seed `localStorage` before first render.** Every route redirects to `/` when `getTrip()`
  returns `null`. Use `page.addInitScript`; a `beforeEach` that navigates first is too late.
  Storage keys are in `REFERENCE.md` §6 — read them, do not guess.
- **Next.js renders its own `role="alert"` route announcer** on every page. Scope alert assertions
  to the component under test or they resolve to two elements and fail on strict mode.

## Layer slices

Subagent dispatches receive the shared core packet
(`memories/repo/travel-expense-context.md`) plus **one** slice from `memories/repo/slices/`,
chosen by the task's `[Layer]` tag:

| `[Layer]` tag | Slice |
| --- | --- |
| `[Types]` | `slices/types.md` |
| `[Data]` | `slices/data.md` |
| `[Domain]` | `slices/domain.md` |
| `[UI]` | `slices/ui.md` |
| `[Route]` | `slices/route.md` |

**A plan may use adapted tags** (`/sdd` permits this — a workflow plan might use `[Tooling]`,
`[Config]`, `[Skill]`, `[Docs]`). Where no slice matches the tag, paste the **core alone** and say
so in the prompt. Never guess a slice.

If a subagent finds its slice missing something the task needs, it reports that rather than
guessing, and the slice gets corrected.

## Known-dirty paths

`/sdd` requires a clean working tree before a run. "Dirty" means **tracked files with uncommitted
modifications**. These paths never count as dirty and never need re-declaring:

| Path | Why |
| --- | --- |
| `doc/` | Pipeline output — specs, plans, logs |
| `output/` | Failure reports from prior attempts |
| `<plan-dir>/PROGRESS.md` | `/sdd` Step 0 creates it |
| `<plan-dir>/log.txt` | `/sdd` Step 0 creates it |
| `test-results/`, `playwright-report/` | Playwright run artifacts (git-ignored) |
| `AGENTS.md` | `next dev` upserts a managed block into it on every start, and Playwright's `webServer` runs `next dev`. The block currently matches, so the write is a no-op — but a Next.js upgrade would make the behavioral gate dirty a tracked file mid-run |

Anything else modified and uncommitted stops the run until the user declares it. A reviewer running
`git status --short` sees the same list, so undeclared changes are what produce wrong-baseline
review findings.

## Gate risk tiers

How many independent review gates a task gets, decided **per task**, not per feature:

| Task | Gates |
| --- | --- |
| `[Types]`, `[Data]`, `[Domain]`, or **anything touching `lib/`** — regardless of its label | **Two** independent gates (spec compliance + code quality) |
| Any task defining or changing a module boundary or storage contract | **Two** |
| `[UI]` and `[Route]` wiring with no `lib/` change | **One** combined gate |

**Task-level tiering outranks the feature-level thin rule.** A task touching `lib/` gets two gates
even inside a thin feature. `CLAUDE.md`'s thin-feature rule governs only whether `/feature-spec` is
skipped for a feature — it does not decide gate count.

Every gate prompt carries a baseline contract: the exact `git diff` under review, the known-dirty
paths above by name, and the pipeline position — *the commit does not exist yet; `PROGRESS.md` and
`log.txt` are written after the gate passes, so their absence is never a gap.*

## Model tiers

`/sdd`'s implementer subagents — Step 2, and the Step 4 fix-and-re-review subagent — run on
**Haiku** (`model: "haiku"` on the `Agent` call). This is the loop's highest-volume subagent (one
dispatch per task, often two on a fix cycle), so it's where a cheaper model buys the most.

Both review gates (Step 3 of `/sdd`) and every `writing-plans` review pass (A.5, B, C) run on the
**default/inherited model** — no `model` override on those `Agent` calls. This is deliberate: the
gates exist to catch what the implementer got wrong, so they must never be weaker than the
implementer they're checking. Never lower a gate's model to match the implementer's.

Because the implementer is a smaller model, plans written here carry more of the burden than usual
— see `writing-plans` § "Calibrating contracts for a smaller implementer". A plan ambiguous enough
that a strong model would resolve it correctly by inference is a plan defect in this repo, not an
implementer error — the gates will keep catching it, but every caught defect is a wasted
implement→fail→review→fix cycle that a tighter plan would have avoided.
