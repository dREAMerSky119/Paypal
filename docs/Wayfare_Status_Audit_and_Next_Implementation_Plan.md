# Wayfare: Status Audit and Next Implementation Plan

Prepared Nov 11, 2026 for @sachin. Based on Paypal-merged.zip, which I unzipped, built and tested (pytest, Vitest, vite build). Percentages are my judgement from reading the code, not measurements. I did not run the deployed site, a browser, or the Aiven database.

## 1. Headline

Roughly 55 to 60 percent of the original plan exists in some form, but only about a third of it is finished to its "Done when" line. The main gaps are the package backend (Feature 3), anomaly detection as specified (Feature 9), related spots (Feature 7), the advisor's streaming, rate limits and evaluation (Feature 4), and CI. A second problem is that the repo is not green: tests disagree with the code in several places.

**Verified results**

- `vite build`: clean.
- Backend pytest: 209 passed, 14 failed. All 14 failures are in `tests/test_profitability.py`.
- Frontend Vitest: 144 passed, 11 failed, 2 errors. Failures are in `AuthFlow.test.jsx` (5), `ProfitabilityPage.test.jsx` (3), `PackageBuilderPage.test.jsx` (2) and the route smoke test on `/app/anomalies` (1). A render error in `InventoryPage.jsx` line 117 (`undefined.map`) also shows in the output.

## 2. Scorecard

| Step | Item | Status | Est. | What exists | What is missing |
| --- | --- | --- | --- | --- | --- |
| 0 | Phase 0 plumbing | Mostly done | 80% | `api.js`, `useApi.js`, `format.js`, `ui.jsx`, `workspace.css`, lazy routes, command palette, smoke test, Vitest, pytest, `/api/destinations`, `app/data`, `app/services`, `scripts` | Smoke test fails on `/app/anomalies`; Overview data source and dead-control sweep unconfirmed |
| 1 | #1 Inventory explorer | Mostly done | 85% | 171 items, 12 destinations, rates, suppliers, `wayfare_master.csv`, `/inventory`, `/inventory/{id}`, `/rates`, `/points`, `/suppliers`, CSV import, map, rate chart, tests | Plan's attribution footer and Lighthouse check not verified; `undefined.map` guard at InventoryPage line 117 |
| 2 | #9 Anomaly detection | Partial | 35% | Isolation Forest model (`anomaly_model.joblib`), `/anomalies/items`, `/anomalies/detect`, a 487-line page, labelled fixture and the "Lad in" fixture | Rule layer, MAD z-score, rapidfuzz text checks, `/anomalies` feed, `/resolve`, `/scan`, persistence, scan on import, bell count, flags on inventory and package lines, `docs/anomaly-eval.md`. Model and 155k-row CSV load at import time |
| 3 | #2 Profitability | Built, contract drifted | 70% | `bookings.json`, `profitability.py` (396 lines), summary, breakdown, monthly trend, markup what-if, large page | Tests expect different endpoints and fields (see section 3). No `suppliers/ranking` route. Overview and inventory drawer sharing the same numbers is unconfirmed |
| 4 | #3 Package builder and itinerary studio | Frontend only | 35% | 5-step builder, localStorage draft, studio print view, `quote.py` (209 lines) with tests | No `routes/packages.py`, no package tables, no live quote, checks, drag reorder, `?package=` prefill, saved-package studio, A4 print verification, Playwright flow |
| 5 | #7 Related spots | Mostly missing | 15% | `spots.json` (38), `spot_links.json`, curated `related` arrays on destinations | `fetch_wiki.py`, `services/spots.py`, `/api/spots/related`, near/similar/day modes, attribution. Page is a 21-line static view |
| 6 | #8 Responsible travel | Mostly done | 75% | Registry, weights, UK GHG 2026 carbon factors, `responsible.py`, `/partners`, `/score/{id}`, `/package/{id}`, `/carbon`, page, tests | Badges on inventory and packages, package impact card with swap, anti-greenwashing copy review |
| 7 | #6 Demand forecasting | Partial | 55% | `demand_forecast.py` (238 lines) with an 80% interval, `/forecast/destinations`, `/forecast/demand`, 756-line page | Not verified: stored backtest error, baseline-beating check, `shoulder-season` endpoint, `docs/data-sources.md`, retrain script |
| 8 | #5 Market simulator | Mostly done | 75% | Assumptions JSON, `simulator.py` (503 lines), presets, run, page, tests, `docs/simulator.md` | Link to saved packages (margin impact) and related-spot spillover; save and share scenarios |
| 9 | #4 AI advisor | Partial | 55% | Gemini wiring (`llm.py` with function calling), `advisor.py` plan logic, `agent.py`, two chat routes, page, tests | Strict tool schemas over all services, constraint clarifying loop, standalone optimiser module, streaming, per-session rate limit, monthly cost cap, 20-request eval, injection tests. I found no streaming, rate limit or cap in the advisor files |
| n/a | Cross-cutting | Weak | 25% | `render.yaml`, `vercel.json`, README, `.env.example`, data dictionary | No CI workflow, no attribution page confirmed, no `anomaly-eval.md` or `data-sources.md` |

