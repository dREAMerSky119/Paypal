# Wayfare reconciliation report

## What was verified (static, in a sandbox with no network)
- All backend `.py` compile; all `app.*` imports resolve to real symbols; all JSON valid.
- All 65 frontend JS/JSX files and both responsible-travel stylesheets parse (esbuild).
- Router registers all 12 route modules including `payments`; every nav entry has a page
  component; every npm and Python third-party import is declared.
- PayPal files (routes, service, checkout, bookings, ApproveAndPay) are byte-identical to MAIN.
  No credentials are committed; `.env.example` and `render.yaml` hold names only.
- Service-level tests executed: 11 passed (scoring over 171 suppliers + Royal's 72 stays).

## NOT verified (could not run here)
`pip install` / `npm ci` were unavailable, so these have **not** been run: full pytest
suite, Vitest suite, `vite build`, and the 3 FastAPI TestClient tests. Run:
`cd backend && python -m pytest` and `cd frontend && npm ci && npm test && npm run build`.

## Defect found in the previous merge (FILE D) and fixed
D copied the Royal redesign's responsible-travel files over ALL-FEATURES' versions. That
silently removed verified-claim scoring, supplier claim breakdowns, destination detail,
`/responsible/score/{id}`, `/responsible/package/{id}` and the 171-supplier partner overview
(Royal's README says it intentionally replaced these). Fixed additively: ALL-FEATURES'
service/routes/tests/page are the base; Royal adds `list_stays`, `GET /responsible/stays`,
the stay-collection UI and a scoped stylesheet. Inline hardening: non-numeric item ids no
longer 500 the stays endpoint.

## Decisions on files where B differs from A
ALL-FEATURES branched before MAIN's database, PayPal and LLM work (it deleted 17 such files).
For advisor, analytics, inventory, profitability, seed, health, schema and render.yaml the
B-only lines are older in-memory implementations, so MAIN's versions are kept.

## Known gaps / open items
1. **Package Builder is Phase 1 only.** `services/quote.py` and reference data exist and are
   tested, but there are no HTTP package/quote endpoints, no server-side persistence, and the
   UI honestly says the quote is not connected. Drafts are saved in browser localStorage.
   Net cost / selling price / margin therefore do not appear in the builder UI yet.
2. **Six conflict files not named in your brief** (the brief text was cut off at section L).
   The hand-merged files are router.py, config.py, requirements.txt, .env.example, App.jsx
   and featureInfo.js (+ navigation.js); each retains both sides' content.
3. `.env.example` sets `GEMINI_MODEL=gemini-3.5-flash-lite` while `config.py` and
   `render.yaml` default to `gemini-2.5-flash`. Pick one; not changed here.
4. Stay records come from the committed JSON seed even when `DATABASE_URL` is set.
5. Brief sections L onward (AI Operations, analytics, etc.) were not audited in depth.
