"""Agent tests. Gemini and PayPal are both mocked through httpx.MockTransport: no network, no keys.

The Gemini fake is scripted: each entry is one model turn, either function calls or final text.
"""
import json
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.routes import advisor as route
from app.main import app
from app.services import advisor, agent, bookings, llm, paypal
from tests.test_payments import FakePayPal

client = TestClient(app)

TRIP = {"destination": "kyoto-japan", "nights": 3, "travellers": 2}


def call(name, **args):
    return {"role": "model", "parts": [{"functionCall": {"name": name, "args": args}}]}


def say(text):
    return {"role": "model", "parts": [{"text": text}]}


class ScriptedGemini:
    def __init__(self, turns):
        self.turns = list(turns)
        self.requests: list[dict] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(json.loads(request.content))
        if not self.turns:
            return httpx.Response(200, json={"candidates": [{"finishReason": "STOP", "content": say("ok")}]})
        turn = self.turns.pop(0)
        if turn == "HTTP_ERROR":
            return httpx.Response(500, json={"error": {"message": "boom"}})
        return httpx.Response(200, json={"candidates": [{"finishReason": "STOP", "content": turn}]})

    def tool_results(self) -> list[dict]:
        """Every functionResponse the model was shown, in order."""
        out = []
        for part in (p for c in self.requests[-1]["contents"] for p in c["parts"]):
            if "functionResponse" in part:
                out.append(part["functionResponse"]["response"])
        return out


@pytest.fixture
def gemini(monkeypatch):
    def install(*turns) -> ScriptedGemini:
        g = ScriptedGemini(turns)
        monkeypatch.setattr(llm, "settings", replace(llm.settings, api_key="test-key", model="gemini-test"))
        monkeypatch.setattr(llm, "_transport", httpx.MockTransport(g.handler))
        return g
    return install


@pytest.fixture
def fake_paypal(monkeypatch, tmp_path):
    f = FakePayPal()
    cfg = replace(paypal.settings, client_id="id", client_secret="secret", deposit_pct=30.0,
                  bookings_db=str(tmp_path / "b.sqlite3"))
    monkeypatch.setattr(paypal, "settings", cfg)
    monkeypatch.setattr(bookings, "settings", cfg)
    monkeypatch.setattr(paypal, "_transport", httpx.MockTransport(f.handler))
    paypal.reset_token_cache()
    yield f
    paypal.reset_token_cache()


def captured(f: FakePayPal) -> int:
    return sum(1 for _, p, _ in f.calls if p.endswith("/capture"))


# ------------------------------------------------------------------ no key: identical to /advisor/plan

def test_without_key_agent_is_the_rule_based_advisor(fake_paypal):
    out = agent.run("3 nights in Kyoto for 2")
    assert out["agent"] == {"mode": "rules", "steps": []}
    assert out["proposal"]["is_sample"] is True and out["checkout"] is None
    assert fake_paypal.calls == []


def test_empty_message_is_an_advisor_error():
    with pytest.raises(advisor.AdvisorError):
        agent.run("   ")


# ------------------------------------------------------------------ happy paths

def test_agent_builds_a_proposal_and_uses_its_figures(gemini):
    expected = advisor.plan(dict(TRIP))
    total = expected["totals"]["sell_usd"]
    g = gemini(call("build_proposal", destination="kyoto-japan", nights=3, travellers=2),
               say(f"A 3-night Kyoto plan for 2 comes to ${total:,.2f}."))
    out = agent.run("3 nights in Kyoto for 2")
    assert out["agent"]["mode"] == "gemini" and out["ai"]["reply"] == "gemini"
    assert out["reply"].startswith("A 3-night Kyoto plan")
    assert out["proposal"]["totals"]["sell_usd"] == total
    assert out["checkout"] is None
    assert [s["tool"] for s in out["agent"]["steps"]] == ["build_proposal"]
    # The model saw a summary, never net cost, margin or item ids.
    shown = json.dumps(g.tool_results())
    assert "net_usd" not in shown and "margin" not in shown and "item_" not in shown


