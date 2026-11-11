# PayPal + AI integration plan

Goal: for the PayPal AI Hackathon, Wayfare must meaningfully use the PayPal developer platform (free sandbox) together with an AI model.
Submissions close 12:00 PM PT on 12 Nov 2026 (1:30 AM IST on 13 Nov). Aim to submit the evening of 12 Nov IST.

Story: the Gemini advisor plans a trip, the agency approves it, the traveller pays a deposit through PayPal sandbox checkout, and a printable itinerary appears.
**AI never sets prices.** The server recomputes the total from inventory (`advisor.plan`) and that is what PayPal charges.

Constraints kept from the existing project: current file structure, free tiers only, sample data labelled as sample.

## Phase 1 — PayPal sandbox backend (done)

Deliverables
- `app/services/paypal.py`: sandbox-only OAuth (cached), create order, capture order. Live mode is not supported on purpose.
- `app/services/bookings.py`: SQLite booking store (file in the OS temp dir by default, `BOOKINGS_DB` to override; lost on a Render restart, fine for a demo).
- `app/api/routes/payments.py`:
  - `GET /api/payments/config` — public client id and deposit percentage for the JS SDK.
  - `POST /api/payments/orders` — takes trip constraints, re-runs `advisor.plan`, charges a deposit of `DEPOSIT_PCT` of the server-computed sell price. Any client-sent amount is ignored.
  - `POST /api/payments/orders/{order_id}/capture` — only for orders we created; checks the captured amount and currency; idempotent.
  - `GET /api/payments/bookings/{booking_id}` — booking and proposal snapshot for the confirmation page.
- Config, `.env.example`, `render.yaml` and README env table updated. `httpx` moved to runtime requirements.
- `tests/test_payments.py` with PayPal fully mocked.

Exit criteria: `pytest` green; with real sandbox keys a curl-driven order can be created.

## Phase 2 — Gemini in the advisor (done)

- `app/services/llm.py`: thin Gemini wrapper (`GEMINI_API_KEY`, free tier).
- Constraint extraction by Gemini (structured output), falling back to the existing regex `parse_request` when the key is missing or the call fails.
- Reply and itinerary narrative written by Gemini from the proposal numbers; a guard checks that every dollar figure in the text matches a proposal line, otherwise the deterministic `describe()` is used.
- Tests with the Gemini call mocked.

Built: `services/llm.py` (REST via httpx, no new dependency), `sanitize_llm_constraints` and `narrative_is_faithful` in `advisor.py`, an `ai` field on the advisor response, `tests/conftest.py` that keeps the suite offline, `tests/test_llm_advisor.py`.
Design rules: rules beat Gemini on conflict; the narrative call never sees the user's message, net cost or margin; the key goes in a header, never the URL.
Known limit: the rule parser reads "weekend" as 2 nights and wins over Gemini, so "long weekend" stays 2 nights.

Exit criteria: advisor works with and without a key; no price in text that is not in the proposal.

## Phase 3 — Frontend checkout

- `npm i @paypal/react-paypal-js`, add `VITE_PAYPAL_CLIENT_ID`.
- `PackagesPage` (currently a placeholder) shows the proposal and `<PayPalButtons>`: `createOrder` calls `/payments/orders`, `onApprove` calls `/capture`.
- Confirmation state with booking id and a printable Itinerary studio view.
- Advisor banner text updated: AI plans, PayPal sandbox charges, prices come only from inventory.

Exit criteria: full sandbox purchase from the UI with a sandbox buyer account.

## Phase 4 — Agentic layer

- Gemini function-calling tools over existing services: `search_inventory`, `build_proposal`, `create_checkout`.
- Chat shows an "Approve and pay" card; the agent can create an order but never captures it, a human approves.
- Optional: PayPal agent toolkit / MCP as a second route (verify its current API first).
- Stretch: margin view from `net_usd`; PayPal Payouts to suppliers (check sandbox support first).

Exit criteria: a trip can go from one chat message to an approved sandbox payment.

## Phase 5 — Deploy and submit

- Set sandbox keys on Render and Vercel; ping Render before judging (free tier sleeps).
- README: sandbox buyer login, run instructions, architecture note.
- Devpost: project description, demo video, repo link. Read the official rules for the full deliverable list and judging criteria.
- Check the Render hosting-credit prize eligibility.
