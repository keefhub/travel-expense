---
name: spec-review
description: "Review an existing specification through a diamond fan-out: one frozen packet, three isolated parallel legs (requirements, verification against the real codebase, adversarial), one reconciliation, then a single in-place rewrite of the spec. Use to review, harden, stress-test, or find gaps in a spec that already exists — including one produced by /feature-spec. Not for creating a spec from scratch."
---

# /spec-review

One diamond: a single divergence point (the frozen packet), three isolated parallel legs, one convergence point (you). Everything below serves two properties:

- **Comparability** — all legs diverge from the same immutable packet, so their conclusions describe the same document and their disagreements are meaningful.
- **Independence** — legs never see each other's reasoning, and none of them edits the spec. A leg that reads another leg's critique is anchored by it, silently turning three reviews into one review with two echoes.

Creating a spec is [`/feature-spec`](../feature-spec/SKILL.md)'s job. This skill only reviews one that exists.

## Usage

```
/spec-review doc/spec/005.record-expense.md
/spec-review 005                    # resolve to the matching doc/spec/ file
/spec-review                        # infer from conversation; ask if ambiguous
```

Resolve `{slug}` as the spec filename without extension. Scratch lives in `.spec-review/{slug}/`; the deliverable is the improved spec written back to its own path.

**If the target does not exist, stop and say so** — do not generate one to have something to review. Offer `/feature-spec` instead.

## Phase 0 — Freeze the packet

1. Read the spec in full. Do not edit it yet.
2. Create the scratch directory and write `packet.md`: the spec path, its current version, today's date, then the **complete verbatim spec text**.
3. Compute the SHA-256 of `packet.md` and write `manifest.json`:

```json
{
  "spec_path": "<path>",
  "spec_version": "<current version from the spec>",
  "section_ids": ["<sorted list of every top-level section heading>"],
  "section_count": 0,
  "frozen_at": "<ISO-8601 UTC>",
  "content_sha256": "<64 lowercase hex chars of packet.md>"
}
```

`section_count` equals the length of `section_ids`. If the spec carries no version, record the version you are treating it as (e.g. `0.1.0`) and say so — Phase 4 increments from there.

**Frozen vs. open.** The spec *text* is frozen — no leg may re-derive it, pull a newer version, or substitute a different requirements source. The *codebase* is deliberately **not** frozen: legs 2 and 3 must open real files to verify what the spec claims. That is ground-truth verification, not packet divergence.

## Phase 1 — Fan out

Dispatch all three legs in the **same turn** as blocking foreground calls. Do not background them and do not end your turn while a leg is running — an orphaned leg delivers its result to whoever called you, and harness cleanup can delete its working directory mid-review. Do not stagger the dispatch: prompting one leg after seeing another's output leaks conclusions between them.

Pass every leg the identical packet and nothing else — never another leg's output. Give each: the packet, `manifest.json` and its `content_sha256`, the repository root, and its own brief below.

**Delivering the packet.** Inlining the full spec text into three prompts risks transcription drift and silently breaks the comparability the hash exists to prove. Prefer giving each leg the packet **path** plus the expected hash, with a mandatory first action: recompute the SHA-256, confirm it matches, and abort on mismatch. That makes comparability provable rather than asserted. Disclose whichever method you used in your final report.

**Model tiering.** Pick the least-capable model per leg that clears its floor, from those your subagent tool actually offers, and name it explicitly at dispatch. Raise the tier when the spec is large, cross-cutting, security-sensitive, or hard to reverse. As a starting point: leg 1 is document-only analysis and usually clears at a mid tier; legs 2 and 3 carry the judgment calls that go wrong quietly — distinguishing "absent and the spec wrongly implies it exists" from "absent and correctly presented as to-be-created", and filtering real objections from manufactured ones — and usually want the top tier. Log each choice and why.

**Every leg is READ-ONLY.** It may read the repository; it may not edit the spec, write files, or modify anything. Each returns its full artifact as response content, opening with:

```text
Role: Requirements|Verification|Adversarial
Manifest-SHA256: <64 lowercase hex characters>
Reviewed-Sections: <sorted comma-separated section headings>
```

Every leg labels each claim `Evidence` (quoted from the spec, or cited as file:line), `Inference`, or `Recommendation`, and expresses each finding as:

```text
**F-<n> [Critical | Major | Minor] — <short title>**
- Location: <spec section, and file:line where relevant>
- Quote: "<verbatim text from the spec that is wrong, missing, or ambiguous>"
- Problem: <what breaks, concretely>
- Consequence: <what goes wrong downstream if it ships as written>
- Proposed revision: <the replacement text or the specific addition, written out>
```

Findings without a proposed revision are not actionable — the leg writes the replacement prose. For a "missing" finding, it quotes the nearest surrounding text and writes the addition in full.

Tell every leg: if some dimension of the spec is genuinely sound, say so plainly. Manufactured findings are worse than none.

### Leg 1 — Requirements

Review the spec as a requirements analyst. Judge it as a document a developer who has never seen the feature must implement from with no further conversation, and a tester must verify against. Report: (1) manifest hash + reviewed sections; (2) ambiguity — every sentence with more than one reasonable reading, quoted; (3) completeness — missing actors, states, error paths, empty and boundary cases, permissions, data lifecycle; (4) testability — requirements that cannot be falsified as written, and acceptance criteria that are not observable from outside the implementation; (5) internal contradictions between sections; (6) unstated assumptions presented as fact; (7) scope — what is in, what is out, and what is silently neither; (8) missing or weak BDD scenarios, written out in full Gherkin; (9) the questions a developer will have to ask on day one.

Do not propose technologies or implementation designs.

### Leg 2 — Verification