def test_missing_details_make_the_agent_ask_instead_of_guess(gemini):
    gemini(say("Which destination, and how many nights?"))
    out = agent.run("plan me a trip")
    assert out["proposal"] is None and out["missing"] == ["destination", "nights"]
    assert out["reply"].startswith("Which destination")


def test_booking_request_opens_a_checkout_but_never_captures(gemini, fake_paypal):
    sell = advisor.plan(dict(TRIP))["totals"]["sell_usd"]
    deposit = float(paypal.deposit_for(sell))
    gemini(call("build_proposal", destination="kyoto-japan", nights=3, travellers=2),
           call("create_checkout"),
           say(f"Your deposit is ${deposit:,.2f}. Approve and pay in the card below."))
    out = agent.run("3 nights in Kyoto for 2, book it")
    co = out["checkout"]
    assert co["order_id"] and co["deposit_usd"] == deposit and co["sell_usd"] == sell
    assert fake_paypal.order_amount["value"] == paypal.deposit_for(sell)
    assert bookings.get(co["booking_id"])["status"] == bookings.STATUS_CREATED  # not paid
    assert captured(fake_paypal) == 0
    assert out["agent"]["steps"][-1]["tool"] == "create_checkout" and out["agent"]["steps"][-1]["ok"]


def test_follow_up_turn_can_book_the_plan_from_the_previous_turn(gemini, fake_paypal):
    deposit = float(paypal.deposit_for(advisor.plan(dict(TRIP))["totals"]["sell_usd"]))
    gemini(call("create_checkout"), say(f"Deposit is ${deposit:,.2f}, ready to approve below."))
    out = agent.run("yes, please book it", constraints=dict(TRIP))
    assert out["checkout"]["deposit_usd"] == deposit
    assert out["proposal"]["destination"] == "kyoto-japan"  # so the card can show what is being paid for
    assert captured(fake_paypal) == 0


def test_second_create_checkout_in_one_run_does_not_open_a_second_order(gemini, fake_paypal):
    gemini(call("build_proposal", destination="kyoto-japan", nights=3),
           call("create_checkout"), call("create_checkout"), say("Done."))
    agent.run("3 nights in kyoto, book it")
    assert fake_paypal.count("/v2/checkout/orders") == 1


# ------------------------------------------------------------------ guards

def test_checkout_is_refused_when_the_customer_did_not_ask_to_pay(gemini, fake_paypal):
    g = gemini(call("build_proposal", destination="kyoto-japan", nights=3),
               call("create_checkout"), say("Want me to book this for you?"))
    out = agent.run("3 nights in Kyoto for 2")
    assert out["checkout"] is None and fake_paypal.calls == []
    assert "has not asked" in json.dumps(g.tool_results())
    assert out["agent"]["steps"][-1] == {"tool": "create_checkout", "ok": False, "note": "customer has not asked to pay"}


def test_checkout_without_a_trip_is_refused(gemini, fake_paypal):
    gemini(call("create_checkout"), say("Which destination?"))
    out = agent.run("book it")
    assert out["checkout"] is None and fake_paypal.calls == []


def test_a_revised_trip_drops_the_open_checkout(gemini, fake_paypal):
    gemini(call("build_proposal", destination="kyoto-japan", nights=3),
           call("create_checkout"),
           call("build_proposal", nights=2),
           say("Updated."))
    out = agent.run("3 nights in Kyoto, book it")
    assert out["checkout"] is None  # the old order no longer matches the trip
    assert captured(fake_paypal) == 0


def test_a_price_the_tools_never_returned_replaces_the_reply(gemini):
    gemini(call("build_proposal", destination="kyoto-japan", nights=3, travellers=2),
           say("Great news, the whole trip is only $1.00!"))
    out = agent.run("3 nights in Kyoto for 2")
    assert "$1.00" not in out["reply"] and out["reply"].startswith("Here is a 3-night plan")
    assert out["ai"]["reply"] == "rules" and out["proposal"]


def test_markdown_in_the_reply_is_rejected(gemini):
    gemini(call("build_proposal", destination="kyoto-japan", nights=3), say("**Great** trip!"))
    assert agent.run("3 nights in Kyoto")["ai"]["reply"] == "rules"


