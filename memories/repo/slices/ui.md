# Slice — [UI]

`components/*.tsx` — presentational and interactive client components. A component owning state or handlers is `'use client'`. Components call domain modules; they never touch `localStorage`.

## Design system (design.md governs look; a feature spec governs behavior)

Minimal, calm, mobile-first. Predictable over flashy. Touch targets ≥44px. No hover-only
affordances.

- **Color tokens** in `app/globals.css` (`@theme inline`): `--background`, `--surface`,
  `--foreground`, `--muted`, `--border`, `--accent` (teal, the only accent), `--danger`, `--warning`,
  `--success`. Use `bg-(--surface)` / `text-(--muted)`, never hardcoded hex or zinc literals. All
  nine exist, and light/dark/system theming is live.
- **Buttons** — use the shared `globals.css` classes `btn-primary` (accent fill), `btn-secondary`
  (outline), `btn-danger` (destructive). They already encode token colors, `rounded-lg`, 44px min
  height, and `active:scale-[0.98]`. Do not restyle buttons inline. One primary action per screen.
- **Forms** — label above input, helper text present even when empty, error below the field, `gap-2`
  per block. `globals.css` already gives fields their surface/border treatment and focus ring.
- **Roles** — `role="alert"` for blocking errors (auto-colored `--danger`); `role="status"` for
  non-blocking warnings/confirmations. A confirmation (e.g. "Link copied.", "Exchange rate saved.")
  is `className="text-sm text-(--success-text)"`; a non-blocking warning (e.g. Dashboard's missing-
  exchange-rate note) is `className="text-sm text-(--warning-text)"` — note the real token names are
  `--success-text`/`--warning-text`, not bare `--success`/`--warning`. A purely informational
  `role="status"` note with no error/caution connotation (e.g. `ExpenseForm.tsx`'s
  out-of-trip-range date note) may skip the color class entirely.
- **Typography** — Geist sans + Geist Mono; numbers (currency, dates, counts) use `font-mono`.
  Headings `text-xl`/`text-2xl font-semibold`; body `text-sm`/`text-base`; helper `text-xs
  text-(--muted)`.
- **Spacing/shape** — `rounded-lg` everywhere; `rounded-full` only for pills. `gap-2`/`gap-4`
  inside components. Prefer `divide-y divide-(--border)` lists over per-row cards.
- **Empty states** — every list gets a short plain sentence saying what to do next.
- **No icon library.** Text labels by default; don't add an icon package without asking.
- **Copy tone** — plain functional sentences, no filler verbs. **No em dash or en-dash-as-separator
  in UI copy** — use a period, comma, or hyphen. No fake-precise example numbers.
- **Motion** — `transition-colors`/`transition-transform` on hover/active/focus only. Nothing
  animates on load or scroll.

Anything a compiler cannot see is verified by a Playwright spec in `e2e/`, never a manual
checklist. A modal must paint above the fixed `BottomNav` (`z-50`).
