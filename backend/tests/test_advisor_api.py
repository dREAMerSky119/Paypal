from fastapi.testclient import TestClient

from app.api.routes import advisor as route
from app.main import app

client = TestClient(app)


def post(body):
    return client.post("/api/advisor/plan", json=body)


def test_plan_returns_proposal():
    route._hits.clear()
    r = post({"message": "3 nights in Kyoto for 2"})
    assert r.status_code == 200 and r.json()["proposal"]["is_sample"] is True


def test_destination_hint_fills_destination():
    route._hits.clear()
    r = post({"message": "4 nights for 2", "destination": "bali-indonesia"})
    assert r.json()["proposal"]["destination"] == "bali-indonesia"


def test_missing_info_asks_instead_of_guessing():
    route._hits.clear()
    body = post({"message": "hello"}).json()
    assert body["proposal"] is None and body["missing"]


def test_validation_errors_are_422():
    route._hits.clear()
    assert post({"message": "  "}).status_code == 422
    assert post({"message": "3 nights in Kyoto", "constraints": {"destination": "mars"}}).status_code == 422


def test_rate_limit():
    route._hits.clear()
    codes = [post({"message": "kyoto 2 nights"}).status_code for _ in range(route.LIMIT + 1)]
    assert codes[-1] == 429
    route._hits.clear()
<<<<<<< HEAD
=======


def test_unified_chat_plans_and_returns_inventory_recommendations():
    r = client.post("/api/advisor/chat", json={
        "messages": [{"role": "user", "content": "Plan 3 nights in Kyoto for 2"}]
    })
    body = r.json()
    assert r.status_code == 200
    assert body["mode"] == "planning"
    assert body["proposal"]["destination"] == "kyoto-japan"
    assert body["recommendations"]
    assert {item["type"] for item in body["recommendations"]} >= {"stay", "guide", "experience"}
    assert body["places"] and body["places"][0]["name"]


def test_unified_chat_rejects_invalid_history():
    r = client.post("/api/advisor/chat", json={
        "messages": [{"role": "model", "content": "hello"}]
    })
    assert r.status_code == 422


def test_inventory_follow_up_uses_destination_from_prior_turn():
    from app.services.unified_assistant import _inventory_context

    context = _inventory_context("show me local guides", "kyoto-japan")
    assert context["destination_filter"] == "kyoto-japan"
    assert context["count"] > 0
    assert all(item["destination"] == "kyoto-japan" for item in context["items"])
>>>>>>> fe70b5b (Add updated project files final one)
