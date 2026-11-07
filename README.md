# Tirap Fuel Station Manager

A complete daily register for the Tirap BPCL fuel station, built from
**PRD v1.1**. Implements milestones 2–4: owner login, the daily entry sheet
(F1–F17), close/reopen with audit, stock, expenses, credit, cash book,
dashboard, monthly report, CSV and print, plus a responsive layout from
1440px desktop down to a 390px phone.

The paper sheet of **24/10/2026 (TC-01)** is the acceptance case. It is
reproduced exactly — in the live browser preview and in the API — by the
server-side engine in `backend/src/utils/calculator.js`. The browser imports a
thin re-export for the preview only; every stored figure is recalculated by the
API and saved inside a database transaction.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | React 18, Vite 8, Tailwind CSS 3, React Router 7 |
| Backend | Express 5, Prisma 6, Zod 4, `bcryptjs` |
| Database | PostgreSQL 14+ (`NUMERIC(12,2)` money, `NUMERIC(12,3)` volume, JSONB totals) |
| Calculation | `backend/src/utils/calculator.js` — server-authoritative F1–F17 |
| Tests | `node:test` against the calculator + a live PostgreSQL API smoke test |

## Quick start

Requires **Node 20+** and **PostgreSQL 14+** (17 or 18 recommended).

```bash
# 1. Frontend dependencies (project root)
npm install

# 2. Backend dependencies
cd backend
npm install

# 3. Local environment (Windows: use `copy`; macOS/Linux: `cp`)
copy .env.example .env

# 4. Create the role + database, write DATABASE_URL, push the schema, seed
npm run db:setup
```

`db:setup` asks for the PostgreSQL superuser password (usually the one chosen
when you installed PostgreSQL) and does the rest:

- creates the login role `tirap` with a generated strong password;
- creates the database `tirap` owned by that role;
- writes `DATABASE_URL="postgresql://tirap:…@localhost:5432/tirap?schema=public"`
  into `backend/.env`;
- runs `prisma generate`, `prisma db push` and `node src/seed.js`.

