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
