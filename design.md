# Design System

The visual/interaction reference for this app. Read this before implementing or touching any UI in
a `features/NNN.*.md` feature — alongside [REFERENCE.md](REFERENCE.md) and
[features/OVERVIEW.md](features/OVERVIEW.md) §1–3. This file governs _how things look and behave_;
it never overrides a feature spec's functional scenarios.

## 0. Where this comes from

Derived from the `design-taste-frontend` skill (`.agents/skills/design-taste-frontend/SKILL.md`),
adapted for this project. That skill is written for landing pages, portfolios, and marketing sites,
and its own §13 explicitly puts **dashboards, dense product UI, and multi-step forms out of scope**
— which is most of what this app is (a setup form, an expense form, a dashboard, settings). So this
file keeps only the parts of that skill that generalize to a small utility app — typography and
color discipline, form/state patterns, accessibility rules, dark-mode protocol, and the anti-AI-tell
copy rules — and drops everything landing-page-specific: heroes, marquees, bento grids, GSAP
scroll-hijacking, testimonials, the Motion/GSAP/icon-library defaults, and the redesign protocol.
Per [REFERENCE.md](REFERENCE.md) §2, this app has **zero UI/animation/icon dependencies** and adds
none without asking first — that constraint overrides any stack default the source skill assumes.

## 1. Principles

- **Minimal.** Confirmed requirement (OVERVIEW.md §2): "the app uses a minimal design style." When
  in doubt, remove an element rather than add one.
- **Calm, not expressive.** This is a personal finance tool used mid-trip, often one-handed, often
  in a hurry. Predictability beats visual flair.
- **Mobile-first.** Every screen is designed for a phone viewport first, then checked at `md`/`lg`.
  Touch targets ≥ 44px. No hover-only affordances.
- **Data speaks plainly.** Currency, dates, and totals are the content. Typography and spacing exist
  to make them scannable, not to decorate them.

### Dial reading (see source skill §1 for the scale)

| Dial               | Value | Why                                                                                                                                                                             |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DESIGN_VARIANCE`  | **2** | Symmetric, predictable layout. A budget tracker should feel dependable, not artsy — closer to the skill's "trust-first / public-sector" preset than any marketing preset.       |
| `MOTION_INTENSITY` | **2** | CSS `:active`/`:focus` transitions only. No scroll-triggered animation, no entrance choreography — there's no animation library in this repo and none should be added for this. |
| `VISUAL_DENSITY`   | **4** | "Daily App" band: standard mobile spacing, comfortable tap targets, not gallery-airy and not cockpit-dense.                                                                     |

Do not raise these dials for a feature without a reason tied to that feature's own spec.

## 2. Color

Tailwind v4 is CSS-first in this repo (no `tailwind.config.js`) — tokens are CSS custom properties
declared in [app/globals.css](app/globals.css) and mapped in `@theme inline`. Extend that same block;
don't hardcode hex values in components.

```css
:root {
  --background: #ffffff; /* page canvas */
  --surface: #f4f4f5; /* zinc-100 - cards, input backgrounds */
  --foreground: #171717; /* primary text */
  --muted: #71717a; /* zinc-500 — secondary text, helper text */
  --border: #e4e4e7; /* zinc-200 — hairlines, input borders */
  --accent: #0d9488; /* teal-600 — primary-button fill, borders, focus rings */
  --accent-text: #0f766e; /* teal-700 — accent used AS small/body text (links, active nav label) */
  --accent-foreground: #ffffff;
  --danger: #dc2626; /* red-600 — errors, over-budget. Passes 4.5:1 as text, so no separate -text token. */
  --warning: #d97706; /* amber-600 — warning fills/borders */
  --warning-text: #b45309; /* amber-700 — warning used as text */
  --success: #16a34a; /* green-600 — success fills/borders */
  --success-text: #15803d; /* green-700 — success used as text (e.g. "Exchange rate saved.") */
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --surface: #18181b; /* zinc-900 */
    --foreground: #ededed;
    --muted: #a1a1aa; /* zinc-400 */
    --border: #27272a; /* zinc-800 */
    --accent: #2dd4bf; /* teal-400 — lighter for dark-bg contrast */
    --accent-text: #2dd4bf; /* same value: already ≥4.5:1 on a near-black background */
    --accent-foreground: #0a0a0a;
    --danger: #f87171;
    --warning: #fbbf24;
    --warning-text: #fbbf24;
    --success: #4ade80;
    --success-text: #4ade80;
  }
}
```

Rules:

- **One accent color** (teal). It marks primary buttons, the active bottom-nav item, links, and
  focus rings — nothing else competes with it. Do not introduce a second brand color.
- **`--accent`/`--warning`/`--success` are fill/border tokens; `-text` variants exist because the
  fills, chosen for 3:1 large-scale contrast, fail 4.5:1 as small body text in light mode.** Any
  time one of these three colors is applied to `color` on running text (a link, an active nav
  label, an inline status line like "Exchange rate saved.") use the `-text` variant, not the base
  token — verified in this pass: base `--accent`/`--success`/`--warning` on `--background` sit at
  ~3.2–3.8:1 as light-mode text (fails AA), while the `-text` variants sit at ~5.0–5.5:1 (passes).
  `--danger` already passes 4.5:1 either way, so it has no `-text` counterpart. Use the base token
  as before for backgrounds, borders, and focus rings — those only need 3:1 (non-text UI contrast).
- **No pure black/white.** Already respected (`#0a0a0a` / `#ffffff`-on-`#171717` text) — keep it that
  way.
