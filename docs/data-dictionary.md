# Inventory data dictionary (Feature 1, Phase 1)

All rows are **sample data** (`data_origin = synthetic_sample`). Names are placeholders
anchored to real localities. Rates are generated from a price model whose *seasonal shape*
is calibrated from the Hotel Booking Demand dataset (Antonio, Almeida & Nunes, 2019).
Nothing here is a real price, a real availability or a real supplier.

## Regenerating

```bash
pip install -r backend/requirements-scripts.txt
# 1. master CSV (deterministic: fixed seed 20261109; downloads Hotel Booking Demand + OurAirports to --raw)
python backend/scripts/build_dataset.py \
  --frontend frontend/src/data/destinations.js --raw backend/scripts/raw \
  --out backend/scripts/data/wayfare_master.csv
# 2. inventory seed JSON served by the API
python backend/scripts/export_inventory_seed.py
```

Both steps are reproducible: re-running step 1 on a clean checkout produces a byte-identical
`wayfare_master.csv`, and step 2 produces byte-identical JSON.

## Row counts

| File | Rows | Notes |
| --- | ---: | --- |
| `inventory_suppliers.json` | 171 | one supplier per item in this seed |
| `inventory_items.json` | 171 | 72 stays, 39 experiences, 36 guides, 24 transport |
| `inventory_rates.json` | 6,156 | 171 items x 36 months (2025-01 to 2027-12) |
| `tests/fixtures/rate_anomaly_labels.json` | 127 | ground truth for #9, **never served by the API** |

Items per destination: 14 each, 15 for Dolomites, Kyoto and Marrakech (12 destinations).
Tiers: 36 budget, 123 mid, 12 luxury.

## `inventory_items.json`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | `item_0001`; imported rows are `imp_0001` |
| `supplier_id` | string | FK to supplier |
| `destination` | string | destination slug, matches `destinations.json` |
| `name`, `category` | string | display name, e.g. `double_room`, `private_room` |
| `type` | enum | `stay` / `guide` / `experience` / `transport` |
| `tier` | enum | `budget` / `mid` / `luxury` |
| `lat`, `lon` | number | WGS84 |
| `currency` | ISO 4217 | local currency of the destination |
| `base_net_price` | number | mid-season net rate in local currency |
| `base_net_price_usd` | number | same, converted with the reference FX table |
| `capacity` | int | guests per room / group size |
| `unit` | string | `per_room_night`, `per_person`, `per_guide_day`, `per_guide_half_day`, `per_vehicle`, `per_vehicle_day` |
| `markup_pct` | number | sample markup used later by #2 |
| `responsible` | object | `ownership`, `chain_brand`, `locality`. Raw material for #8; **not a score** |
| `data_origin` | string | provenance |

The API adds `supplier_name` and three slots that are always `null` until their feature ships:
`margin`, `responsible_badge`, `anomaly_flag`.

## `inventory_suppliers.json`

`id`, `destination`, `name`, `kind`, `tier`, `lat`, `lon`, `currency`, `locality`,
`ownership` (e.g. `independent_local`), `chain_brand`, `overture_id` (null until
`enrich_overture.py` is run), `data_origin`.

## `inventory_rates.json` (columnar)

`{"columns": [item_id, period, date, net_price, net_price_usd], "rows": [[...]]}`, one row per
item per month. **Contains deliberate errors**: 127 rates (2%) are corrupted on purpose
(`spike` 28, `zero` 23, `extra_zero` 21, `missing_zero` 21, `negative` 20, `currency_slip` 14)
so Anomaly watch has something real to find. The labels live only in the test fixture.

## `inventory_meta.json`

`price_bands` (USD base net price: `under_30`, `30_75`, `75_150`, `over_150`; lower bound
inclusive, upper exclusive), `fx_per_usd` (reference assumptions, **not live**; refresh from
Frankfurter/ECB), `row_counts`.

## Known limits

* No Overture data yet. `enrich_overture.py` exists but was written without network access to
  Overture's S3 bucket and is **untested**. Until it is run, supplier names are placeholders.
* Inside Airbnb calendars are not used in this seed (seasonality comes from Hotel Booking Demand
  only), so the plan's Inside Airbnb attribution is not needed yet.
* Imported CSV rows are written to the `item`/`supplier`/`rate` tables (`data_origin = 'imported'`) when `DATABASE_URL` is set; without a database they live in process memory and vanish on restart.
* The in-memory store scans linearly. At 171 items a list call takes about 2 ms; revisit with an
  index if inventory grows past roughly 10,000 items.

## Bookings and profitability

`backend/app/data/bookings.json` holds 7,054 simulated booking lines (May 2025 to Oct 2026, all `data_origin = synthetic_sample`).
`build_dataset.py` samples lead time, cancellation, deposit type, segment and nights jointly from real Hotel Booking Demand rows
(same arrival month); prices come from the seeded rates. `build_bookings.py` only extracts the `booking` rows from
`wayfare_master.csv` and writes this file. About 34% of lines are cancelled, in line with Hotel Booking Demand.
Only the *shapes* (lead time, cancellation, seasonality) come from the real data, never price levels.

| Field | Meaning |
| --- | --- |
| `net_amount` / `sell_amount` | Supplier cost and price charged, USD, for the whole line (rate x quantity) |
| `fees` | Payment and distribution fees, 2.5% of `sell_amount` |
| `is_canceled` | Cancelled lines earn no sales and no cost of goods |
| `cancel_penalty` | **Unrecovered loss on a cancelled line**: 8% of net cost for "No Deposit", 10% for "Refundable", 0 for "Non Refund" (the agency keeps the deposit). This is an assumption, not a measurement |

Metric definitions used by `services/profitability.py`:

* **gross sales** = sum of `sell_amount` over completed lines.
* **gross profit** = completed (`sell_amount - net_amount - fees`) **minus cancellation leakage**.
* **gross margin** = gross profit / gross sales.
* **cancellation leakage** = sum of `cancel_penalty` over cancelled lines. It is a cost and is subtracted from profit.
* **margin forgone on cancelled** = the margin cancelled lines would have earned (`sell - net - fees`). It is an opportunity cost, shown for context, and is **not** subtracted from profit.
* **markup** = (sell - net) / net on completed lines. The what-if applies a new markup to completed net cost and keeps fees and leakage unchanged; it assumes demand does not react to price.
* All groupings use the booking's own `date` (check-in). Seasons are calendar seasons (Dec to Feb winter), not destination-specific ones.

