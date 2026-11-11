# Feature 8 — Responsible travel: Royal Stay Collection and carbon estimator

## What is included

- A **stay-discovery collection** built from the accommodation rows (`type == "stay"`) already in the inventory seed
  (`inventory_items.json` + `inventory_suppliers.json`, served from the database when `DATABASE_URL` is set). The bundled
  seed has 72 stays. Rows added through the CSV import also appear, with their own supplier kind.
- Editorial imagery and short neutral copy per stay style. Images are illustrative Unsplash photographs chosen by item
  number; they are **not** verified photographs of the named properties. The copy deliberately makes no impact,
  certification or community-benefit claims.
- Clear disclosure that property names, rates and supplier records are synthetic demo data (`is_sample: true` plus a
  `notice` string on every response).
- The **carbon emissions calculator** (unchanged input fields, validation and response shape): flights, rail, road and
  hotel nights, with transparent proxy factors. It is an indicative planning estimate, not an audited footprint.

The previous partner scorecards, badge scoring and package-impact summary were removed by this feature. The inventory item
drawer no longer shows the "Responsible badge" placeholder. `responsible_registry.json`, `responsible_weights.json` and
`carbon_factors_2026.json` remain in `backend/app/data/` but are no longer read by the application.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/responsible/partners` | Stay collection. Optional filters: `destination` (slug), `kind` (supplier kind), `q` (words, max 100 chars). Returns `count`, `items`, `destinations`, `is_sample`, `notice` |
| POST | `/api/responsible/carbon` | Carbon estimate. Body: `flight_km`, `rail_km`, `road_km` (0 to 50,000), `hotel_nights` (0 to 365), `travellers` (1 to 20). Returns `total_kg`, `per_traveller_kg`, `components_kg`, `assumptions`, `factors`. Invalid input returns HTTP 400 |

Removed with this feature: `GET /api/responsible/score/{item_id}` and `GET /api/responsible/package/{package_id}`. Nothing in the
frontend called them other than the replaced page (the package endpoint always returned 404).

## Carbon factors (kg CO2e per unit)

| Component | Factor |
|---|---|
| Flight under 3,700 km | 0.15 per passenger-km |
| Flight 3,700 km or more | 0.11 per passenger-km |
| Rail | 0.035 per passenger-km |
| Road | 0.17 per passenger-km |
| Hotel | 18.0 per room-night |

Reference example: 5,000 flight km, 100 rail km, 50 road km, 4 hotel nights, 2 travellers gives 634.0 kg total and 317.0 kg per traveller.
All factors are proxy averages; flight class, occupancy, vehicle type, electricity mix and hotel country can change results materially.
