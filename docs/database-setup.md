# Database setup (Aiven PostgreSQL)

Everything the app stores lives in one Aiven PostgreSQL database:

| What | Tables | Written by |
|---|---|---|
| Generated seed data (destinations, suppliers, items, rates, bookings, demand, events, ...) | the 19 tables from `wayfare_master.csv` | `scripts/load_to_sql.py` (one-off) |
| Hand-written content (destinations page data, overview cards, inventory meta/FX) | `content_doc` | `scripts/load_to_sql.py` |
| Rows added through the inventory CSV import | `item`, `supplier`, `rate` with `data_origin = 'imported'` | the API |
| PayPal checkout bookings | `checkout_booking` | the API |

With `DATABASE_URL` unset the app behaves as before (committed JSON, bookings in a local SQLite file).

## 1. Create the service and get the URI
Aiven console > your PostgreSQL service > **Overview** > copy **Service URI**
(`postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb?sslmode=require`). The free plan powers off when idle;
power it on from the console if the first connection times out.

## 2. Load the data (once, from `backend/`)
```bash
pip install -r requirements-scripts.txt
cp .env.example .env            # then put DATABASE_URL=... in backend/.env (git-ignored)
python scripts/load_to_sql.py --check    # offline: validates the CSV against schema.sql
python scripts/load_to_sql.py --reset    # creates the tables and loads everything in one transaction
```
`--reset` replaces the seed tables only; `checkout_booking` is never dropped. Without `--reset` the script
refuses to run against a database that already holds data.

## 3. Point the backend at it
Render dashboard > `backend-api` > Environment > add `DATABASE_URL` (same URI). Redeploy, then open
`https://<your-backend>/api/health/db`: it should report `"database": "connected"`, the row counts, and
`"seed_served_from"` showing `database` for each file once the site has been used.

## Behaviour to know about
* If the database is unreachable or empty, the API serves the committed JSON and logs a warning (retrying every 60 s),
  so the site stays up. `/api/health/db` shows which source is live; `/api/health` never touches the database.
* Seed data is read once per process and cached; after reloading the database, restart the backend.
* The test suite never touches `DATABASE_URL` (see `tests/conftest.py`).
