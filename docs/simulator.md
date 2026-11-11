# Market simulator (feature 5)

`/app/simulator` answers "what if?" questions: what happens to demand, rates, occupancy and
margin at a destination if conditions change. It is an illustration engine, not a predictor.

## How a scenario is computed

```
baseline demand forecast (feature 6)
  x multipliers from the assumptions table
  = scenario demand, rates, occupancy, margin, spillover
```

Per month in the window:

1. **Baseline.** `get_demand_forecast(destination, 12)` gives the predicted demand index and its 80% range.
2. **Conditions.** Each active slider contributes a multiplier `1 + coefficient x value / 100`
   for demand, rates and supplier cost. Each ticked event contributes its own demand and rate
   multipliers, weighted by the share of the month it covers and by the strength you chose.
3. **Combine and cap.** Multipliers are multiplied together, then clamped (demand 0.35 to 2.5,
   rates and cost 0.6 to 1.6). Demand can never go negative. The response says when a cap was hit.
4. **Rates.** Rates also follow demand a little: `rate = direct effects x demand ^ 0.35`.
   Sell price follows rates (`rate ^ 0.9`). Supplier cost follows rates (`rate ^ 0.5`).
5. **Occupancy (proxy).** `0.85 x demand / busiest historical month`, capped at 98%.
   Demand above the ceiling is reported as *turned away*.
6. **Margin.** The destination's most recent 12 months of simulated bookings are spread over
   the window using the baseline demand shape, then re-priced and re-volumed per month.
   Profit = sales - net cost - fees - cancellation leakage, the same definition as the
   profitability page. A test checks the baseline equals the profitability engine.
   *Saved packages will replace the simulated bookings when the package builder ships.*
7. **Spillover.** Lost demand plus turned-away demand is partly (30%) assumed to move to the
   top three similar destinations (the `similar / destination` rows from the related-spots data),
   in proportion to similarity and scaled by each destination's relative size. Uplift per
   neighbour is capped at 25%.

## Assumptions

Everything lives in `backend/app/data/simulator_assumptions.json`, built from
`backend/scripts/data/wayfare_master.csv` by `backend/scripts/build_simulator_seed.py`.
Every multiplier has a `source_note` and is flagged *assumption, not a measurement*.

| Table | Contents |
| --- | --- |
| `effect_types` | Weather, fuel, currency, visa, disruption: slider range and coefficients for demand, rates, cost. Calibrated to the preset rows in the events table within rounding. |
| `events` | 46 curated events (festivals, seasons, holidays, weather) with dates and multipliers. Dates come from the `holidays` package where available. |
| `globals` | How effects combine (rate response, pass-through, occupancy proxy, spill share and cap). |
| `fx` | Reference currency levels and volatility. Not live. Refresh from Frankfurter/ECB when network allows. |
| `presets` | Heavy monsoon, Fuel +20%, INR -5%, EUR +5%, Visa easing, Regional disruption, Airline strike week, Festival season boost. |

People can edit any coefficient or global on the page. The edits are sent as `overrides`
(validated, bounded) and travel with the shared link. The file itself is the editable
source of truth: change it and re-run the builder, or edit the JSON directly.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/simulator/assumptions` | Sliders, events, globals, FX, destinations, months a scenario can start in |
| `GET /api/simulator/presets` | Ready-made scenarios |
| `POST /api/simulator/run` | Run one scenario. 400 with a readable reason on bad input |

Request body:

```json
{
  "destination": "kerala-india",
  "start": "2027-06",
  "months": 3,
  "adjustments": { "weather": 67 },
  "events": [{ "id": "evt_009", "strength": 100 }],
  "overrides": { "types": { "weather": { "demand_per_unit": -0.4 } }, "globals": { "spill_share": 0.2 } }
}
```

`adjustments` and `events` are optional. The window must sit inside the 12-month forecast
(from 2026-11 with the current data).

## Sharing and saving

The page keeps its state in the address bar (`?scenario=...`), so **Copy link** shares an exact
scenario, including edited assumptions. **Saved scenarios** are stored in this browser only
(`localStorage`, up to 12). `?destination=<slug>` pre-fills the destination from other pages.

## Known limits

* The baseline is a synthetic, calibrated demand index. Results show direction and rough size, not real volumes.
* Occupancy is a proxy from the demand index, not a measured occupancy rate.
* Event dates for 2026 to 2027 are approximate; lunar dates (for example Ramadan) should be checked.
* Currency effects use a fixed reference level, not live FX.
* Spillover size depends on an assumed share and on similarity scores, not observed switching.