- **No AI-purple/blue-glow gradients, no neon outer glows.** Flat fills and hairline borders only.
- Semantic colors (`danger`/`warning`/`success`) are reserved for their meaning (over-budget, missing
  rate, saved) — never used decoratively.
- Every new component uses these tokens (`bg-[var(--surface)]`, or add matching `@theme inline`
  entries so plain utilities like `bg-surface` work) instead of ad hoc `zinc-600`/`black/[.08]`
  literals, so a future theme change is a one-file edit.
- **Category chart colors are a single-hue ramp, not a rainbow.** A category pie/legend (e.g. the
  dashboard's spending-by-category chart) varies only the *lightness* of the accent hue (~173°)
  across segments. An arbitrary hue-per-segment rainbow (`hsl(i * 360 / n, ...)`) reads as a second
  and third and fourth brand color and violates the one-accent-color rule above; category names are
  already in the legend text, so color only needs to be distinguishable, not identifying on its own.

## 3. Typography

- **Font:** Geist (sans) + Geist Mono, already wired via `next/font/google` in
  [app/layout.tsx](app/layout.tsx). Do not add another font or reach for Inter/serif — the skill's
  own override path for Inter ("neutral/standard feel") is already satisfied by Geist, and serif is
  explicitly wrong for a utility app.
- **Numbers get mono.** Every currency amount, date, and the trip-days count renders in
  `font-mono` (tabular figures, easier to scan and compare at a glance). Body text and labels stay
  `font-sans`.
- **Scale:** headings `text-xl`/`text-2xl font-semibold`, body `text-sm`/`text-base`, helper/meta
  text `text-xs text-[var(--muted)]`. No `text-4xl`+ display sizes anywhere — there is no hero, and
  oversized type on a phone just pushes content below the fold.
- **Currency format is fixed by the spec:** always `CODE amount`, e.g. `SGD 12.50` (OVERVIEW.md §2).
  Never a bare symbol, never amount-then-code.

## 4. Spacing & shape

- **Corner radius lock:** `rounded-lg` (8px) for cards, inputs, and buttons; `rounded-full` only for
  pills/badges (e.g. a category chip) and the bottom-nav active-state indicator. Nothing else gets a
  different radius.
- **Spacing scale:** `gap-2`/`gap-4` inside components, `py-6`/`py-8` between sections, `px-4` page
  gutters on mobile. Container stays `max-w-2xl mx-auto` (already set in `app/layout.tsx`) — do not
  widen it just because desktop has room; a wide single column reads better than a stretched form.
- **Dividers over cards.** Prefer `divide-y border-[var(--border)]` for lists (transaction list,
  category list) rather than wrapping every row in its own card with a shadow. Reserve a card/surface
  background for things that need real elevation (the dashboard summary block, a modal-style confirm
  dialog). The dashboard's total-spending block is the concrete example: `rounded-lg border
  border-[var(--border)] bg-[var(--surface)] p-4`, not a bare paragraph stack — it is the page's one
  hero number and reads as such.
- **Page section rhythm.** A page's own major sections (trip summary → total spending → budget →
  category chart → recent transactions) stack with a consistent `gap-6` on their shared flex wrapper,
  not one-off `pt-4`s per block re-derived on each page.
- **No drop shadows on light backgrounds** beyond a single subtle `shadow-sm`, and only where it
  communicates real elevation (e.g. a sticky bottom-nav bar). Skip shadows on inline elements.

## 5. Icons & imagery

- **No icon library is installed and none should be added without asking the user first**
  (REFERENCE.md §2: "raise adding a dependency with the user first; do not silently add packages").
  This overrides the source skill's icon-library defaults entirely.
- Default to **text labels**, exactly as `BottomNav` already does ("Home", "Add Expense",
  "Categories", "Settings") — no icon needed for a 4-item nav.
- If a future feature genuinely needs a glyph (e.g. a delete/trash action, a chevron), prefer a
  native HTML control or a single simple inline `<svg>` with one path, matched to the existing
  stroke-free, flat style. Do not hand-roll a set of decorative icons. If a screen seems to need more
  than a couple of one-off glyphs, stop and ask the user whether to add a small icon package instead
  of accumulating hand-drawn SVGs.
- **No photography, no illustration, no placeholder images.** There is no marketing surface in this
  app that needs a hero image or stock photo — every screen is data and a form.

## 6. Components & interaction states

- **Forms** (trip setup, record-expense, exchange rates): label above input, helper text present in
  markup even when empty, error text below the field, `gap-2` per input block. No placeholder-as-label.
- **Buttons:** one primary action per screen (`.btn-primary`: `bg-[var(--accent)]
  text-[var(--accent-foreground)]`), secondary actions as plain text or outline (`.btn-secondary`,
  `.btn-text`). `active:scale-[0.98]` for tactile feedback on tap. Verify text-on-background contrast
  before shipping any new button (WCAG AA, 4.5:1) — no white-on-white or borderless ghost buttons on
  a matching background. **Every clickable action renders through one of `.btn-primary`,
  `.btn-secondary`, `.btn-danger`, or `.btn-text` (`app/globals.css` `@layer components`) — never a
  bare unstyled `<button>`.** A bare button silently falls back to the browser's native chrome
  (different per OS/browser, no focus-ring/tap-scale consistency, breaks the one-accent-color
  system), which is a defect whenever it slips into a form or list row.
- **Links:** inline navigational text (`Edit trip`, `Back to home`) uses the `.link` utility
  (`app/globals.css`): `color: var(--accent-text)`, underline, `text-underline-offset`. Never bare
  `<Link>`/`<a>` text left to inherit the browser's default blue-and-underline, which clashes with
  the accent system.
- **Loading:** a skeleton shaped like the real content (e.g. gray bars where the dashboard's totals
  will render), not a generic spinner, for anything that reads from `localStorage` after mount and
  would otherwise paint blank on a cold server-rendered load. Build it from `components/Skeleton.tsx`
  (a static `bg-[var(--border)]` block) — no pulse/shimmer loop, since §7 bans looping animation.
  Applied to the home dashboard, the app's entry point and the one place a blank-then-populated flash
  is most visible; extend the same primitive to another route only if that route shows the same
  flash in practice, not preemptively.
- **Empty states:** every list (no expenses yet, no custom categories yet) gets a short, plain
  sentence saying what to do next — not just a blank area.
- **Errors:** storage failures surface inline, in plain language, per `lib/storage.ts`'s
  `SaveResult` contract (feature 012) — never a raw exception message.
- **Focus states:** visible focus ring using `--accent` on every interactive element; this is a
  form-heavy app navigated by keyboard as often as by touch.

## 7. Motion

- CSS `transition-colors`/`transition-transform` only, on hover/active/focus states. Nothing animates
  on load, on scroll, or in a loop.
- Anything above trivial (e.g. a future toast or a sheet transition) must respect
  `prefers-reduced-motion` and degrade to an instant state change.
- No scroll listeners, no parallax, no GSAP/Motion — none of that is installed, and this app has no
  surface that would justify adding it.

## 8. Copy tone

- Plain, functional sentences. No filler verbs ("elevate", "seamless", "unleash").
- No em-dash (`—`) or en-dash-as-separator anywhere in UI copy — use a period, comma, or hyphen.
- No fake-precise numbers in placeholder/example copy; if a number is illustrative, label it as such.
- Error and empty-state copy says what happened and what to do next, in one short sentence.

## 9. Resolved (previously known gaps)

- `app/globals.css` now declares the full §2 token set and applies `var(--font-geist-sans)` to
  `body`, so Geist is actually used.
- `app/layout.tsx` `metadata` now carries the app's real title and description.
- `BottomNav.tsx` now uses the `--border`/`--surface`/`--accent`/`--muted` tokens and marks the
  active item with `aria-current="page"` + `--accent` (`--accent-text` for the label color, per §2).
- **UI/UX polish pass (this pass):** the implementation had drifted from several rules this file
  already stated. Fixed:
  - Added `--accent-text`/`--success-text`/`--warning-text` tokens (§2) — the base fills failed
    4.5:1 as small text in light mode; verified by contrast math, not assumption.
  - Added `.link` and `.btn-text` utilities (§6) and swapped every bare `<button>`/unstyled `<Link>`
    in `ExpenseForm`, `CategoryManager`, `AddCategoryModal`, `ResetAppDataConfirm`,
    `app/settings/page.tsx`, and `app/expenses/[id]/page.tsx` onto the button/link system, so no
    control falls back to native browser chrome.
  - `CategoryPieChart` switched from a rainbow `hsl(i*360/n, ...)` ramp to a single-hue
    (~173°) lightness ramp, per the new §2 chart rule.
  - `Dashboard.tsx`'s total-spending block now sits in a `--surface` card per §4's elevation rule;
    page sections use a consistent `gap-6` wrapper instead of ad hoc `pt-4`s.
  - Added `components/Skeleton.tsx` and used it for the home dashboard's first paint, per §6 Loading.
  - `app/expenses/[id]/page.tsx` restyled from a flat paragraph stack to labelled rows (muted label,
    plain-language value), matching the dashboard's row convention, with the amount as the page's
    one large mono figure.
