# Feature 8 — Responsible Travel (Royal Stay Collection)

## What is included
- A stay-discovery collection built from the accommodation records in `backend/app/data/inventory_items.json` (72 sample stays), with editorial imagery and short neutral copy. The earlier scorecard / badge scoring was removed.
- A carbon estimator (flights, rail, road, accommodation nights) using clearly-labelled proxy factors.
- Property names, rates and supplier records are synthetic demo data; imagery is illustrative, not a verified photograph of the named property.

## API
| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/responsible/partners` | Stay collection; optional `destination`, `kind`, `q` filters |
| POST | `/api/responsible/carbon` | Indicative trip carbon estimate |

Example carbon request:

```json
{"flight_km": 1800, "rail_km": 0, "road_km": 120, "hotel_nights": 4, "travellers": 2}
```

Inputs are validated (non-negative, finite, bounded); invalid input returns HTTP 400.

## Limitations
Carbon figures are approximate trip-planning estimates, not audited footprints or offset claims.
