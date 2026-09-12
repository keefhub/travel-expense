# Edge-case taxonomy — candidate prompts

The ten categories `/feature-discovery` Mode B Phase 2 sweeps, with candidate prompts written for
**this** app: browser local storage only, no backend, one active trip at a time, user-supplied fixed
exchange rates, currency shown as codes (`SGD 12.50`), mobile-first with a desktop-responsive layout,
works offline after first load.

**How to use this file.** Per category, pick the 2–4 prompts that plausibly apply to the feature in
hand, rewrite each as a concrete user-visible question about *this* feature, and put them to the user
as **in scope / out of scope / defer**. These are prompts, not a checklist to paste — a prompt that
cannot apply is evidence for the category's `N/A — <reason>` close, not a scenario to invent.

Every category gets closed. Scenarios, or `N/A — <reason>`. Never silence.

---

## 1. Empty & zero state

What the user sees before any data exists, and whether zero differs from absent.

- First ever visit — nothing in local storage at all. Where does the user land?
- The list this feature reads is empty. Empty-state message, or a bare screen?
- A value is legitimately `0` (zero spend, zero remaining budget) versus **not set** (no budget at
  all). Do these render differently?
- An optional field left blank — is it omitted from display, or shown as a placeholder?
- The feature's aggregate over an empty set — total of no expenses, average of nothing.

## 2. Boundaries & precision

The first, the last, the largest, the smallest, and what rounding does.

- Smallest accepted amount. Is `0` allowed? `0.01`? What about `0.001`?
- Very large amounts — does the layout survive `JPY 1234567`?
- Decimal precision on display versus on storage, and which one arithmetic uses.
- Rounding: does a converted total equal the sum of individually converted rows, or can they differ
  by a cent? Which one is authoritative?
- Trip start date and trip end date themselves — the first day and the last day, inclusive?
- Longest text a user can type into a name, description, or location, and what the UI does with it.
- The largest number of items the feature can accumulate before it stops being usable.

## 3. Invalid & malformed input

What the user can enter that must be refused, and how the refusal appears.

- Non-numeric text in a numeric field; a lone `-`, `.`, or `e`.
- Negative values — refused outright, or meaningful for this feature?
- Whitespace-only input in a required field.
- End date before start date.
- A date far outside any plausible trip.
- An unsupported country or a currency with no rate entered.
- Is validation on submit, on blur, or live? Where does the message appear, and does it clear?
- Can the form be submitted while invalid? What happens to the entered data if it is refused?

## 4. Duplicates & collisions

Two things that want the same identity.

- Two records identical in every field, entered deliberately (two identical coffees) — allowed?
- A new name matching an existing one, case-differing (`Food` vs `food`) or whitespace-differing.
- Renaming something onto a name already in use.
- A custom entry colliding with a default one — a custom category named `Food`.
- A second exchange rate entered for a currency that already has one — replace, reject, or append?

## 5. State & lifecycle conflicts

The record exists, but the state around it has moved.

- No active trip exists yet, and the user reaches this feature directly.
- The trip has ended (today is after the end date) — still accepting entries?
- The trip dates change *after* records exist — do records now outside the range stay, warn, or hide?
- A referenced thing is deleted while records still point at it: a deleted custom category on an old
  expense, a removed exchange rate on a foreign-currency expense.
- Default versus custom: which operations are refused on defaults, and what does the UI show instead?
- Creating a new trip destroys the old one — what does this feature's data do at that moment?
- A reset wipes everything mid-session while this screen is open.

## 6. Persistence failure

Local storage is the only store, and it can fail. Never skip this category for a feature that writes.

- Quota exceeded on write. Does the user get a friendly message, and is the in-progress input kept?
- Stored JSON is corrupt or hand-edited — parse fails on read.
- The key is absent when a sibling key is present (partially wiped storage).
- Data written by an older version of the app with a different shape.
- Local storage unavailable entirely (private mode, storage disabled).
- A multi-key write that fails halfway — is the result consistent, and which key wins?
- After a failed write, does the screen show the value the user typed or the value that was stored?

## 7. Navigation & interruption

Whatever the user does that is not finishing the flow.

- Refresh mid-form with unsaved input.
- Browser back / forward out of the flow, then back into it.
- Navigating away via in-app navigation with unsaved input.
- Deep link or direct URL to a record that has since been deleted.
- Double submit — the button tapped twice quickly.
- Where does the user land after a successful save, and what confirmation do they see?
- Re-entering a flow that was abandoned earlier — is the earlier input still there?

## 8. Offline & time

The app works offline after first load, and dates are user-entered.

- Fully offline: does this feature work, and is anything about it degraded?
- A future-dated entry. Allowed — and does it count toward totals shown as "so far"?
- A back-dated entry outside the trip range.
- A day boundary crossed while the app is open — does "today" update?
- Device timezone or clock changed between entries.
- Trip duration and day counts — inclusive of both ends, and stable across timezones?

## 9. Presentation & scale

Mobile-first, desktop-responsive, minimal style — what breaks visually.

- Mobile (narrow, bottom navigation) versus desktop. Does the layout change, and is anything hidden?
- A long list — truncation, "show more", or scroll? How many rows before it needs help?
- Text too long for its container: a long category name, a long location, a long description.
- A chart with zero categories, exactly one, or more categories than legible colours.
- Currency shown as a code plus amount (`SGD 12.50`) everywhere, including totals and chart labels.
- Ordering and tie-breaking when two records share a sort key (same date).
- Is anything clickable that leads somewhere, and what is the target's empty or missing state?

## 10. Multi-actor & permissions

Usually thin in a single-user local-storage app — but state it rather than skip it.

- Two browser tabs open on the same app. One writes; does the other notice or silently overwrite?
- Two devices or two browsers — separate data, with no sync. Is that visible to the user anywhere?
- Anything exported and shared — what leaves the device, and does it contain anything unexpected?
- Any notion of ownership, sharing, or another person in the requirement at all?

If none of these apply: `N/A — single-user, single-device feature with no shared state.` That close is
expected here; an unmentioned category is not.
