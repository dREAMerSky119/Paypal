# Display currency

Each user picks a **preferred display currency** on the Profile page (19 currencies). Every feature that
shows money converts into it through one shared layer, `frontend/src/lib/fx.js`.

## Where it applies
| Feature | What is converted |
|---|---|
| Inventory | Preferred-price column and drawer, monthly rate table and rate chart (the "USD reference" column stays USD on purpose) |
| AI studio (Advisor) | Itinerary line prices and totals |
| Profitability | Every sales / cost / profit / leakage figure, chart axes and tooltips (margins and % are unaffected) |
| Market simulator | Margin-impact profit figures |
| Anomaly watch | Price is typed and shown in the preferred currency, converted to USD for the model |
| Package builder / Itinerary studio | Show no prices yet. When Phase 2 adds quotes, use `useDisplayCurrency().format(amount, "USD")` |

Not converted: text written by the backend or the AI (AI advisor answers), which stays in the currency it was written in.

## Rates
* **Live** — fetched in the browser from `open.er-api.com` (free, no key), cached in `localStorage` for 12 h.
* **Reference** — bundled table in `fx.js` (backend `simulator_assumptions.json` values where they exist). Used when
  offline, blocked, or before the first fetch. The UI always labels which one is in use ("live rate · updated …" or
  "reference rate (not live)").
* Disable the live fetch with `VITE_FX_LIVE=false`. It is also off under tests.
* Amounts convert through USD. If a code has no rate, the original amount is shown in its own currency instead of a guess.
* Figures are indicative display values for planning, not settlement rates.

## Using it in new code
```js
import { useDisplayCurrency } from "../lib/useDisplayCurrency.js";
const { format, formatWhole, formatCompact, toUsd, currency, rateLabel } = useDisplayCurrency();
format(1234, "USD");   // "INR 108,592" for an INR user, unchanged "USD 1,234" for a USD user
```
