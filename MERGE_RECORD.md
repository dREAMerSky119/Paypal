# Merge record

## Archive mapping used
- `Paypal-main (2).zip` was treated as the MAIN source.
- `Paypal-main-merged (1).zip` (root folder `out/`) was treated as the `sujoy-final-final` feature source.

This mapping is inferred from the archive names and the included `MERGE_NOTES.md`; confirm it before pushing if the filenames were assigned differently.

## Source selection
- From `sujoy-final-final`: UI/theme/layout, Responsible Travel, Package Builder, Itinerary Studio, Overview page, currency display layer, PayPal-aware AI Studio and package-payment frontend, package-aware checkout/payment endpoints, and feature-specific docs/tests/assets.
- From `main`: Profitability, Market Simulator, Demand Forecast, Anomaly Watch/Supplier Anomaly frontend/backend, associated CSS/helpers/services/routes/tests/fixtures/data/model artifacts, plus main-only supporting files.
- Added main-only files rather than dropping them, including Related Spots/attribution support, advisor evaluation/tooling, forecast training assets and tests.

## Shared-file resolutions
- `frontend/src/App.jsx`: feature branch ErrorBoundary and route map retained; main Attribution route restored; duplicate anomaly fallback removed because `/app/anomalies` is already generated from `featureInfo`.
- `frontend/src/data/featureInfo.js`: feature branch descriptions retained; AI Studio `action` removed; `AdvisorPage` already conditionally renders its header action.
- `backend/app/api/router.py`: main router retained, including all feature and main routers plus Related Spots.
- `backend/app/core/config.py`, `backend/app/main.py`, advisor/agent services and advisor route: feature-branch versions retained for the AI Studio contract and PayPal checkout; main config/security middleware retained. Main-only advanced advisor helpers remain available but are not wired to the branch agent.
- `backend/app/services/checkout.py`, `backend/app/services/bookings.py`, `backend/app/api/routes/payments.py`: feature versions retained because they add package deposits/booking lookup used by Itinerary Studio; they retain the ordinary AI Studio checkout API.
- `backend/app/services/inventory.py` and inventory route: main versions retained for anomaly scan integration, responsible metadata and bounded streaming CSV uploads.
- `backend/app/api/routes/overview.py` and `backend/app/data/overview_seed.json`: feature-branch contract retained because its Overview UI reads `destination`, `start_date`, `end_date` and package IDs; the main `overview.py` service remains as an unused supporting file. The old main Overview test is preserved under `docs/legacy-main-tests/`; a new contract test covers the branch UI.
- `backend/requirements.txt`: union of both dependency lists (including `rapidfuzz`).
- Main's `test_phase_f.py`, `test_phase_g.py` and `test_advisor_eval.py` are preserved as text under `docs/legacy-main-tests/`, not active pytest modules: they assert the retired main-branch Responsible Travel scorecard and old advanced advisor-agent contract, which conflict with the explicitly requested feature-branch versions. The main Overview test's one scorecard-specific assertion was removed; its other integration checks remain active.
- `backend/.env.example`: feature PayPal/DB/Gemini settings plus main anomaly/LLM budget settings.
- `README.md`: feature README retained; main README appended if its forecast documentation was absent.

## AI Studio header button
The `/app/ai-studio` entry no longer has an `action`. The feature-branch `AdvisorPage.jsx` checks `info.action` before accessing `.to` or `.label`, so the missing action does not trigger the prior blank-screen crash. The FeaturePage also guards optional actions.

## Review items / limitations
- Branch identity is inferred from archive names and embedded merge notes; verify the mapping before applying the commands.
- The project archives contain no Git history, so this is a file-level integration, not a Git merge-base merge. Git can still report conflicts later if the branch history contains divergent edits to these same files; use the supplied commit-and-push workflow to publish the integrated tree, then test the merge into main.
- No live PayPal transaction was performed. Sandbox credentials and browser approval are required to validate payment end-to-end.