def test_search_results_carry_sell_prices_only(gemini):
    g = gemini(call("search_inventory", destination="kyoto-japan", type="stay", limit=3), say("Here are some stays."))
    out = agent.run("what stays are in Kyoto")
    shown = g.tool_results()[0]
    assert 0 < len(shown["items"]) <= 3
    keys = set().union(*(i.keys() for i in shown["items"]))
    assert keys == {"name", "type", "tier", "category", "unit", "price_usd"}  # no net, supplier, markup or id
    assert out["proposal"] is None


def test_unknown_tool_and_bad_arguments_become_tool_errors(gemini):
    g = gemini(call("capture_payment", order_id="X"), call("search_inventory", destination="mars"), say("Sorry."))
    out = agent.run("hello")
    results = g.tool_results()
    assert results[0] == {"error": "Unknown tool."} and results[1] == {"error": "Unknown destination."}
    assert out["reply"] == "Sorry."


def test_there_is_no_capture_tool_and_no_capture_code_path():
    names = {d["name"] for d in agent._declarations()}
    assert names == {"search_inventory", "build_proposal", "create_checkout"}
    assert not hasattr(agent, "paypal")  # the agent module never even imports the PayPal client


def test_rule_matches_beat_a_confused_model(gemini):
    gemini(call("build_proposal", destination="kyoto-japan", nights=9, travellers=2), say("Here you go."))
    out = agent.run("5 nights in Kyoto for 2")
    assert out["proposal"]["nights"] == 5


# ------------------------------------------------------------------ failure and fallback

def test_gemini_http_error_falls_back_to_rules(gemini):
    gemini("HTTP_ERROR")
    out = agent.run("3 nights in Kyoto for 2")
    assert out["agent"]["mode"] == "rules" and out["proposal"] and out["checkout"] is None


def test_runaway_tool_loop_falls_back(gemini):
    gemini(*[call("search_inventory", destination="kyoto-japan") for _ in range(agent.MAX_STEPS + 2)])
    out = agent.run("3 nights in Kyoto for 2")
    assert out["agent"]["mode"] == "rules" and out["proposal"]


def test_failure_after_checkout_keeps_the_open_order(gemini, fake_paypal):
    gemini(call("build_proposal", destination="kyoto-japan", nights=3),
           call("create_checkout"), "HTTP_ERROR")
    out = agent.run("3 nights in Kyoto for 2, book it")
    assert out["checkout"]["order_id"] and "ready" in out["reply"] and "no real money" in out["reply"]
    assert captured(fake_paypal) == 0


def test_paypal_not_configured_is_a_tool_error_not_a_crash(gemini, monkeypatch, tmp_path):
    cfg = replace(paypal.settings, client_id="", client_secret="", bookings_db=str(tmp_path / "b.sqlite3"))
    monkeypatch.setattr(paypal, "settings", cfg)
    g = gemini(call("build_proposal", destination="kyoto-japan", nights=3), call("create_checkout"),
               say("Payments are not set up yet."))
    out = agent.run("3 nights in Kyoto, book it")
    assert out["checkout"] is None and "not configured" in json.dumps(g.tool_results())


# ------------------------------------------------------------------ HTTP route

def test_route_returns_agent_fields_and_validates():
    route._agent_hits.clear()
    r = client.post("/api/advisor/agent", json={"message": "3 nights in Kyoto for 2"})
    assert r.status_code == 200
    body = r.json()
    assert body["agent"]["mode"] == "rules" and body["checkout"] is None and body["proposal"]
    assert client.post("/api/advisor/agent", json={"message": "  "}).status_code == 422
    route._agent_hits.clear()


def test_agent_route_has_its_own_tighter_rate_limit():
    route._agent_hits.clear()
    codes = [client.post("/api/advisor/agent", json={"message": "kyoto 2 nights"}).status_code
             for _ in range(route.AGENT_LIMIT + 1)]
    assert codes[-1] == 429 and set(codes[:-1]) == {200}
    route._agent_hits.clear()
