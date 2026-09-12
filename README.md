# Travel Expense Tracker

A mobile-first, offline-capable travel expense tracker. No backend, no database, no API
routes — all state lives in the browser's `localStorage`, so the app works offline once
loaded. One active trip at a time; creating a new trip deletes the previous one after
confirmation.

## Features

- Trip setup with country → currency mapping and an optional budget
- Edit the active trip or start a new one
- Record expenses in multiple currencies
- Manual exchange rates
- Expense categories (defaults + custom)
- Home dashboard with total spend, budget, and pie chart
- Export expenses to CSV
- Reset app data
- Mobile-responsive navigation

## Tech stack

| Thing           | Choice                                        |
| --------------- | --------------------------------------------- |
| Framework       | [Next.js](https://nextjs.org) 16 (App Router) |
| UI library      | React 19                                      |
| Language        | TypeScript 5 (`strict`)                       |
| Styling         | Tailwind CSS v4                               |
| Linting         | ESLint 9 flat config (`eslint-config-next`)   |
| Persistence     | Browser `localStorage` (no backend)           |
| Package manager | npm                                           |

Runtime dependencies are only `next`, `react`, and `react-dom`.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

```bash
npm run dev     # start the development server
npm run build   # production build (also the type-check gate)
npm run lint    # run ESLint
npm start       # start the production server
```

There is no separate `typecheck` script — `npm run build` catches type errors.

## Project structure

```
app/          # App Router routes
components/   # shared UI
lib/          # domain logic + localStorage persistence
features/     # feature specifications (source of truth)
doc/          # generated specs, plans, and logs
```

Architecture details, domain rules, and the agent workflow are documented in
[`REFERENCE.md`](REFERENCE.md) and [`AGENTS.md`](AGENTS.md).
