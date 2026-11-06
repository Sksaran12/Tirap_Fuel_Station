# Tirap Fuel Station Manager

A complete daily register for the Tirap BPCL fuel station, built from
**PRD v1.1**. Implements milestones 2–4: owner login, the daily entry sheet
(F1–F17), close/reopen with audit, stock, expenses, credit, cash book,
dashboard, monthly report, CSV and print, plus a responsive layout from
1440px desktop down to a 390px phone.

The paper sheet of **24/10/2026 (TC-01)** is the acceptance case. It is
reproduced exactly — in the live browser preview and in the API — by
`shared/calc.js`, which both sides import.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, Vite 8, Tailwind CSS 3, React Router 7 |
| Backend | Express 5, Prisma 6, Zod 4, `bcryptjs` |
| Database | PostgreSQL in production (`NUMERIC(12,2)` for money); SQLite for local dev |
| Calculation | `shared/calc.js` — single source of truth for F1–F17 |
| Tests | `node:test` against the shared engine |

## Quick start

Requires **Node 20+**.

```bash
# 1. Frontend dependencies (project root)
npm install

# 2. Backend dependencies
cd backend
npm install

# 3. Local environment (Windows: use `copy`; macOS/Linux: `cp`)
copy .env.example .env

# 4. Create the dev database and seed the owner + masters
npx prisma db push
node src/seed.js
```

Run the two dev servers in **two terminals**:

```bash
# terminal 1 — API on http://localhost:4000
cd backend
npm run dev

# terminal 2 — app on http://localhost:5173
npm run dev
```

Open <http://localhost:5173> and sign in with **`owner` / `tirap12345`**
(seeded from `OWNER_USERNAME` / `OWNER_PASSWORD`).

The Vite dev server proxies `/api` to `localhost:4000`, so no CORS setup is
needed locally. Build the production bundle with `npm run build`; the API
serves `dist/` when it exists.

## Scripts

| Command | Where | What it does |
| --- | --- | --- |
| `npm run dev` | root | Vite dev server (app + `/leads/`) |
| `npm run build` | root | Production build into `dist/` |
| `npm run dev` | `backend/` | API with `node --watch` |
| `npm start` | `backend/` | API without watch |
| `npm run db:push` | `backend/` | Apply the Prisma schema |
| `npm run db:seed` | `backend/` | Create the owner and master data (idempotent) |
| `npm run db:studio` | `backend/` | Open Prisma Studio to inspect the database |
| `npm test` | `backend/` | TC-01 and calculation-engine tests |

## Environment

`backend/.env` (see `backend/.env.example`):

| Key | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `file:./dev.db` | SQLite path for local dev |
| `PORT` | `4000` | API port |
| `NODE_ENV` | `development` | Enables dev cookie rules |
| `APP_ORIGIN` | `http://localhost:5173` | Allowed browser origin |
| `SESSION_COOKIE` | `tirap_session` | Session cookie name |
| `OWNER_USERNAME` | `owner` | Seeded owner login |
| `OWNER_PASSWORD` | `tirap12345` | Seeded owner password |

Change the password from **Settings** after first login. There is no public
sign-up: the PRD specifies a single owner account.

### Database: how it is created and accessed

- The Prisma schema lives at `backend/prisma/schema.prisma` (21 tables). Money
  is `Decimal(12,2)`; the API converts decimal strings to numbers at the edge.
- `npx prisma db push` **creates** `backend/prisma/dev.db` and generates the
  client. `node src/seed.js` inserts the owner, nozzles, tanks, lubricant items
  and expense categories.
- Every request uses the singleton `PrismaClient` in `backend/src/db.js`; the
  API never talks to the database file directly.
- Inspect rows with `npm run db:studio` (Prisma Studio) or verify connectivity
  with `curl http://localhost:4000/api/health`. A healthy response is `200`
  with `db.status: "connected"` and a latency figure; a stopped or unreachable
  database returns `503`.
- **This machine has no PostgreSQL service, `psql` or Docker**, so the working
  dev database is SQLite. Switching is a one-line provider change; see below.