Review the same spec against the actual repository. Treat every claim the spec makes about existing code, APIs, conventions, or capabilities as **unproven until you open the controlling file**. Report: (1) manifest hash + reviewed sections; (2) claims about current behavior that are wrong, stale, or unverifiable, each with file:line; (3) named components, endpoints, tables, modules, methods, types or paths that do not exist or are misnamed — and for each, state whether it (a) does not exist and the spec wrongly implies it does, (b) does not exist and the spec correctly presents it as to-be-created, or (c) exists but differs from the description; do not collapse that distinction; (4) "reuse existing X" claims where X does not do what the spec assumes — check the actual method, handler, policy, mapping, status handling and error branches; (5) integration points the spec omits — every write path that must also change, every consumer of a shared component affected, every caller to update; (6) authorization, validation and data-migration gaps between spec and real code; (7) proposed designs conflicting with established patterns, citing the pattern with file:line; (8) test coverage the spec assumes but that does not exist; (9) effort or sequencing claims the real code says are optimistic.

Re-verify any API claim the spec says it already checked against installed dependency versions — framework versions in a repo routinely differ from training data, and vendored docs under `node_modules/**/docs/` are legitimate ground truth. Never trust the spec's description of the code over the code. Confirming a claim is accurate is as valuable as finding an error.

### Leg 3 — Adversarial

Assume the spec is confidently wrong somewhere and find where. **First**, steel-man it in three sentences so the critique attacks its strongest reading. Then report: (1) manifest hash + reviewed sections; (2) findings by severity — contradictions, unsafe defaults, missing failure modes, concurrency and idempotency gaps, partial-failure and rollback behavior, second-order effects on adjacent features, data that becomes wrong or unreachable, security and privacy consequences; (3) a pre-mortem — it is six months later and this feature is the top incident; write the three most likely stories and what in the spec allowed each; (4) explicit challenges to what the spec treats as settled, **including the conclusions of its own self-review section** — a self-review that cleared itself is a prime target; (5) what the spec optimizes for, and who pays; (6) **findings considered and rejected as unsupported, with reasons — mandatory**; a review with no rejected candidates suggests nothing was being filtered; (7) the single change that would most reduce risk.

Severity discipline: Critical is data loss, silent corruption, or a feature that cannot work as specified. Do not inflate.

### If parallel subagents are unavailable

Run the legs sequentially, each still receiving the untouched packet and **no** output from an earlier leg, and disclose the degradation in your summary. Never merge the three briefs into one review pass.

## Phase 2 — Validate

Bind results by **requested leg name, never by completion order**. Reject any artifact that is missing, truncated, names the wrong role, declares a different manifest hash or section set, reviews a different spec version, or contains findings with no proposed revision. Retry only the failed leg, one capability tier up, from the **original** packet — never refreeze, never rerun a healthy leg.

After validation **you** write each response to `.spec-review/{slug}/legs/requirements.md`, `verification.md`, `adversarial.md`. Legs never write files. If a leg's artifact was too large to return inline and the harness persisted it, extract it from that file programmatically rather than retyping it.

## Phase 3 — Reconcile before you rewrite

Build `.spec-review/{slug}/reconciliation.md` **before** touching the spec:

| # | Finding | Severity | Raised by | Spec quote | Agreed? | Resolution | Confidence | Target section |

One row per distinct finding. Merge duplicates raised by more than one leg and **note the agreement — it is a strong signal**. Keep contradictions between legs as separate rows. Resolve by this ladder:

1. Verified code (file:line) outranks anything the spec asserts about the code.
2. A concrete failure scenario outranks a general worry.
3. Two legs disagreeing becomes a **named open question** in the spec — never a blended middle.
4. Every Critical and Major finding gets a disposition: **Applied**, **Documented** (recorded as a risk, assumption, or open question), or **Rejected with evidence**. Silence is not a disposition. Minor findings may be batched but not dropped silently.
5. A finding that would change the feature's scope or cost is **surfaced to the user as a question**, not absorbed. State what it blocks.

A leg's *finding* and its *proposed revision* are separable. Accepting that a gap is real does not oblige you to accept prose that invents an answer the source material does not support — record the gap as an open question instead, and say in the reconciliation that you did.

## Phase 4 — Gate, then write once

Do not edit the spec until all of these hold:

- three artifacts validated against the same manifest hash and section set;
- every Critical and Major finding has a disposition;
- every applied revision has actual replacement prose, not a note that something should change;
- every remaining claim about existing code carries a file:line citation;
- every acceptance criterion is observable and falsifiable;
- every BDD scenario maps to at least one named test;
- no TBD or unresolved placeholder introduced by the rewrite.

Then rewrite the spec in place:

- preserve the original section order and any `<!-- MANUAL -->` blocks verbatim;
- increment the minor version and add a Version History row summarizing this review;
- apply accepted revisions **inline, in the sections they belong to** — never append a list of corrections to the end;
- keep requirements sections technology-agnostic; implementation detail stays in the technical sections;
- append two tables:

  **Review Findings** — Finding | Severity | Raised by | Disposition | Evidence | Where applied
  **Open Questions** — Question | What it blocks | Who decides

Where the verification leg *confirmed* claims as accurate, say so in the Review Findings section. A review that records only defects misrepresents the document.

## Phase 5 — Report

In chat, report: what changed at the section level; the findings you rejected and why; any leg disagreement you preserved rather than resolved; the models used per leg; whether execution degraded to sequential; anything surfaced as a scope or cost question. Keep the scratch directory until the user confirms the rewrite is good, and tell them where it is.

## Constraints

- Read-only outside the spec file — no code changes, no other files edited, no commits. The scratch directory is the one exception.
- Do not weaken a requirement to make a finding go away.
- If the spec is already sound in some dimension, say so plainly rather than inventing findings.
- Do not create the spec you were asked to review.
