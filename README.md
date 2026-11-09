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

Imported rows are held in memory and are lost on restart until a database is configured.

## AI travel advisor (`/app/ai-studio`)

Type a request ("3 nights in Kyoto for 2 under $1500, love food"). `POST /api/advisor/plan` parses destination, nights,
travellers, budget, tier, interests and pace with plain rules, asks a follow-up question when the destination or nights are
missing, and builds a stay + transfer + activities plan **only from inventory rows**, so every price traces to an item id.
Price outliers (likely data errors) are excluded, budgets and a 2 h per-leg driving limit are respected, and 30 requests/min
per client are allowed. No LLM or API key is used yet; an LLM can later phrase replies while still calling `services/advisor.py`
for the numbers. Still to come from the plan: anomaly flags (#9), responsible scores (#8), "Open in package builder" (#3).

## Attribution

Seasonal rate shapes: Hotel Booking Demand (Antonio, Almeida & Nunes, 2019). Map tiles and data: © OpenStreetMap contributors.
Overture Maps, Inside Airbnb, Wikipedia and others will be added to the attribution as each feature starts using them.
