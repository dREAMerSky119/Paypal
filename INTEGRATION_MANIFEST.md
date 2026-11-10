# Integration manifest

Master: `Paypal.zip`. Feature sources: market simulator, Wayfare Feature 8, Paypal-main.

## New feature files
- `backend/app/api/routes/ai_advisor.py`
- `backend/app/api/routes/responsible.py`
- `backend/app/api/routes/simulator.py`
- `backend/app/data/carbon_factors_2026.json`
- `backend/app/data/responsible_registry.json`
- `backend/app/data/responsible_weights.json`
- `backend/app/data/simulator_assumptions.json`
- `backend/app/services/ai_travel_agent.py`
- `backend/app/services/responsible.py`
- `backend/app/services/simulator.py`
- `backend/scripts/build_simulator_seed.py`
- `backend/tests/test_responsible.py`
- `backend/tests/test_simulator.py`
- `docs/responsible-travel.md`
- `docs/simulator.md`
- `frontend/src/ai-operations.css`
- `frontend/src/components/AIOperationsPage.jsx`
- `frontend/src/components/RelatedSpotsPage.jsx`
- `frontend/src/components/ResponsibleTravelPage.jsx`
- `frontend/src/components/SimulatorPage.jsx`
- `frontend/src/components/SimulatorPage.test.jsx`
- `frontend/src/lib/simulator.js`
- `frontend/src/lib/simulator.test.js`
- `frontend/src/related-spots.css`
- `frontend/src/responsible-travel.css`
- `frontend/src/simulator.css`

## Main integration points modified
- `backend/app/api/router.py`
- `backend/app/core/config.py`
- `backend/requirements.txt`
- `backend/.env.example`
- `frontend/src/App.jsx`
- `frontend/src/data/navigation.js`
- `frontend/src/data/featureInfo.js`