The superuser password is never written to disk. If you prefer to create the
database yourself, see [Database setup](#database-setup-postgresql) below.

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
| `npm run db:setup` | `backend/` | Create the PostgreSQL role/database, write `.env`, push and seed |
| `npm run db:push` | `backend/` | Apply the Prisma schema |
| `npm run db:seed` | `backend/` | Create the owner and master data (idempotent) |
| `npm run db:studio` | `backend/` | Open Prisma Studio to inspect the database |
| `npm run check:tc01` | `backend/` | Recompute TC-01 from the live database and compare |
| `npm run check:r2` | `backend/` | Verify R2 credentials, bucket and CORS preflight |
| `npm run uploads:cleanup` | `backend/` | Delete `pending` uploads older than 24 hours |
| `npm test` | `backend/` | TC-01 and calculation-engine tests |

## Environment

`backend/.env` (see `backend/.env.example`):

| Key | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://tirap:…@localhost:5432/tirap?schema=public` | PostgreSQL connection string |
| `PORT` | `4000` | API port |
| `NODE_ENV` | `development` | Enables dev cookie rules |
| `APP_ORIGIN` | `http://localhost:5173` | Allowed browser origin |
| `SESSION_COOKIE` | `tirap_session` | Session cookie name |
| `OWNER_USERNAME` | `owner` | Seeded owner login |
| `OWNER_PASSWORD` | `tirap12345` | Seeded owner password |

Change the password from **Settings** after first login. There is no public
sign-up: the PRD specifies a single owner account.

### Database setup (PostgreSQL)

The datasource is PostgreSQL. `backend/prisma/schema.prisma` declares 19 tables
with strict `Decimal` columns — `Decimal(12,2)` for money and rates,
`Decimal(12,3)` for litres — plus JSONB for the calculated day snapshot. There
are no `Float` columns and no `station_id` (V1 is a single-pump deployment).

#### Option A — the setup script (recommended)

```powershell
cd backend
npm run db:setup
```

The script:

1. finds `psql.exe` under `C:\Program Files\PostgreSQL\<version>\bin`;
2. prompts for the **PostgreSQL superuser** password (`postgres`) without
   echoing it — or uses `PGPASSWORD` if already set;
3. creates or updates the login role `tirap` with a generated 28-character
   password;
4. creates the database `tirap` owned by `tirap` (existing data is kept);
5. writes `DATABASE_URL` into `backend/.env`;
6. runs `prisma generate`, `prisma db push` and the seed.

Optional flags: `-Database`, `-AppUser`, `-DbHost`, `-Port`, `-SkipPush`,
`-SkipSeed`. Example against a non-default port:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-postgres.ps1 -Port 5433
```

#### Option B — do it by hand

Open **SQL Shell (psql)** from the Start menu (or run
`"C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres`) and run:

```sql
CREATE ROLE tirap LOGIN PASSWORD 'choose-a-strong-password';
CREATE DATABASE tirap OWNER tirap ENCODING 'UTF8';
\c tirap
ALTER SCHEMA public OWNER TO tirap;
GRANT ALL ON SCHEMA public TO tirap;
```

Then put this line in `backend/.env`:

```dotenv
DATABASE_URL="postgresql://tirap:choose-a-strong-password@localhost:5432/tirap?schema=public"
```

and run:

```bash
npx prisma generate
npx prisma db push
node src/seed.js
```

#### What each part of `DATABASE_URL` means

```text
postgresql://tirap:PASSWORD@localhost:5432/tirap?schema=public
│           │     │       │         │    │      │
│           │     │       │         │    │      └─ schema searched by Prisma
│           │     │       │         │    └─ database name
│           │     │       │         └─ PostgreSQL port
│           │     │       └─ host (the "server")
│           │     └─ role password
│           └─ role / username
└─ protocol (use postgresql://, not file:)
```

- `localhost` (or `127.0.0.1`) is the server; `5432` is the port the PostgreSQL
  service listens on. Both come from the installer defaults.
- `tirap` appears twice: once as the **role** and once as the **database**.
- If the password contains `@ : / ? # %` or a space, URL-encode it
  (`@` → `%40`, `#` → `%23`, `%` → `%25`). The generated password avoids these
  characters entirely.
- Keep the URL in `backend/.env`; that file is gitignored.
- The Prisma CLI reads `.env` automatically. The API reads it through
  `import 'dotenv/config'` in `src/db.js`.

#### Verifying the connection

```bash
curl http://localhost:4000/api/health
```

A healthy response is `200` with `db.engine: "PostgreSQL"`,
`db.status: "connected"` and a latency figure. A stopped server, wrong password
or missing database returns `503`. `npm run db:studio` opens Prisma Studio.

All requests share the singleton `PrismaClient` in `backend/src/db.js`; row
values arrive as `Decimal` objects and are converted with `num()` only at the
response boundary. Calculated totals are stored as JSONB in
`daily_reports.totals`.

## File uploads (Cloudflare R2)

Uploads are optional. Files never pass through the Node process:

1. `POST /api/uploads/presign` validates the request, **creates a `pending`
   `documents` row with a server-generated key**, and returns a 5-minute signed
   `PUT` URL.
2. The browser sends the bytes straight to R2 with the same `Content-Type`.
3. `POST /api/uploads/confirm` (body: `{ id }`) calls `HeadObject`, checks the
   real size, type and magic bytes, then flips the row to `ready`.

`pending` rows mean "the browser asked but never proved it uploaded". They are
invisible to `GET /api/uploads` and are removed after 24 hours:
`npm run uploads:cleanup` (add `--dry-run` to inspect).

Set these in `backend/.env` (or the Render dashboard). Never prefix them with
`VITE_` — those variables are compiled into the public bundle.

```dotenv
CF_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=tirap-docs
```

`npm run check:r2` verifies the variables, the bucket and the browser CORS
preflight in one shot. Without all four variables the upload routes return
`503` instead of signing a URL against `undefined`.

The bucket must stay **private**. The browser talks to a different origin, so
the bucket needs a CORS policy that allows `PUT` from `APP_ORIGIN`; see
`infra/r2/README.md` and apply it with `npm run r2:cors`.

Use on Render:

| Setting | Value |
| --- | --- |
| Cleanup job (optional) | `node backend/scripts/cleanup-uploads.mjs` |
| Disk | none — R2 replaces it |

The cleanup script loads `backend/.env` itself, so it works from the repo root as
written. Render cron jobs need a paid instance type; on the free plan run it
manually (or from any external scheduler). It is housekeeping only — it deletes
`pending` rows that were never confirmed, and the app never depends on it.

## Deploy: Render + Supabase

```text
Browser ──HTTPS──► Render web service (node backend/src/index.js)
                     │  serves dist/ and /api on the same origin
                     ├──► Supabase Postgres (shared pooler, session mode, :5432)
                     └──► Cloudflare R2 (presigned PUT/GET, private bucket)
```

One Render web service serves both the API and the built app, so the session
cookie, CORS and CSV downloads all stay same-origin. The database is **not** on
Render. `render.yaml` in the repo root is a Blueprint for exactly this shape.

### 1. Create the Supabase database

1. Create a project at <https://supabase.com/dashboard>. Choose the region
   closest to your Render region (India → `ap-southeast-1` / Singapore).
2. Wait for provisioning, then open **Connect**.
3. Copy the **Session pooler** string. It looks like:

```text
postgresql://postgres.<PROJECT-REF>:<PASSWORD>@aws-0-<REGION>.pooler.supabase.com:5432/postgres
```

4. Append the Prisma query parameters:

```text
.../postgres?schema=public&sslmode=require
```

> **Do not use the direct host** `db.<PROJECT-REF>.supabase.co`. It resolves to
> IPv6 only, and Render has no outbound IPv6, so the connection times out even
> with correct credentials. The shared pooler is IPv4 and works on every plan.
>
> The pooler host tells you the project's region (`aws-0-ap-northeast-1` = Tokyo).
> Pick the closest Render region:

| Supabase pooler region | Render region |
| --- | --- |
| `ap-northeast-1`, `ap-southeast-1`, `ap-southeast-2` | `singapore` |
| `us-east-1`, `us-east-2` | `virginia` or `ohio` |
| `us-west-1`, `us-west-2` | `oregon` |
| `eu-central-1`, `eu-west-1`, `eu-west-2` | `frankfurt` |
>
> Session mode (5432) is right for this app: one long-lived Express process,
> prepared statements stay enabled, and `prisma db push` works through it.
> Transaction mode (6543) would need `?pgbouncer=true&connection_limit=1` and a
> separate `DIRECT_URL` for the CLI. Only switch if you autoscale.

### 2. Verify it locally first

Put the Supabase string in `backend/.env` as `DATABASE_URL`, then:

```powershell
cd backend
npx prisma db push
npm run db:seed
npm run check:tc01
```

`db push` creates the tables in Supabase. `db:seed` creates the owner account
and the nozzle/tank/lube masters. `check:tc01` proves the server-side
calculations run against the real database.

If the password contains `@ : / ? # %` or a space, URL-encode it
(`@` → `%40`, `#` → `%23`, `%` → `%25`).

### 3. Create the Render service

**Blueprint (recommended):** push the repo, then in Render choose
**New → Blueprint**, select the repo, and Render reads `render.yaml`.
It asks for the `sync: false` values.

**Manual:** New → Web Service, then:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Region | same continent as Supabase (India → Singapore) |
| Build command | `npm ci && cd backend && npm ci && npx prisma generate && cd .. && npm run build` |
| Start command | `node backend/src/index.js` |
| Health check path | `/api/health` |
| Disk | none (R2 replaces it) |

Environment variables:

| Key | Value |
| --- | --- |
| `NODE_VERSION` | `22.23.2` |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the Supabase **session pooler** string |
| `APP_ORIGIN` | `https://<service>.onrender.com` (or the custom domain), no trailing slash |
| `SESSION_COOKIE` | `tirap_session` |
| `OWNER_USERNAME` | `owner` |
| `OWNER_PASSWORD` | a strong password — not `tirap12345` |
| `CF_ACCOUNT_ID` / `R2_*` | optional, for uploads |

Never put any of these in a `VITE_*` variable; those are compiled into the
public bundle.

### 4. First deploy

The first deploy starts the API but the Supabase tables may not exist yet.
Open **Render → your service → Shell** and run once:

```bash
cd backend
npx prisma db push
npm run db:seed
```

Then reload `https://<service>.onrender.com/api/health`:

```json
{ "ok": true, "service": "tirap-api",
  "db": { "engine": "PostgreSQL", "status": "connected", "latencyMs": 42 } }
```

Open the site, sign in with `OWNER_USERNAME` / `OWNER_PASSWORD`, and change the
password in **Settings** immediately. Seeded credentials are a break-glass
account, not a shipping password.

### 5. Point R2 CORS at the live origin

The bucket must allow the browser to PUT to it from the deployed origin:

```powershell
$env:CLOUDFLARE_API_TOKEN = '<Cloudflare API token>'
$env:CF_ACCOUNT_ID        = '<account id>'
$env:R2_BUCKET            = 'tirap-docs'
$env:APP_ORIGIN           = 'https://<service>.onrender.com'
npm run r2:cors
```

Verify with `cd backend; npm run check:r2`. If a custom domain is added later,
re-run with the new origin (`--extra-origin` adds a second one).

### 6. Optional: frontend on Vercel

The Render service already serves `dist/`, so a separate Vercel project is
optional. If you add one, **do not point the browser directly at Render**: the
session cookie is `SameSite=Lax`, so a cross-site `fetch` would not send it —
login would look successful and every later call would return `401`.

Proxy `/api` through Vercel instead, which keeps the browser same-origin:

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://<service>.onrender.com/api/:path*" }
  ]
}
```

- Leave `VITE_API_URL` unset; the client already defaults to `/api`.
- Set `APP_ORIGIN` on Render to `https://<app>.vercel.app` and add the Render
  host as a second R2 origin:
  `npm run r2:cors -- --extra-origin https://<service>.onrender.com`.