### Switching to PostgreSQL

1. Set the datasource in `backend/prisma/schema.prisma`:

   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Point `DATABASE_URL` at the database, e.g.
   `postgresql://user:password@localhost:5432/tirap`.
3. Run `npx prisma db push` (or `prisma migrate dev`) and `node src/seed.js`.

Money columns are declared `Decimal @db.Decimal(12, 2)` for PostgreSQL. SQLite
stores them as decimal strings; the API converts every value with `Number()`
at the boundary, so the UI and CSV output are identical on both engines.

## Features (milestones 2–4)

### Milestone 2 — access and daily entry

- **Login** with a single owner account; 30-minute rolling inactivity session.
  The `/login` screen is a premium split-screen layout with a dark brand panel
  and an elevated white card, 48px inputs, show/hide password, and a blurred
  animated success dialog that holds for 1.5 seconds before opening
  `/dashboard`.
- **Lockout** for 15 minutes after 5 consecutive failures; a successful login
  clears the counter. Reset a locked account with the developer script
  (`node src/reset-owner.js` — see *Maintenance*).
- **Daily entry** (`/day`): business-date navigation, per-product rates,
  F1 meter sales with rollover/replacement handling, F2 A/C sale, F3 total
  sale, F4 fuel amount (paper rounding by default), F5 R/F litres and value,
  F6 lubricants, F7 online receipts, POS, bank deposit, expenses, credit and
  counted cash. A live preview runs the same `computeDay()` the server uses.
- **F8–F10 stock** lives on `/stock`: tank opening, receipts, physical dip,
  closing stock and stock value, with variance alerts.
- **F11–F16 cash chain** is reconciled on the entry screen and shown again in
  the **Cash Book**.
- **Save**, then **Close**. A closed day rejects edits with `409` until it is
  **reopened**; every save, close, reopen and edit writes an audit row.

### Milestone 3 — supporting registers

- **Stock** — tanks, dips, receipts, opening/closing stock and valuation.
- **Expenses** — running vs one-off, categories, totals.
- **Credit** — parties, credit given/received, outstanding balances, limits.
- **Cash Book** — day-by-day F11 → F16 chain and difference.
- **Dashboard** — today/month status, sales, cash position, recent days.

### Milestone 4 — reporting and operations

- **Monthly report** — month register, per-day totals, product split, CSV.
- **Print** — print-only masthead and hidden chrome; `window.print()`.
- **Settings** — station details, rounding mode, stock valuation, variance
  limit, expense categories, lubricant items, owner password.
- **Audit trail** — every day action with timestamp and before/after state.
- **Responsive shell** — 280px sidebar ≥1024px, 72px icon rail 768–1023px,
  off-canvas drawer <768px; 67px header; tables scroll inside their card so
  the page never overflows at 390px.
- **Footer** — a compact station footer with report and settings shortcuts on
  screen, and a print-only masthead line in reports.

## TC-01 walkthrough (24 Oct 2026)

1. Seed a fresh database, then open **Daily Entry**.
2. Set the business date to **24/10/2026**. Enter yesterday's closing cash
   **63,374** on 23/10 if starting empty, or use *carried opening cash*.
3. Enter the sheet:

| Field | MS | HSD |
| --- | --- | --- |
| Rate (₹/L) | 99.66 | 89.08 |
| Nozzle sales (L) | 248, 541, 165, 32 | 604, 630, 110, 112 |
| R/F (L) | 56 | 86 |
| Tank opening (L) | 15,400 | 10,300 |
| Physical dip (L) | 14,470 | 8,930 |

| Other field | Value |
| --- | --- |
| Lubricants | M-oil 1L × 1 @ 230, M-oil 1.2L × 1 @ 350 |
| Online receipts | 145,669 + 15,143 |
| POS | 13,300 |
| Running expenses | 5,000 + 13,400 + 5,000 + 6,500 + 5,000 + 102 |
| Credit given | 41,095 |
| Credit received (cash) | 6,000 |
| Bank deposit | 0 |
| Cash counted | 34,467 |

