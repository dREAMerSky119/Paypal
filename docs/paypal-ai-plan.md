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

## Phase 3 — Frontend checkout (partly done, inside Phase 4)

Status: the PayPal button now lives in the advisor chat as the "Approve and pay" card (see Phase 4). Still open: the
`PackagesPage` entry point and the printable itinerary view. The button uses the public client id from `GET /payments/config`,
so `VITE_PAYPAL_CLIENT_ID` is not needed.

- `npm i @paypal/react-paypal-js`, add `VITE_PAYPAL_CLIENT_ID`.
- `PackagesPage` (currently a placeholder) shows the proposal and `<PayPalButtons>`: `createOrder` calls `/payments/orders`, `onApprove` calls `/capture`.
- Confirmation state with booking id and a printable Itinerary studio view.
- Advisor banner text updated: AI plans, PayPal sandbox charges, prices come only from inventory.

Exit criteria: full sandbox purchase from the UI with a sandbox buyer account.

## Phase 4 — Agentic layer (built, verified with mocks only)

- Gemini function-calling tools over existing services: `search_inventory`, `build_proposal`, `create_checkout`.
- Chat shows an "Approve and pay" card; the agent can create an order but never captures it, a human approves.
- Optional: PayPal agent toolkit / MCP as a second route (verify its current API first).
- Stretch: margin view from `net_usd`; PayPal Payouts to suppliers (check sandbox support first).

Built: `services/agent.py` (tool loop), `services/checkout.py` (shared by the agent and `POST /payments/orders`),
`llm.generate_turn` (Gemini function calling over REST), `POST /api/advisor/agent`, `ApproveAndPay.jsx`, an agent-steps trace in the chat,
`tests/test_agent.py` (22), `ApproveAndPay.test.jsx` (9).
Design rules, enforced in code and covered by tests:
- The agent module never imports the PayPal client, so it cannot capture. Only the buyer approving in PayPal plus `/capture` moves money.
- `create_checkout` takes no arguments (no amount from the model) and is refused unless the customer's message asks to book or pay.
- Search results carry sell prices only: no net cost, margin, supplier or item id reaches the model.
- A reply quoting a figure no tool returned is replaced by the deterministic text. Any Gemini error, timeout or runaway loop falls back to the rule-based advisor, keeping an order that was already opened.
- A revised trip drops the open checkout, and the chat shows the pay card only on the newest proposal.
- Without `GEMINI_API_KEY`, `/advisor/agent` behaves like `/advisor/plan` and the card still lets the buyer pay.

Not yet verified: a real Gemini function-calling round trip and a real sandbox payment. Every test mocks both. Do this with real keys before the demo (Phase 5).

Exit criteria: a trip can go from one chat message to an approved sandbox payment.

## Phase 5 — Deploy and submit

- Set sandbox keys on Render and Vercel; ping Render before judging (free tier sleeps).
- README: sandbox buyer login, run instructions, architecture note.
- Devpost: project description, demo video, repo link. Read the official rules for the full deliverable list and judging criteria.
- Check the Render hosting-credit prize eligibility.