## 3. What is wrong beyond "not built yet"

1. **Profitability contract drift.** The router exposes `/profitability/summary`, `/breakdown`, `/monthly-trend` and `/markup-what-if` (GET). The tests and the page test expect the plan's shape: `/analytics/profitability?group_by=`, `suppliers/ranking`, POST what-if, and fields such as `margin_forgone_on_cancelled`. One side has to change.
2. **Profile and auth not wired.** `ProfilePage` and `AuthContext` were merged in but not connected (see `MERGE_NOTES.md`), so the five `AuthFlow` tests fail.
3. **Merge loss risk.** `MERGE_NOTES.md` says 35 files in the other zip had unresolved conflict markers and were skipped, so edits from commit fe70b5b exist only in that zip.
4. **Two Gemini model defaults** (`gemini-3.6-flash` in Settings, `gemini-2.5-flash` in the advisor settings).
5. **Scope added beyond the plan:** PayPal sandbox payments, demo auth, profile page, currency and FX helpers, AI Operations page. These are fine, but they need tests and docs.
6. **Package builder tests are stale** against the current page (two failing tests).

## 4. Decisions carried forward

- Database: hosted SQL on Aiven (`db.py` supports Postgres, SQLite for tests; JSON fallback when the database sleeps).
- Advisor LLM: Gemini API.
- Itinerary studio kept as the printable view of a saved package.
- New backend folders accepted. Free tiers only for now.
- Badges: verified claims only; self-reported claims shown as labelled text in the detail view.

## 5. How to use this plan (instructions for Claude)

1. Work one phase at a time, in order. Each phase ends with a **Done when** check; do not move on until it passes.
2. After every phase run `vite build`, `vitest run`, `pytest`. From Phase A onward the baseline must stay green.
3. Keep conventions: one component per page in `components/`, one CSS file per area, static data in `data/`, helpers in `lib/`, one backend route file per feature registered in `router.py`, logic in `services/`, heavy jobs in `scripts/`.
4. Never invent prices, availability or sources. Everything seeded is labelled Sample data.
5. Every feature needs loading, waking-the-server, error and empty states (Render and Aiven free plans sleep).

## 6. Build order