- The first request after idle can take ~30 s on Render's free plan (cold start).

### 7. Things that will bite

| Symptom | Cause / fix |
| --- | --- |
| `P1001: Can't reach database server` | Direct `db.<ref>.supabase.co` host on Render → switch to the pooler |
| `P1000: Authentication failed` | Wrong password, or the pooler username is `postgres` instead of `postgres.<ref>` |
| `prepared statement "s0" already exists` | You used transaction mode without `?pgbouncer=true` |
| Health `503`, logs show DB errors | Supabase project paused (free tier pauses after ~7 days idle) — restore it in the dashboard |
| Login works, then 401 after ~30 min | Expected: rolling 30-minute inactivity session |
| `db push` asks to reset the database | You pointed it at the wrong project. Stop and check the ref in the URL |
| `Invalid prisma.document invocation` after deploy | `prisma generate` was skipped in the build command |

Supabase free tier: project pauses after ~7 days without activity and has a
500 MB database limit. Enable **Scheduled backups** (Pro) or run a weekly
`pg_dump` to R2 before handing the app to the client.

### Prisma only — no `supabase-js` in this app

Supabase's quickstart uses `VITE_SUPABASE_URL` + a publishable key and queries
tables from the browser. **Do not add that here.** In Tirap the browser is a
view; the server owns every rule:

