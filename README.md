# Wayfare

| Part     | Stack             | Hosted on | Folder      |
| -------- | ----------------- | --------- | ----------- |
| Frontend | React + Vite      | Vercel    | `frontend/` |
| Backend  | FastAPI (Python)  | Render    | `backend/`  |

```
.
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app + CORS
│   │   ├── core/config.py       # env-based settings
│   │   ├── data/                # committed seed JSON/CSV served by the API
│   │   ├── services/            # logic behind routes (seed loader; scoring/forecasting later)
│   │   └── api/
│   │       ├── router.py        # register new routers here
│   │       └── routes/          # one file per feature
│   ├── scripts/                 # offline dataset/seed builders (not deployed); see docs/data-dictionary.md
│   ├── tests/                   # pytest
│   └── requirements.txt         # runtime; requirements-dev.txt adds pytest
├── frontend/
│   ├── src/
│   │   ├── components/          # one file per page; ui.jsx holds shared pieces
│   │   ├── data/                # static data (destinations, navigation, feature info)
│   │   ├── lib/                 # api.js, useApi.js, format.js, search.js, chart.js
│   │   ├── workspace.css        # shared workspace styles
│   │   └── App.jsx              # router only; pages are lazy-loaded
│   └── vercel.json              # SPA rewrites
└── render.yaml                  # Render blueprint for the backend
```

## Run locally

```bash
# backend (http://localhost:8000, docs at /docs)
cd backend && pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload

# frontend (http://localhost:5173)
cd frontend && npm install && npm run dev
```

## Test

```bash
cd backend && python -m pytest        # includes inventory API + CSV import tests
cd frontend && npm test            # unit tests + a smoke test that renders every route
cd frontend && npm run report:images   # lists stock photo IDs reused across destinations
```

## Environment

| Variable | Where | Purpose |
| --- | --- | --- |
| `FRONTEND_URL` | backend (Render) | Comma-separated allowed origins, e.g. your Vercel URL |
| `CORS_ORIGIN_REGEX` | backend, optional | Also allow Vercel preview URLs |
| `VITE_API_URL` | frontend (Vercel) | Base URL of the backend, no trailing slash |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | backend (Render) | PayPal **sandbox** app credentials. Without them payment endpoints return 503 |
| `GEMINI_API_KEY` | backend (Render), optional | Google AI Studio key. Enables Gemini in the advisor; without it the advisor is rule-based |
| `GEMINI_MODEL` | backend, optional | Gemini model id (default `gemini-2.5-flash`); change it if Google retires that one |
| `DEPOSIT_PCT` | backend, optional | Percent of the trip price charged up front (default 30) |
| `BOOKINGS_DB` | backend, optional | SQLite path for bookings (default: OS temp dir, lost on restart) |

Render's free plan sleeps when idle; the first API call can take about a minute, and the UI shows a "waking the server" state instead of an error.

## Data

Everything shown in the workspace is sample data (see `backend/app/data/`). Nothing is a live booking, rate or forecast.

## Inventory (feature 1)

`/app/inventory` is live: filters synced to the URL, table and map views, and an item drawer with a rate chart.
Data is a labelled sample (see [`docs/data-dictionary.md`](docs/data-dictionary.md)); the slots that later features fill are in
[`docs/inventory-integration.md`](docs/inventory-integration.md).

| Endpoint | Purpose |
| --- | --- |
| `GET /api/inventory` | `destination`, `type`, `tier`, `price_band`, `q`, `sort`, `page`, `page_size` (max 100) |
| `GET /api/inventory/points` | every match as a map marker (same filters) |
| `GET /api/inventory/meta` | filter options and row counts |
| `GET /api/inventory/{id}` and `/rates` | one item and its monthly net rates |
| `GET /api/suppliers` | suppliers with item counts |
| `POST /api/inventory/import` | raw `text/csv` body. Required columns: `name,destination,type,tier,currency,net_price,lat,lon`; optional `supplier,category,unit,capacity`. `?dry_run=true` validates only. 1 MB / 5,000 row limit, 10 requests per minute per client. Returns a per-row error report |

