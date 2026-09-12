# Feature file output shape

What `/feature-discovery` Mode B Phase 4 writes to `features/NNN.{slug}.md`. Five parts, in this
order, nothing else. The Gherkin block is byte-compatible with the existing files in `features/`;
the three trailing sections are additions this skill introduces, and `/feature-spec` reads them as
input to its Open Questions & Risks phase.

## The template

````markdown
# Feature 16: Split A Bill

```gherkin
Feature: Split a bill
  As a traveller
  I want to record which of my companions shared an expense
  So that I can see who owes me what

  Scenario: User splits an expense evenly between themselves and one companion
    Given the user is recording an expense of SGD 40.00
    When the user marks the expense as shared with one companion
    Then the app should record the user's share as SGD 20.00
    And the app should record the companion's share as SGD 20.00

  Scenario: User records a split with no companions selected
    Given the user is recording an expense
    When the user opens the split option and selects no companions
    Then the app should treat the expense as unshared
    And the full amount should count as the user's own spend

  Scenario: Split amount does not divide evenly
    Given the user is recording an expense of SGD 10.00
    When the user splits it between themselves and two companions
    Then each share should be shown rounded to two decimal places
    And the sum of the shares should equal the expense total
```

## Assumptions

1. A companion is a free-text name; the app does not maintain a contact list.
2. Shares are equal; uneven splits are not supported.
3. The expense total, not the user's share, is what the dashboard total reflects.

## Out of Scope

- Marking a share as settled or repaid
- Sharing the split with the companion in any form
- Splitting an expense recorded in a currency with no exchange rate entered

## Deferred

- Uneven or percentage-based splits — deferred until even splitting is in use
- Remembering frequent companions for reuse — deferred, needs a storage key of its own
````

## Rules for each part

**Title** — `# Feature N: Title`. `N` unpadded (`16`, not `016`), even though the filename pads it.
Title Case, matching the `Feature:` line in meaning.

**Gherkin block** — one fence, language `gherkin`. Inside: the `Feature:` line, then the
`As a / I want / So that` three-liner at two-space indent, then a blank line before each `Scenario:`.
Two-space indent for `Scenario:`, four for its steps. Happy path first; edge-case scenarios after it,
in taxonomy order.

**Scenario names** — a statement of the case, not a label: `Split amount does not divide evenly`,
not `Rounding edge case`. Name the situation so a failing test reads as a sentence.

**Steps** — `Given` sets state, `When` is the single user action, `Then`/`And` assert what the user
sees or what survives a refresh. No component names, hooks, file paths, libraries, CSS classes, or
storage keys. Amounts carry their currency code (`SGD 40.00`).

**One assertion cluster per scenario** — if a scenario asserts two independent outcomes, split it.
Use `Scenario Outline` + `Examples` only when behaviour varies by data alone.

**Assumptions** — numbered, one sentence each. Everything decided in the sweep that the original
requirement did not state. These are the claims `/feature-spec` will challenge, so make each one
falsifiable.

**Out of Scope** — bulleted. What a reader would reasonably expect and will not get. This is what
stops `/sdd` implementing beyond the spec.

**Deferred** — bulleted, each with its reason. Distinct from Out of Scope: deferred means "later",
out of scope means "not this feature".

**Empty sections are written as `None.`** Deleting a section makes it look unasked.
