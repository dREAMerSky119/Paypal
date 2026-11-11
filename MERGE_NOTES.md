# Merge notes

Base: `Paypal.zip` (main: PayPal sandbox payments, Aiven/SQLite DB wiring, Gemini advisor + agent).
Merged in: teammates' work from `origin/all-features-added-clean` plus extra files from `Paypal-all-features-added-clean.zip`.

## Heads-up about the features zip
`Paypal-all-features-added-clean.zip` was NOT clean: 35 files contained unresolved git conflict markers
(`<<<<<<< HEAD ... >>>>>>> fe70b5b`), e.g. App.jsx, AdvisorPage.jsx, InventoryPage.jsx, config.py,
requirements.txt. Those marked-up versions were not used. The committed, marker-free branch tip
(`origin/all-features-added-clean`, 0a0066c) was merged instead. The fe70b5b line of work lives only in that zip,
so any edits in it to those 35 files are NOT included.

## Conflicts resolved (main vs. features)
- `backend/app/api/router.py`: both sets of routers registered (payments + simulator, responsible, ai_advisor, anomalies).
- `backend/requirements.txt`: union of both.
- `backend/.env.example`: main's block kept (PayPal, Gemini, DB); one comment added for AI Operations.
- `backend/app/core/config.py`: auto-merged; removed duplicate import and redundant dotenv loader.
- `backend/app/services/advisor.py`: kept main's Gemini-understanding layer.
- `frontend/src/components/AdvisorPage.jsx`: kept main's PayPal-aware banner.
- `README.md`: kept main's sections.

## Added from the zip (marker-free files that were not on the branch)
Package Builder, Itinerary Studio, currency/FX libs, Profile page, AuthContext, quote.py, spots/airports data, docs.
- Wired: `/app/packages` and `/app/itinerary-studio` (App.jsx).
- NOT wired: ProfilePage + AuthContext, `backend/app/services/quote.py` (no API route yet), PriceDisplay/useDisplayCurrency.

## To verify locally (nothing could be run in the sandbox: no dependencies/network)
1. `pip install -r backend/requirements.txt && pytest` in `backend/`
2. `npm install && npm test && npm run build` in `frontend/`
3. Two different Gemini defaults exist: `gemini_model` in `Settings` (gemini-3.6-flash, used by AI Operations)
   vs `GeminiSettings.model` (gemini-2.5-flash, used by the advisor). Set `GEMINI_MODEL` explicitly to unify.
4. `backend/.env` is not included in the zip. Keep your own.
