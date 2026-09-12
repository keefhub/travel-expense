# Slice — [Route]

`app/**/page.tsx` — App Router entries. Routes that touch storage are `'use client'`.

Current routes: `/` (setup form when no trip, dashboard when one exists), `/expenses/new`,
`/expenses/[id]`, `/trip/edit`, `/trip/new`, `/categories`, `/settings`. Root layout wires Geist
fonts, a `max-w-2xl` container, and `BottomNav`.

## The trip-gating pattern every nav destination uses

Read the trip through `useSyncExternalStore` over a per-mount store, redirect when it's absent, and
render nothing until the read resolves:

```tsx
const [store] = useState(createTripStore);
const trip = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);

useEffect(() => {
  if (trip === null) router.replace("/");
}, [trip, router]);

if (trip === undefined || trip === null) return null;   // undefined = not yet read (SSR)
```

`getServerSnapshot()` returns `undefined` so SSR renders nothing rather than reading
`localStorage`. Do **not** replace this with `useEffect` + `setState` — it trips
`react-hooks/set-state-in-effect`.

Rules:

- A route task mounts an existing component and gates it. It does not contain business logic — that
  belongs in a `[Domain]` task, and the markup in a `[UI]` one.
- Adding or removing a route changes the build's route table, so a `[Route]` task is one of the few
  that must run `npm run build` (see `.claude/repo-profile.md`).
- Update `REFERENCE.md` §4's file tree in the same commit when a route is added or removed.
- Playwright specs must seed `localStorage` via `page.addInitScript` **before** the first render, or
  the redirect above fires and the page never appears.