4. Expected result (paper rounding):

| Figure | Value |
| --- | --- |
| Meter sale F1 | 986 / 1,456 L |
| A/C sale F2 | 930 / 1,370 L |
| Fuel amount F4 | ₹92,683 / ₹1,22,039 |
| R/F value F5 | ₹5,580 / ₹7,660 |
| Total fuel + R/F | ₹2,14,722 + ₹13,240 |
| Closing stock F8 | 14,470 / 8,930 L |
| Opening value F9 | ₹15,34,764 / ₹9,17,524 |
| Closing value F10 | ₹14,42,080 / ₹7,95,484 |
| Lubricants F6 | ₹580 |
| Expenses F13 | ₹35,002 |
| Net cash F12 | −₹29,487 |
| Total cash F16 | ₹34,467 |
| R/F + cash F14 | ₹47,707 |
| Difference | ₹0 |

`backend/test/tc01.test.js` asserts every one of these numbers, plus paper
vs exact rounding, R/F validation, meter rollover/replacement and profit.

```bash
cd backend
npm test
```

## Project layout

```text
├─ src/                    React app
│  ├─ pages/               Login, DailyEntry, Dashboard, Stock, Credit,
│  │                       Expenses, CashBook, Reports, Settings
│  ├─ layout/              AppLayout, Sidebar (responsive shell)
│  ├─ components/          ui primitives, DateNav, BPCL lockup
│  ├─ context/             AuthContext, DayContext
│  └─ lib/                 api client, formatters, useResource
├─ shared/calc.js          F1–F17 engine (browser + API)
├─ backend/
│  ├─ prisma/schema.prisma 21 tables, money as Decimal(12,2)
│  ├─ src/                 auth, day, modules, seed, error handling
│  └─ test/tc01.test.js    acceptance tests
├─ leads/index.html        standalone Yu Studio CRM leads screen
├─ public/                 BPCL dealer logo stand-in
└─ design.md               layout contract
```

## Data ownership

To avoid double-writing, each figure has one owner:

- **Daily Entry** — meters, rates, R/F, lubricants, online/POS, bank,
  counted cash.
- **Stock** — tank openings, dips, receipts.
- **Expenses** — all expense rows.
- **Credit** — party transactions.

Daily Entry shows the totals from the other modules read-only, with links to
edit them at the source.

## Maintenance

- **Unlock the owner** after repeated failed logins:

  ```js
  // backend/src/reset-owner.js
  import 'dotenv/config'
  import { prisma } from './db.js'

  await prisma.user.updateMany({
    data: { failedAttempts: 0, lockedUntil: null },
  })
  await prisma.session.deleteMany()
  await prisma.$disconnect()
  ```

  Run `node src/reset-owner.js` from `backend/`.

- **Reset the demo database** (Windows): stop the API, delete
  `backend/prisma/dev.db`, then `npx prisma db push` and `node src/seed.js`.
- **Reopen a day** only from the UI; reopening is refused while a later day
  is closed, protecting the F14 cash chain. Every action is audited.

## Known PRD open items

These are called out rather than silently guessed:

1. **Reopen cascade** — the PRD does not say what happens to later days.
   Reopening is blocked while a later closed day exists.
2. **Business-date cut-off** — no rule for when a trading day ends; the owner
   chooses the business date explicitly.
3. **Stock-value floors** — per-product values are floored to whole rupees,
   so the sum of product values can differ by ₹1–2 from a single total.
   The report shows the per-product figures.
4. **en-IN formatting** — the PRD shows Indian grouping; the UI uses `en-IN`
   and the CSV exports plain numbers for spreadsheet import.
5. **Profit (F17)** — needs per-product margins and cost rates, which the
   PRD leaves to the dealer. The engine supports them; they default to 0 and
   the dashboard labels profit as unavailable until they are supplied.

## Logo

`public/bpcl-logo.svg` and `src/components/BpclLogo.jsx` are a hand-drawn
dealer stand-in, not official BPCL artwork. Replace them with the official
files from BPCL's dealer brand kit before going live.