| Phase | Goal | Size | Depends on |
| --- | --- | --- | --- |
| A | Get the repo green and add CI | S to M | none |
| B | Finish package builder and itinerary studio (#3) | L | A |
| C | Anomaly detection to spec (#9) | M | A |
| D | Related spots (#7) | S to M | A (parallel with C) |
| E | Forecast verification (#6) | S | A (parallel) |
| F | Responsible badges and simulator links | M | B, C, D, E |
| G | AI advisor completion (#4) | L | B to F |
| H | Cross-cutting and launch hardening | M | all |

## Phase A: Stabilise and add CI

- Search the repo for conflict markers (`<<<<<<<`, `>>>>>>>`) and confirm none remain. Decide which edits from the fe70b5b zip, if any, to port.
- **Profitability:** pick one contract. Recommended: keep the working `/profitability/*` routes, add the missing `suppliers/ranking` and the `group_by` and range parameters, then rewrite the 14 backend tests and 3 frontend tests to match. Keep the hand-computed engine tests, adding `margin_forgone_on_cancelled` to the summary only if you want that figure.
- **Auth and profile:** either wire `AuthContext` and `ProfilePage` into `App.jsx` and `DashboardLayout`, or remove them and their 5 tests. Choose wiring if the demo login stays.
- Fix `/app/anomalies` smoke failure and guard `InventoryPage.jsx` line 117 against an undefined list.
- Update the two `PackageBuilderPage` tests to the current stepper.
- Set one `GEMINI_MODEL` default in `config.py` and document it.
- Add `.github/workflows/ci.yml`: pip install, pytest, npm ci, vitest, vite build on every push.
- Lazy-load the anomaly model and CSV on first use instead of at import.
- **Done when:** pytest, Vitest and `vite build` are all green locally and in CI; smoke test passes on every route.

## Phase B: Package builder and itinerary studio (#3)

**B1. Data and persistence**

- Tables `package`, `package_day`, `package_line` in `scripts/schema.sql`; DB-API functions in a new `services/packages.py` using `db.py` (SQLite in tests, Aiven in production).
- Complete `quote.py`: net cost, markup from `package_fees.json`, sell price, margin, per-person; haversine travel-time between stops by mode; duplicate and overlap detection.
- **Done when:** quote tests cover multi-day, multi-traveller, out-of-range date and missing-rate cases.

**B2. API**

- `routes/packages.py`: `POST /api/packages/quote`, `POST /api/packages`, `GET /api/packages`, `GET /api/packages/{id}`. Register in `router.py`.
- Quote response includes `checks`: travel-time warnings, duplicates, anomaly flags (empty until Phase C), margin, responsible score and carbon slots (filled in Phase F).
- **Done when:** a saved package round-trips through the API and a bad payload returns a clear 4xx.

**B3. Builder UI**

- Replace the "quote not connected" panel with a live quote call (debounced) and show checks.
- Drag to reorder stops within a day, `?destination=` and `?package=` prefill, server save with localStorage draft as the offline fallback, optimistic concurrency on save.
- **Done when:** a user can build, price and save a 3-day package end to end.

**B4. Itinerary studio and hardening**

- Studio loads by package id (`?package=`), shows only the selling price, never net cost or margin; shareable link; A4 print stylesheet with no cut-off blocks.
- Playwright flow (build, quote, save, open studio, print preview) added to CI.
- **Done when:** print preview is clean on A4 and the flow passes in CI.

## Phase C: Anomaly detection to spec (#9)

- `services/anomaly_rules.py`: zero or negative price, 10x and 100x ratio to peers, currency slips, missing fields. Fixtures in `tests/fixtures/` with labelled injected anomalies (the "Lad in" file already exists).
- Statistical layer: MAD z-score against peers (destination, tier, month, room type) and the item's own rolling median. Keep the Isolation Forest as the third signal.
- Text layer: `rapidfuzz` against a vocabulary of destination, attraction and supplier names; near-duplicate suppliers. Add `rapidfuzz` to requirements.
- API: `GET /api/anomalies` (severity-sorted, filterable), `POST /api/anomalies/{id}/resolve` (accept, dismiss, fix), `POST /api/anomalies/scan`. Persist resolutions in the database with a plain-language explanation per anomaly.
- Run a scan automatically on CSV import.
- Frontend: topbar bell shows the open count and opens the feed; flags appear on inventory rows and package lines.
- Measure precision and recall on injected data and on the Hotel Booking Demand ADR outliers; write `docs/anomaly-eval.md` with known limits.
- **Done when:** rules flag every injected anomaly with no false positives on clean seed, resolutions survive a restart, importing a bad CSV raises flags, and bell, feed and inventory counts agree.

## Phase D: Related spots (#7)

- `scripts/fetch_wiki.py`: Wikipedia and Wikivoyage text plus pageviews for each attraction, stored with licence and URL (CC BY-SA).
- `services/spots.py` with three modes: `near` (haversine), `similar` (TF-IDF), `day` (nearby compatible categories within a travel-time limit). Add a small popularity boost; add a responsible-score boost in Phase F.
- `routes/spots.py`: `GET /api/spots/related?destination=&item=&mode=`, each result with a reason string.
- Frontend: "And while you're near" on destination pages, "nearby" on attraction cards, "add nearby" in the package builder, map view. Keep the curated `related` arrays only as a fallback.
- **Done when:** the Dolomites no longer relates to Kyoto or Marrakech, all modes return ranked results, items with no coordinates or text degrade without errors, attribution footer is live.

## Phase E: Forecast verification (#6)

- Confirm the forecasts are precomputed offline, not fitted on request. If they are not, move the work to `scripts/train_forecast.py` and commit JSON.
- Store backtest error per destination; keep a model only if it beats the seasonal-naive baseline. Flag India destinations low confidence.
- Add `GET /api/forecast/shoulder-season` and feed the Overview insight panel from it.
- Write `docs/data-sources.md` with a verified licence for each source.
- **Done when:** every destination returns a forecast with an interval and a confidence level, Overview reads shoulder-season data, and a fresh clone can regenerate forecasts from scripts alone.

## Phase F: Responsible badges and simulator links

- Show verified-only badges consistently on inventory, packages and the responsible page; self-reported claims appear as a labelled line in the detail view only.
- Fill the package-quote slots from Phase B: responsible score, carbon, and a swap suggestion on a seeded example.
- Test that unverified claims can never raise a badge; add the "how this score works" panel and an anti-greenwashing copy review.
- Simulator: apply scenarios to saved packages (margin impact) and use Phase D spillover; add save and share scenarios and cap compounding of stacked events.
- **Done when:** badges agree on all three surfaces, the unverified-claims test passes, and stacked events stay within sane bounds.

## Phase G: AI advisor completion (#4)

- **Tools:** strict JSON schemas for `search_inventory`, `get_rates`, `quote_package`, `optimise_package`, `related_spots`, `responsible_score`, `forecast`, `anomalies`, each with a unit test and clear error responses.
- **Optimiser:** `services/optimiser.py`, deterministic greedy plus knapsack, excludes anomaly-flagged rates, optional responsible weighting. Ask a clarifying question when a hard constraint is missing.
- **Chat API:** streamed responses, tool-calling loop, per-session rate limit and monthly cost cap from env vars (`LLM_MONTHLY_CAP`), key server-side only, graceful message when Gemini is down.
- **Frontend:** proposal card (cost, margin, responsible score, flags) and "Open in package builder" that loads the proposal; `?destination=` pre-fills the first message.
- **Evaluation:** 20-request eval set covering constraint satisfaction, no invented items, correct tool use and prompt-injection resistance (inventory text is data).
- **Done when:** the eval passes at an agreed threshold, the cap blocks requests when exceeded, and every price in a proposal traces to an inventory rate.

## Phase H: Cross-cutting and launch

- "Sample data" banner on every page showing seeded numbers.
- Attribution page: Overture, Inside Airbnb, Wikipedia and Wikivoyage (CC BY-SA), Open-Meteo, OSM, UK GHG, World Bank, ECB.
- Security: rate limits on advisor, import and payment endpoints; CSV size limit; no secrets in the frontend; confirm PayPal stays in sandbox mode.
- README: document `FRONTEND_URL`, `VITE_API_URL`, `DATABASE_URL`, `GEMINI_API_KEY`, `GEMINI_MODEL`, cap variables and PayPal variables.
- Deploy check on Vercel, Render and Aiven including the waking-server state; Lighthouse accessibility 90+ on the main pages.
- **Done when:** CI is green on a fresh clone, the deployed demo works from cold start, and attribution is visible.

## 7. Open decisions to confirm

1. Profitability: keep the current `/profitability/*` routes (recommended) or rename them to the plan's `/analytics/profitability` shape?
2. Auth: wire the demo login and profile page, or remove them?
3. Do you want to port anything from the fe70b5b zip that was skipped in the merge?
4. Gemini monthly cost cap value and per-session rate limit.
5. Is PayPal sandbox in scope for the final demo, and does it need its own test suite?
