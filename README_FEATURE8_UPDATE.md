# Feature 8 — Royal Stay Collection

## What changed
- Replaced the previous responsibility scorecards and score calculations with a stay-discovery collection.
- Displays the 72 accommodation sample records already present in `backend/app/data/inventory_items.json`.
- Adds editorial accommodation imagery and short neutral travel copy. The images are illustrative, not verified photographs of the named sample properties.
- Clearly discloses that the bundled property names/rates are synthetic demo data.
- Keeps the previous carbon calculator input fields, validation behaviour, proxy factors, response shape and calculator UI contract intact.
- Removes the obsolete Responsible badge placeholder from the inventory item drawer.

## API
- `GET /api/responsible/partners` — sample stay collection with image and editorial presentation fields.
- `POST /api/responsible/carbon` — existing carbon estimator contract.

## Local checks
- Backend tests: `python -m pytest tests/test_responsible.py -q` (12 passed).
- API smoke test: partner endpoint returns 72 stays; carbon reference input returns 634.0 kg total and 317.0 kg per traveller; invalid negative distance returns HTTP 400.
- Frontend build could not be run in the packaging environment because npm dependencies were not cached and registry access was unavailable. Run `npm ci` and `npm run build` in the local project before merging.