| Bypassed by a browser Supabase client | Why it must stay on the server |
| --- | --- |
| F1–F17 calculation | `backend/src/utils/calculator.js` is the single source of truth |
| Daily save | one atomic transaction; partial writes must roll back |
| Closed day | `409` guard stops edits after closing |
| Sessions | opaque HttpOnly cookie, 30-minute rolling expiry |
| Audit log | every write is recorded server-side |
| Uploads | presigned URLs are minted only for authenticated sessions |

A browser client would need Row Level Security written and tested for all 20
tables just to reach parity, and it would still not reproduce the calculator or
the atomic day save. Supabase is used here as **managed PostgreSQL only**.

The publishable/anon key is not a database password. It cannot replace
`DATABASE_URL`, and Prisma cannot use it.

## Server-authoritative calculation


The browser is a view, not a source of truth. `backend/src/utils/calculator.js`
owns formulas F1–F17; `shared/calc.js` only re-exports it so the live preview
matches the stored result.

`PUT /api/day/:date` (`backend/src/day.js`) runs this pipeline:

1. **Zod validates** the raw payload — rates, readings, R/F, lubricants, online
   receipts, POS, bank deposit, counted cash, and optional `expenses` /
   `credits` arrays.
2. **Lock check** — if the day is already `closed`, the API returns
   **`409 Conflict`** and writes nothing.
