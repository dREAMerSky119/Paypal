# Feature 8 — Socially responsible travel

## What is included

- A hand-maintained JSON registry at `backend/app/data/responsible_registry.json`, seeded with three **illustrative sample records** for every destination currently in `destinations.json`.
- Editable score weights and recognized certification names in `backend/app/data/responsible_weights.json`.
- Evidence-aware scoring: only a claim with `status: "verified"` **and** an evidence URL counts. Certifications must be one of GSTC-recognised, Travelife, Green Key, Fair Trade Tourism or B Corp. Self-reported and unverified claims are shown but do not affect scores or badges.
- Carbon factor metadata and transparent fallbacks in `backend/app/data/carbon_factors_2026.json`.
- A package impact example with a flight-to-rail swap, a shoulder-season nudge from Feature 6's seasonality output, and an explicit unavailable state for Inside Airbnb density (no matching dataset exists in this repository).

The sample partner names are not real vetted businesses. Replace them with real partner records and independently review the evidence before publishing badges. The registry currently marks claims self-reported or unverified, so seeded records correctly have a score of zero and no badge.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/responsible/partners` | List partners; optional `destination`, `type`, `q` filters |
| GET | `/api/responsible/score/{item_id}` | Score, weights and claim evidence trail |
| GET | `/api/responsible/weights` | Current editable scoring configuration |
| POST | `/api/responsible/carbon` | Calculate transport + accommodation emissions |
| GET | `/api/responsible/package/{id}` | Package impact summary and at least one seeded alternative |

Example carbon request:

```json
{"country":"India","flight_km":1800,"rail_km":0,"road_km":120,"hotel_nights":4}
```

## Scoring

Default weights are local ownership 30, certifications 25, community benefit 25 and environmental practice 20. The overall score is the sum of earned dimension weights (0–100). A badge requires the configurable threshold (60 by default) and at least one verified claim. Update weights in `responsible_weights.json`; no code edit is needed for weight changes.

## Carbon methodology and limitations

The 2026 DESNZ long-haul economy flight factor with radiative forcing is 0.11704 kg CO2e/passenger-km. The current rail, road and hotel values are explicitly marked proxies in the factor file; they are not presented as country-specific official values. India, Japan, Morocco and Indonesia are marked approximate. Use the activity-year factor set and map the relevant rows from the official workbook before using estimates for formal reporting. All outputs are indicative planning estimates, not audited carbon accounts or offset claims.

Source: [UK Government — Greenhouse gas reporting: conversion factors 2026](https://www.gov.uk/government/publications/greenhouse-gas-reporting-conversion-factors-2026).
