# Launch checklist (Phase H)

Run through this before showing the demo. Items marked **manual** need a browser or the live services; they were not run in the build environment.

## Automated (CI on every push)

- [x] `pytest` (backend), `vitest run` and `vite build` (frontend), advisor eval, Playwright package flow.
- [x] `tests/test_phase_h.py`: sandbox-only PayPal, rate limits on import/payments/advisor, 1 MB streamed import cap, security headers, no secrets in `frontend/src`, every backend env var documented in the README.
- [x] Route smoke test: every route renders, including `/attribution`, and every workspace page shows the "Sample data" banner.

## Configuration

- [ ] Render: `FRONTEND_URL` = the Vercel URL (add `CORS_ORIGIN_REGEX` for preview URLs if wanted); `DATABASE_URL`, `GEMINI_API_KEY`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` set; `GEMINI_MODEL`, `LLM_MONTHLY_CAP`, `ADVISOR_SESSION_LIMIT` reviewed.
- [ ] Vercel: `VITE_API_URL` = the Render URL, no trailing slash. Redeploy after changing it (Vite bakes it in at build time).
- [ ] Aiven: service running; seed loaded once with `python scripts/load_to_sql.py --reset`.
- [ ] PayPal app is a **Sandbox** app and the Render logs show `environment: sandbox` from `/api/payments/config`.

## Cold start (manual)

1. Let Render sleep (15 minutes idle) and, if possible, power the Aiven service off and on.
2. Open the Vercel URL. Expect the "waking the server" state, not an error, within the first few seconds; pages should fill in after the backend answers (Render free can take about a minute).
3. Visit Overview, Inventory, Packages (build, quote, save), Anomaly watch, Advisor, `/attribution`.
4. Stop the database and reload Inventory: it should fall back to the committed JSON seed.

## Accessibility (manual)

Lighthouse accessibility 90+ on `/`, `/home`, `/app`, `/app/inventory`, `/app/packages`, `/app/analytics`, `/attribution`:
Chrome DevTools > Lighthouse > Accessibility, or `npx lighthouse <url> --only-categories=accessibility`. Record scores here and fix anything below 90.

| Page | Score | Date |
| --- | --- | --- |
| | | |

Already in place: `lang` on `<html>`, `main` landmark with `id="main"`, table captions and `scope` headers on the attribution table, visible focus on links, `prefers-reduced-motion` respected.