3. **Previous context from PostgreSQL** — the last closed day is reloaded and
   recomputed; its `cash.total` and per-product `closingStock` become today's
   opening cash and stock. Client-supplied opening balances are ignored.
4. **Calculation** — `computeDay()` returns meter sale (F2), A/C sale (F3),
   fuel amount (F4), R/F value (F5), lubricants (F6), total fuel (F7), closing
   stock (F8), stock values (F9), variance (F10), net cash (F11), total cash
   (F12), difference (F13), R/F + cash (F16) and daily profit (F17). Money is
   `Math.floor`-ed to whole rupees before totals when
   `settings.rounding = "paper"`.
5. **Atomic save** — `prisma.$transaction` writes the report header, rates,
   readings, product days, lubricants, online receipts and any linked expenses
   and credit rows together, recomputes from the rows just written, then stores
   the snapshot in `daily_reports.totals` (JSONB). Any error rolls the whole
   day back; impossible inputs (closing meter below opening without a rollover,
   R/F above meter sale) return **`422`**.

Closing a day recomputes and freezes its totals, and refuses while an earlier
day is still open. Reopening is refused while a later day is closed, protecting
the F14 cash chain.

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
2. Set the business date to **24/10/2026**. To reproduce the sheet exactly,
   close 23/10/2026 with a carried balance of **₹63,374** (or insert a closed
   `daily_reports` row for 23/10 with `previous_balance = 63374`). The server
   always takes opening cash and stock from the last closed day — it never
   reads them from the browser.
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
| Closing value F9 | ₹14,42,080 / ₹7,95,484 |
| Lubricants F6 | ₹580 |
| Expenses (total) | ₹35,002 |
| Net cash F11 | −₹29,487 |
| Total cash F12 | ₹34,467 |
| R/F + cash F16 | ₹47,707 |
| Difference F13 | ₹0 |

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
├─ shared/calc.js          Browser-side re-export of the server engine (preview)
├─ backend/
│  ├─ prisma/schema.prisma 20 tables; Decimal(12,2) money, Decimal(12,3) volume
│  ├─ scripts/             setup-postgres.ps1 (role + DB + .env + push + seed)
│  ├─ src/
│  │  ├─ utils/calculator.js  authoritative F1–F17 engine
│  │  ├─ day.js             daily save/close/reopen + atomic transaction
│  │  ├─ modules.js         stock, expenses, credit, reports, dashboard
│  │  └─ auth.js, db.js, index.js, seed.js
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

- **Reset the demo database**: stop the API, drop and recreate the database
  (or run `npm run db:setup` again), then `npx prisma db push` and
  `node src/seed.js`. `prisma db push` never drops existing data by itself.
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
