# Repo profile — {{REPO_NAME}}

<!-- SCAFFOLD: stub, mirroring the section structure the pipeline's skills expect. Fill each
section in before relying on /sdd or /feature-spec's gate logic — they cite this file rather
than carrying their own copies of these facts. -->

## Verification commands

TODO — the exact command for each check (lint, typecheck, build, tests) and when each applies
(every task vs. only when certain paths change), plus each command's success signal.

## Behavioral gate

TODO — the tool that verifies end-to-end/UI behavior a compiler can't see (Playwright, Cypress,
system tests, etc.), where its specs live, and when a task requires adding/updating one.

## Layer slices

TODO — if this repo's memory packet is split into layer-tagged slices (see
memories/repo/slices/ once created), list them here with a one-line description of what each
covers, so `/sdd` and `/writing-plans` know which slice to hand a subagent for a given `[Layer]`
tag.

## Known-dirty paths

TODO — paths that are expected to show as modified in `git status` even on a clean checkout
(generated files, lockfiles that churn, etc.), so `/sdd`'s clean-tree check doesn't false-positive
on them.

## Gate risk tiers

TODO — which kinds of tasks require two independent review gates vs. one combined gate. The
source project's rule: two gates for tasks touching types, data, domain, core library code, or a
module boundary; one combined gate for pure UI/presentation and route/wiring work. Adjust to this
repo's own architecture.
