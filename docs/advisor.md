# AI advisor (feature #4, Phase G)

The advisor turns a request such as "5 nights in Kerala for 4, around $4000, love food" into a priced proposal.
**Gemini reads and phrases; it never prices.** Every figure comes from the deterministic optimiser over the
sample inventory, and a reply that quotes anything else is replaced by the rule-based text.

## Pieces

| Piece | File | Job |
| --- | --- | --- |
| Optimiser | `services/optimiser.py` | Stay and transfer by rule, activities by 0/1 knapsack (greedy as the floor). Excludes items with an open anomaly flag. Optional verified-score weighting. `trace_prices` proves each line is an inventory rate. |
| Tools | `services/advisor_tools.py` | 8 tools with strict JSON schemas (`additionalProperties: false`, enums, ranges), a validator, and error responses the model can act on. |
| Agent | `services/agent.py` | Tool-calling loop (max 5 turns, 6 tool calls, 25 s). Owns `create_checkout`, which is gated on the customer asking to pay and can never capture money. |
| Limits | `services/llm_budget.py` | Monthly spend cap and per-session limit. |
| API | `routes/advisor.py` | `/advisor/plan`, `/advisor/agent`, `/advisor/stream` (SSE), `/advisor/open-in-builder`, `/advisor/usage`. |
| Eval | `evals/advisor_eval.py` | 20 cases, run in pytest and CI. See `docs/advisor-eval.md`. |

## Tools

`search_inventory`, `get_rates`, `optimise_package`, `quote_package`, `related_spots`, `responsible_score`,
`forecast`, `anomalies` (plus `create_checkout`, described below). Results carry sell prices only: net cost,
margin and markup never reach the model. `item_id` does (it is the handle for `get_rates`), and the prompt
forbids repeating it. `build_proposal` is still accepted as an alias of `optimise_package`.

## Clarifying questions

Destination and nights are hard constraints. If either is missing the model is told to ask one short question and
call no tool; if it calls `optimise_package` anyway the tool returns "Still need: ..." and builds nothing. Everything
else has a stated default (2 travellers, balanced pace, no budget). An impossible budget is not silently broken: the
proposal says "Over budget by $X" and `optimiser.min_total_usd` holds the cheapest possible stay.

## Streaming

`POST /api/advisor/stream` returns `text/event-stream`:

```
event: status  data: {"text":"Thinking"}
event: step    data: {"tool":"optimise_package","ok":true,"note":"$1,446.29 total"}   (one per tool call, live)
event: token   data: {"text":"Here is a relaxed "}                                      (the reply, a few words at a time)
event: done    data: { ...same shape as /advisor/agent... }
event: error   data: {"detail":"..."}                                                   (only after streaming began)
```

Tool steps stream live. The **reply text is streamed only after it has been verified**, so a customer never sees a
number that is later retracted. Bad input is an ordinary 422 before any streaming starts. Browsers that cannot read
a response body fall back to `/advisor/agent`.

## Limits and graceful failure

* **Per-session limit:** `ADVISOR_SESSION_LIMIT` requests per `ADVISOR_SESSION_WINDOW_S` (default 20 per hour),
  keyed by the `X-Session-Id` header the app sends, plus the per-IP burst limit (a client can invent session ids,
  not IP addresses). Over the limit: HTTP 429 with `Retry-After` and a plain-language message.
* **Monthly cap:** `LLM_MONTHLY_CAP` (USD, default 5). Spend is *estimated* from Gemini's `usageMetadata` token
  counts times `LLM_PRICE_IN_PER_M` / `LLM_PRICE_OUT_PER_M`, stored per UTC month (Aiven if `DATABASE_URL` is set,
  else SQLite). At the cap no Gemini call is made; the advisor serves the rule-based plan with
  `ai.notice` set. `GET /api/advisor/usage` shows the month so far. The default prices are assumptions to check
  against Google's price list; on the free tier real cost is 0.
* **Gemini down, slow or malformed:** falls back to the rule-based planner with a notice. The key is read
  server-side only and is never sent to the browser.

## Hardening against injection

Customer text, inventory names and spot text are all data. The model's system prompt says so, but the guarantees
do not depend on the prompt:

1. Tool arguments are validated against strict schemas before anything runs.
2. Prices come only from the optimiser; the model has no way to set one.
3. A reply is shown only if every $ figure traces to a tool result, at least one is an engine price (a reply whose
   only figure is the customer's own budget is rejected), and it does not repeat internal terms (net cost, margin,
   markup, supplier, item ids, "system prompt").
4. `create_checkout` needs the customer's own message to contain a booking word, takes no amount, and cannot capture.

Known limit: a reply may repeat a figure the customer typed, as long as it also states a real engine price.

## Frontend

`AdvisorPage` shows live tool steps and the streamed reply, then a proposal card: totals, lines, checks, and an
impact block (verified responsible score with coverage, carbon estimate, open data flags). "Open in package
builder" posts the **constraints** (never totals) to `/advisor/open-in-builder`, which rebuilds the proposal on the
server, saves it as a package priced by the quote engine, and opens `/app/package-builder?package=<id>`.
`?destination=` pre-fills the first message. The seasonal quote can differ from the proposal total because the
proposal uses base rates and the quote uses the travel month's rate; the card shows the proposal total.