```bash
curl -X POST "localhost:8000/api/inventory/import?dry_run=true" -H "Content-Type: text/csv" --data-binary @my_rates.csv
```

Imported rows are saved to the Aiven database when `DATABASE_URL` is set (see [docs/database-setup.md](docs/database-setup.md)); without it they are held in memory and lost on restart.


## Attribution

Seasonal rate shapes: Hotel Booking Demand (Antonio, Almeida & Nunes, 2019). Map tiles and data: © OpenStreetMap contributors.
Overture Maps, Inside Airbnb, Wikipedia and others will be added to the attribution as each feature starts using them.

## Profitability analysis (feature 2)

`/app/analytics` is live: KPI cards, margin by destination / supplier / package / season, a monthly trend and a markup what-if
slider. Every figure comes from about 7,000 **simulated** bookings (`backend/app/data/bookings.json`, rebuilt by
`backend/scripts/build_bookings.py`); nothing is a real booking. Definitions are in
[`docs/data-dictionary.md`](docs/data-dictionary.md#bookings-and-profitability).

| Endpoint | Purpose |
| --- | --- |
| `GET /api/analytics/profitability/summary` | KPIs for the range. `from` / `to` are optional ISO dates (inclusive); `from` after `to` returns 400 |
| `GET /api/analytics/profitability/breakdown` | `group_by=destination\|supplier\|package\|season` (supplier rows carry the name and `supplier_id`) |
| `GET /api/analytics/profitability/monthly-trend` | one row per month |
| `GET /api/analytics/profitability/markup-what-if` | `markup_percentage` 0 to 100; read-only, so GET. Uses the same engine and date filter as the summary |
| `GET /api/analytics/suppliers/ranking` | `by=gross_profit\|gross_margin\|cancellation_leakage`, `limit` 1 to 100 |


## PayPal sandbox payments (hackathon work)

Phase-wise plan: [`docs/paypal-ai-plan.md`](docs/paypal-ai-plan.md). The server recomputes the trip price from inventory and charges a deposit; the browser never supplies an amount.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/payments/config` | Public client id, environment (always `sandbox`) and deposit percentage |
| `POST /api/payments/orders` | Body `{"constraints": {...}}` (same shape the advisor returns). Plans the trip, opens a PayPal order for the deposit |
| `POST /api/payments/orders/{order_id}/capture` | Captures an approved order we created; verifies amount and currency; safe to retry |
| `GET /api/payments/bookings/{booking_id}` | Booking and proposal snapshot |
| `POST /api/advisor/agent` | Same body as `/advisor/plan`. Gemini calls `search_inventory`, `build_proposal` and `create_checkout`; the response adds `checkout` (an open, unpaid order or `null`) and `agent` (mode and steps). The agent never captures a payment: the buyer approves in the chat's "Approve and pay" card. Without a Gemini key it behaves like `/advisor/plan` |

## Gemini in the advisor (hackathon work)

`POST /api/advisor/plan` now returns an `ai` field: `{model, understanding: "gemini"|"rules", reply: "gemini"|"rules"}`.
Gemini reads free text into trip constraints (whitelisted and range-checked; explicit rule matches win on conflict) and phrases the reply.
It never sets prices: the proposal is still built only from inventory, and a Gemini reply is discarded unless every money figure in it matches the proposal.
With no key, or on any Gemini error or timeout, the advisor behaves exactly as before.


## Main-branch feature documentation retained

# Wayfare

A travel-operations workspace for a tour operator: browse supplier inventory, build and price packages, watch for
bad data, forecast demand, simulate market shocks, score responsible-travel claims, and plan trips with an AI
advisor. **All numbers are seeded or simulated sample data. Nothing is a live rate, booking or forecast.**

| Part | Stack | Hosted on | Folder |
| --- | --- | --- | --- |
| Frontend | React 19 + Vite, Leaflet maps, Recharts | Vercel | `frontend/` |
| Backend | FastAPI (Python 3.12) | Render | `backend/` |
| Database | PostgreSQL (optional; falls back to committed JSON and SQLite) | Aiven | `backend/scripts/schema.sql` |
| LLM | Gemini API (optional; falls back to a rule-based advisor) | Google AI Studio | `backend/app/services/llm.py` |
| Payments | PayPal **sandbox** only | PayPal | `backend/app/services/paypal.py` |

This archive is the merge of build phases A to H plus the Phase E forecast deliverables. See
[Build history](#build-history) and [Known gaps](#known-gaps-read-before-you-demo).

---

## Contents

1. [Features](#features)
2. [Repository layout](#repository-layout)
3. [Run locally](#run-locally)
4. [Environment variables](#environment-variables)
5. [Deployment](#deployment)
6. [Testing and CI](#testing-and-ci)
7. [API reference](#api-reference)
8. [Security notes](#security-notes)
9. [Build history](#build-history)
10. [Known gaps](#known-gaps-read-before-you-demo)

---

## Features

Sidebar routes, all under `/app`. Public routes: `/` (landing), `/login`, `/home`, `/destinations/:slug`,
`/attribution`, `/profile`.

### 1. Overview (`/app`)
Dashboard of headline cards. The shoulder-season insight panel reads from `GET /api/forecast/shoulder-season`;
the rest comes from `overview_seed.json`.

### 2. Inventory explorer (`/app/inventory`)
171 sample items across 12 destinations (stays, activities, transfers) with monthly net rates and suppliers.
Filters are kept in the URL; table and map views; an item drawer with a rate chart; anomaly and responsible
badges on rows. **CSV import** (`POST /api/inventory/import`) validates per row, supports `?dry_run=true`, is capped at
1 MB / 5,000 rows, and triggers an anomaly scan. Imported rows persist only when `DATABASE_URL` is set.

### 3. Package builder (`/app/packages`)
Five-step builder: destination, dates and travellers, day-by-day stops (drag to reorder), review, save.
A debounced live quote (`POST /api/packages/quote`) returns net cost, markup (from `package_fees.json`), sell
price, margin, per-person price and **checks**: haversine travel-time warnings, duplicate and overlap stops,
anomaly flags, responsible score and carbon. Packages save to the server (`/api/packages`) with optimistic
concurrency, and keep a localStorage draft as an offline fallback. Prefill with `?destination=` or `?package=`.

### 4. Itinerary studio (`/app/itinerary-studio`)
Printable, shareable view of a saved package (`?package=<id>`). Shows **selling price only**, never net cost or
margin. A4 print stylesheet. A Playwright flow (build, quote, save, studio, print preview) runs in CI.

### 5. Anomaly watch (`/app/anomalies`)
Three layers over the rate data, plus a text layer:

* **Rules**: zero or negative price, 10x/100x ratio to peers, dropped or extra digit, currency slips, missing fields.
* **Statistics**: MAD z-score against peers (destination, tier, month, room type) and the item's own rolling median.
* **Model**: Isolation Forest (`anomaly_model.joblib`) as the third signal.
* **Text**: `rapidfuzz` against a vocabulary of destination, attraction and supplier names, and near-duplicate suppliers.

A severity-sorted feed supports accept, dismiss and fix, with a plain-language reason per flag. Resolutions
persist (Aiven table `anomaly_resolution`, or SQLite). The topbar bell, the feed and inventory counts agree.
Measured on the seeded data: recall 0.984, precision 1.000 on injected rate errors; see
[`docs/anomaly-eval.md`](docs/anomaly-eval.md) for limits.

### 6. Related spots (`/app/related-spots`)
Three modes from `GET /api/spots/related`: `near` (haversine), `similar` (TF-IDF over Wikipedia/Wikivoyage text),
`day` (compatible categories within a one-way travel-time cap). Each result carries a reason string. Items with
no coordinates or text degrade without errors. Text is CC BY-SA and credited on `/attribution`.
Regenerate with `scripts/fetch_wiki.py` (needs network).

### 7. Profitability (`/app/analytics`)
KPIs, margin by destination / supplier / package / season, monthly trend, supplier ranking, and a markup what-if
slider, computed from about 7,000 **simulated** bookings (`bookings.json`, rebuilt by `scripts/build_bookings.py`).

### 8. Demand forecast (`/app/forecast`)
Monthly demand index per destination with an 80% interval and a confidence level. Forecasts are **precomputed
offline** (`scripts/train_forecast.py` writes `forecast_seed.json`), not fitted per request. A model is kept only
if it beats the seasonal-naive baseline on backtest; India destinations are flagged low confidence.

### 9. Market simulator (`/app/simulator`)
"What if?" engine: sliders (fuel, FX, demand shocks, etc.) and events act on the baseline forecast to give
demand, rates, occupancy and margin per month, with caps so stacked events stay in bounds. Phase F added
**package impact** (apply a scenario to a saved package) and **save/share scenarios**. See
[`docs/simulator.md`](docs/simulator.md).

### 10. Responsible travel (`/app/responsible-travel`)
Evidence-aware scoring. Only claims with status `verified` **and** an evidence URL, from a recognised
certification (GSTC-recognised, Travelife, Green Key, Fair Trade Tourism, B Corp), raise a score or badge.
Self-reported claims show as labelled text only. Carbon uses UK GHG 2026 factors; a package impact card shows a
flight-to-rail swap. The seeded partners are illustrative samples, so seeded scores are legitimately zero.
See [`docs/responsible-travel.md`](docs/responsible-travel.md).

### 11. AI studio / advisor (`/app/ai-studio`)
Turns "5 nights in Kerala for 4, around $4000, love food" into a priced proposal. **Gemini reads and phrases;
it never prices.** A deterministic optimiser (greedy plus 0/1 knapsack, skipping anomaly-flagged rates) builds
the proposal; eight strict-schema tools back the tool-calling loop; replies stream over SSE; a reply is shown
only if every dollar figure traces to an inventory rate. Per-session rate limit and a monthly spend cap
(`LLM_MONTHLY_CAP`) apply, and **"Open in package builder"** loads a proposal into feature 3. Without a Gemini
key it runs rule-based. A 20-case eval (constraints, no invented items, tool use, injection resistance) runs in
CI. See [`docs/advisor.md`](docs/advisor.md) and [`docs/advisor-eval.md`](docs/advisor-eval.md).

### 12. AI operations (`/app/ai-operations`)
Unified assistant over responsible travel and operations (`POST /api/advisor/chat`). Shares `GEMINI_API_KEY` and
`GEMINI_MODEL`.

### 13. PayPal sandbox checkout
In the advisor chat, an "Approve and pay" card charges a deposit (`DEPOSIT_PCT`, default 30%). The server
recomputes the price from inventory; the browser never supplies an amount. Sandbox only.

### 14. Cross-cutting
* "Sample data" banner on every workspace page. Public `/attribution` page for every data source and licence
  ([`docs/data-sources.md`](docs/data-sources.md)).
* Loading, "waking the server", error and empty states everywhere (Render and Aiven free plans sleep).
* Currency display and FX helpers, command palette (search), profile page.
* **Login is a frontend-only demo.** It does not authenticate anyone ([`frontend/DEMO_AUTH.md`](frontend/DEMO_AUTH.md)).

---

## Repository layout

```
.
├── backend/
│   ├── app/
│   │   ├── main.py                 FastAPI app, CORS, security headers
│   │   ├── db.py                   Postgres (Aiven) / SQLite access
│   │   ├── core/config.py          all env-based settings
│   │   ├── data/                   committed seed JSON/CSV + anomaly_model.joblib + forecast_seed.json
│   │   ├── services/               logic: packages, quote, anomalies, spots, forecast, simulator, scenarios,
│   │   │                           responsible, optimiser, advisor, agent, advisor_tools, llm, llm_budget, paypal...
│   │   └── api/router.py + routes/ one file per feature
│   ├── scripts/                    offline jobs: schema.sql, load_to_sql.py, train_forecast.py, fetch_wiki.py,
│   │                               build_*.py, run_advisor_eval.py
│   ├── evals/                      advisor eval set
│   ├── tests/                      pytest
│   └── requirements*.txt
├── frontend/
│   ├── src/components/             one file per page; ui.jsx has shared pieces
│   ├── src/lib/ src/data/ src/context/
│   ├── e2e/                        Playwright package-flow test
│   └── vercel.json                 SPA rewrite + security headers
├── docs/                           feature docs, data dictionary, launch checklist, audit/plan
├── .github/workflows/ci.yml
└── render.yaml                     Render blueprint (backend)
```

---

## Run locally

Needs Python 3.12 and Node 22.

```bash
# backend  -> http://localhost:8000  (API docs at /docs)
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
cp .env.example .env                                   # optional; every variable has a default
uvicorn app.main:app --reload

# frontend -> http://localhost:5173
cd frontend
cp .env.example .env                                   # VITE_API_URL=http://localhost:8000
npm install
npm run dev
```

With no env vars set everything works: the API serves the committed JSON, the advisor is rule-based, PayPal
endpoints return 503, and saved data lives in SQLite files in the OS temp dir.

---

## Environment variables

### Backend (set in the Render dashboard, or `backend/.env` locally; `.env` is git-ignored)

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `FRONTEND_URL` | **Yes in production** | `http://localhost:5173` | Allowed CORS origin(s), comma-separated. Set to your Vercel URL, no trailing slash. |
| `CORS_ORIGIN_REGEX` | No | none | Also allow Vercel preview URLs, e.g. `https://your-app-.*\.vercel\.app` |
| `DATABASE_URL` | Recommended | none | Aiven PostgreSQL Service URI ending `?sslmode=require`. Without it the app serves committed JSON and uses SQLite. **Secret.** |
| `GEMINI_API_KEY` | No | none | Google AI Studio key. Without it the advisor is rule-based. **Secret.** |
| `GEMINI_MODEL` | No | `gemini-2.5-flash` | One model id for the advisor. Change it if Google retires the default. |
| `GEMINI_TIMEOUT_S` | No | `8` | Seconds to wait for Gemini before falling back (clamped 2 to 30). |
| `LLM_MONTHLY_CAP` | No | `5` | Estimated Gemini spend ceiling per calendar month, USD. At the cap the advisor serves the rule-based plan. `0` blocks Gemini. |
| `LLM_PRICE_IN_PER_M` / `LLM_PRICE_OUT_PER_M` | No | `0.30` / `2.50` | USD per million input/output tokens, used only for the cap estimate. Check Google's price list. |
| `ADVISOR_SESSION_LIMIT` | No | `20` | Advisor requests per browser session per window. |
| `ADVISOR_SESSION_WINDOW_S` | No | `3600` | That window, in seconds. |
| `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` | For payments | none | PayPal **Sandbox** app credentials. Without them payment endpoints return 503. **Secret.** |
| `DEPOSIT_PCT` | No | `30` | Percent of trip price charged up front (1 to 100). |
| `BOOKINGS_DB`, `PACKAGES_DB`, `ANOMALY_DB`, `LLM_USAGE_DB` | No | OS temp dir | SQLite file paths used **only when `DATABASE_URL` is empty**. On Render's free plan they reset on restart. |
| `PYTHON_VERSION` | Render only | `3.12.8` | Already set in `render.yaml`. |

### Frontend (set in Vercel project settings, or `frontend/.env` locally)

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | **Yes in production** | Base URL of the backend, no trailing slash, e.g. `https://backend-api.onrender.com`. Vite bakes it in at build time, so **redeploy after changing it**. |

No other frontend variable exists, and no secret belongs in the frontend. The PayPal client id is fetched from
`/api/payments/config`.

---

## Deployment

Order matters because each step needs a URL from the one before: **database, backend, frontend, then back to the
backend to set CORS.**

### 1. Database (Aiven, optional but recommended)
1. Create an Aiven PostgreSQL service (free plan is fine; it powers off when idle, so power it on if the first connection times out).
2. Copy **Service URI** from Overview (`postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb?sslmode=require`).
3. Load the seed **once** from `backend/`:
   ```bash
   pip install -r requirements-scripts.txt
   echo "DATABASE_URL=<your URI>" >> .env
   python scripts/load_to_sql.py --check     # offline: validates the CSV against schema.sql
   python scripts/load_to_sql.py --reset     # creates the seed tables and loads them in one transaction
   ```
   `--reset` replaces seed tables (and drops imported inventory rows); it never drops `checkout_booking`.
   Tables the app owns (`package*`, `scenario`, `anomaly_resolution`, `llm_usage`, `checkout_booking`) are created
   automatically on first use.
4. After any reload, restart the backend (seed data is cached per process).

Details: [`docs/database-setup.md`](docs/database-setup.md).

### 2. Backend (Render)
1. Push this repo to GitHub. In Render choose **New > Blueprint** and point it at the repo; it reads `render.yaml`
   (service `backend-api`, root `backend`, health check `/api/health`, free plan).
2. In the service's **Environment** tab, fill the variables marked `sync: false`: `FRONTEND_URL` (placeholder for now),
   `DATABASE_URL`, `GEMINI_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`.
3. Deploy. Verify: `https://<backend>/api/health` returns `{"status":"ok"}`, and `/api/health/db` reports
   `"database": "connected"` (or `"not configured"` if you skipped Aiven). `/api/payments/config` must report `sandbox`.

The start command uses `--proxy-headers --forwarded-allow-ips='*'` so rate limits see the visitor's IP; keep it.

### 3. Frontend (Vercel)
1. Import the repo, set **Root Directory** to `frontend`. Vite is detected automatically (`npm run build`, output `dist`).
2. Add `VITE_API_URL` = your Render URL (no trailing slash), then deploy. `vercel.json` handles SPA routing.

### 4. Close the loop
Set `FRONTEND_URL` on Render to the Vercel URL (add `CORS_ORIGIN_REGEX` if you want preview deployments), and
redeploy the backend. If the site shows CORS errors, this is almost always why.

### 5. PayPal sandbox
developer.paypal.com > Apps & Credentials > **Sandbox** > create an app, copy Client ID and Secret into Render.
The backend is hard-wired to `api-m.sandbox.paypal.com`; live mode is deliberately unsupported.

### 6. Smoke test
Free-tier cold start can take about a minute and the UI shows a "waking the server" state instead of an error.
Walk through Overview, Inventory, Packages (build, quote, save, open studio), Anomaly watch, Advisor, `/attribution`.
Full checklist: [`docs/launch-checklist.md`](docs/launch-checklist.md).

---

## Testing and CI

```bash
cd backend  && python -m pytest && python scripts/run_advisor_eval.py   # eval fails below ADVISOR_EVAL_THRESHOLD (default 0.9)
cd frontend && npx vitest run && npm run build
cd frontend && npx playwright install chromium && npx playwright test   # needs the backend running on :8000
```

`.github/workflows/ci.yml` runs all of the above on every push and pull request (backend, frontend, e2e jobs).
The test suite never touches `DATABASE_URL` or calls Gemini or PayPal.

---

## API reference

All routes are under `/api`; interactive docs at `/docs`.

| Area | Endpoints |
| --- | --- |
| Health | `GET /health`, `GET /health/db` |
| Destinations / overview | `GET /destinations`, `GET /destinations/{slug}`, `GET /overview` |
| Inventory | `GET /inventory`, `/inventory/points`, `/inventory/meta`, `/inventory/{id}`, `/inventory/{id}/rates`, `GET /suppliers`, `POST /inventory/import` |
| Packages | `POST /packages/quote`, `POST /packages`, `GET /packages`, `GET/PUT/DELETE /packages/{id}` |
| Anomalies | `GET /anomalies`, `/anomalies/summary`, `POST /anomalies/scan`, `/anomalies/{id}/resolve`, `/anomalies/{id}/reopen`, plus `GET /anomalies/items`, `POST /anomalies/detect` |
| Related spots | `GET /spots/related?destination=&item=&mode=near\|similar\|day&limit=&max_travel_min=` |
| Profitability | `GET /analytics/profitability/summary`, `/breakdown`, `/monthly-trend`, `/markup-what-if`, `GET /analytics/suppliers/ranking` |
| Forecast | `GET /forecast/destinations`, `/forecast/demand`, `/forecast/shoulder-season` |
| Simulator | `GET /simulator/assumptions`, `/presets`, `POST /simulator/run`, `/simulator/package-impact`, `POST /simulator/scenarios`, `GET /simulator/scenarios/{id}` |
| Responsible | `GET /responsible/partners`, `/responsible/score/{item_id}`, `/responsible/package/{id}`, `POST /responsible/carbon` |
| Advisor | `POST /advisor/plan`, `/advisor/agent`, `/advisor/stream` (SSE), `/advisor/open-in-builder`, `GET /advisor/usage` |
| Payments | `GET /payments/config`, `POST /payments/orders`, `POST /payments/orders/{id}/capture`, `GET /payments/bookings/{id}` |

---

## Security notes

* No secrets in the frontend; keys live in the Render dashboard. A test fails the build if one appears in `frontend/src`.
* PayPal is sandbox only and the browser never sets an amount.
* Rate limits per client: advisor (session and per-IP), CSV import (10/min), payments (20/min). They are in memory,
  so they reset when the free Render instance sleeps.
* CSV import is capped at 1 MB / 5,000 rows and rejected with 413 as soon as the cap is passed.
* API and Vercel responses carry `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy`.
* Customer text, inventory names and spot text are treated as data by the advisor, and prices cannot be set by the model.
* The demo login is not a security boundary.

---

## Build history

| Phase | What it delivered |
| --- | --- |
| A | Repo made green, CI added, profitability contract aligned, auth/profile wired, lazy-loaded anomaly model, one `GEMINI_MODEL` default |
| B | Package builder backend (`services/packages.py`, `routes/packages.py`), live quote, drag reorder, studio by package id, Playwright flow |
| C | Anomaly rules, statistics, text layer, persistence, bell and feed, `docs/anomaly-eval.md` |
| D | Related spots: `fetch_wiki.py`, `services/spots.py`, three modes, attribution |
| E | Forecast verification: offline training, backtests, shoulder-season endpoint, `docs/data-sources.md` |
| F | Responsible badges on all surfaces, package impact, simulator package link, saved scenarios |
| G | Advisor: optimiser, 8 tools, streaming, rate limit, monthly cap, 20-case eval |
| H | Sample-data banner, attribution page, security hardening, launch checklist |

`MERGE_NOTES.md` and `INTEGRATION_*.md` are older notes from the original team merge and are kept for reference.
The original audit and plan this work followed is in
[`docs/Wayfare_Status_Audit_and_Next_Implementation_Plan.md`](docs/Wayfare_Status_Audit_and_Next_Implementation_Plan.md).

---

## Known gaps (read before you demo)

* **This merged bundle was not built or tested in the environment that assembled it** (no network, so no
  `npm ci`, `vitest`, `pytest` or `vite build`). Python files compile and every relative frontend import resolves,
  but run the commands in [Testing and CI](#testing-and-ci) once after unzipping.
* The merge was an overlay of the phase zips in order A, B, C, D, F, G, H, plus the Phase E files. A file deleted in a
  later phase would still be present here; there is no way to detect that from the zips.
* The `.git` folder is intentionally not included. Copy these files into your existing clone and commit, so history is preserved.
* Everything is sample data; seeded responsible-travel claims are unverified, so scores and badges are zero by design.
* The login is a demo, rate limits reset on restart, and `docs/simulator.md` still has one stale sentence about saved packages.
* Lighthouse accessibility scores and the cold-start walkthrough in `docs/launch-checklist.md` are manual and not yet recorded.
