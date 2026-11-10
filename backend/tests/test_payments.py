"""Payments tests. PayPal is fully mocked through an httpx MockTransport: no network, no real keys."""
import json
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.routes import payments as route
from app.main import app
from app.services import advisor, bookings, paypal

client = TestClient(app)

CONSTRAINTS = {"destination": "kyoto-japan", "nights": 3, "travellers": 2}


class FakePayPal:
    """Records every call and answers like the sandbox API would."""

    def __init__(self):
        self.calls: list[tuple[str, str, dict | None]] = []
        self.order_amount: dict | None = None
        self.capture_amount_override: str | None = None
        self.capture_status = "COMPLETED"
        self.fail_create = False

    def count(self, path: str) -> int:
        return sum(1 for _, p, _ in self.calls if p == path)

    def handler(self, request: httpx.Request) -> httpx.Response:
        path = request.url.path
        body = json.loads(request.content) if request.content and "json" in request.headers.get("content-type", "") else None
        self.calls.append((request.method, path, body))
        if path == "/v1/oauth2/token":
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
        if path == "/v2/checkout/orders":
            if self.fail_create:
                return httpx.Response(422, json={"name": "UNPROCESSABLE_ENTITY", "details": [{"description": "Currency not supported"}]})
            self.order_amount = body["purchase_units"][0]["amount"]
            return httpx.Response(201, json={"id": f"ORDER{len(self.calls)}", "status": "CREATED"})
        if path.endswith("/capture"):
            amount = dict(self.order_amount)
            if self.capture_amount_override:
                amount["value"] = self.capture_amount_override
            return httpx.Response(201, json={
                "id": path.split("/")[-2], "status": "COMPLETED",
                "payer": {"email_address": "buyer@example.com"},
                "purchase_units": [{"payments": {"captures": [
                    {"id": "CAP1", "status": self.capture_status, "amount": amount}]}}],
            })
        return httpx.Response(404, json={"message": "not found"})


@pytest.fixture
def fake(monkeypatch, tmp_path):
    f = FakePayPal()
    cfg = replace(paypal.settings, client_id="test-id", client_secret="test-secret",
                  deposit_pct=30.0, bookings_db=str(tmp_path / "bookings.sqlite3"))
    monkeypatch.setattr(paypal, "settings", cfg)
    monkeypatch.setattr(bookings, "settings", cfg)
    monkeypatch.setattr(paypal, "_transport", httpx.MockTransport(f.handler))
    paypal.reset_token_cache()
    route._hits.clear()
    yield f
    paypal.reset_token_cache()


@pytest.fixture
def unconfigured(monkeypatch, tmp_path):
    cfg = replace(paypal.settings, client_id="", client_secret="", bookings_db=str(tmp_path / "b.sqlite3"))
    monkeypatch.setattr(paypal, "settings", cfg)
    monkeypatch.setattr(bookings, "settings", cfg)
    route._hits.clear()


def order(body=None):
    return client.post("/api/payments/orders", json=body or {"constraints": CONSTRAINTS})


# ------------------------------------------------------------------ config

def test_config_reports_unconfigured_and_hides_client_id(unconfigured):
    body = client.get("/api/payments/config").json()
    assert body["configured"] is False and body["client_id"] is None and body["environment"] == "sandbox"


def test_config_exposes_only_the_public_client_id(fake):
    text = client.get("/api/payments/config").text
    body = json.loads(text)
    assert body["configured"] is True and body["client_id"] == "test-id" and body["deposit_pct"] == 30.0
    assert "test-secret" not in text


def test_orders_503_without_keys(unconfigured):
    assert order().status_code == 503


# ------------------------------------------------------------------ create order

def test_order_charges_deposit_of_server_computed_price(fake):
    expected_sell = advisor.plan(dict(CONSTRAINTS))["totals"]["sell_usd"]
    r = order()
    assert r.status_code == 200
    body = r.json()
    assert body["sell_usd"] == expected_sell
    assert body["deposit_usd"] == float(paypal.deposit_for(expected_sell))
    assert fake.order_amount == {"currency_code": "USD", "value": paypal.deposit_for(expected_sell)}
    assert body["balance_usd"] == round(expected_sell - body["deposit_usd"], 2)
    assert body["booking_id"].startswith("WF-") and body["order_id"]


def test_client_cannot_set_the_amount(fake):
    expected = paypal.deposit_for(advisor.plan(dict(CONSTRAINTS))["totals"]["sell_usd"])
    r = order({"constraints": CONSTRAINTS, "amount_usd": 0.01, "amount": "0.01", "deposit_usd": 0.01})
    assert r.status_code == 200
    assert fake.order_amount["value"] == expected


def test_order_422_when_trip_details_missing(fake):
    r = order({"constraints": {"destination": "kyoto-japan"}})
    assert r.status_code == 422 and "nights" in r.json()["detail"]
    assert fake.count("/v2/checkout/orders") == 0


def test_order_422_for_unknown_destination(fake):
    assert order({"constraints": {"destination": "mars", "nights": 3}}).status_code == 422


def test_paypal_rejection_becomes_502_and_no_booking(fake):
    fake.fail_create = True
    r = order()
    assert r.status_code == 502 and "Currency not supported" in r.json()["detail"]


def test_token_is_cached_across_calls(fake):
    order()
    order()
    assert fake.count("/v1/oauth2/token") == 1


# ------------------------------------------------------------------ capture

def test_capture_marks_booking_paid_and_hides_payer_email(fake):
    created = order().json()
    r = client.post(f"/api/payments/orders/{created['order_id']}/capture")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "PAID" and body["capture_id"] == "CAP1" and body["paid_at"]
    assert body["proposal"]["lines"] and "buyer@example.com" not in r.text
    assert client.get(f"/api/payments/bookings/{created['booking_id']}").json()["status"] == "PAID"


def test_capture_twice_does_not_charge_twice(fake):
    created = order().json()
    url = f"/api/payments/orders/{created['order_id']}/capture"
    assert client.post(url).status_code == 200
    assert client.post(url).json()["status"] == "PAID"
    assert sum(1 for _, p, _ in fake.calls if p.endswith("/capture")) == 1


def test_capture_unknown_order_is_404_and_never_reaches_paypal(fake):
    assert client.post("/api/payments/orders/SOMEONEELSES/capture").status_code == 404
    assert fake.count("/v1/oauth2/token") == 0


def test_capture_with_wrong_amount_is_not_confirmed(fake):
    created = order().json()
    fake.capture_amount_override = "0.01"
    r = client.post(f"/api/payments/orders/{created['order_id']}/capture")
    assert r.status_code == 502
    assert client.get(f"/api/payments/bookings/{created['booking_id']}").json()["status"] == "CREATED"


def test_capture_not_completed_is_not_confirmed(fake):
    created = order().json()
    fake.capture_status = "PENDING"
    assert client.post(f"/api/payments/orders/{created['order_id']}/capture").status_code == 502
    assert client.get(f"/api/payments/bookings/{created['booking_id']}").json()["status"] == "CREATED"


# ------------------------------------------------------------------ bookings, helpers, limits

def test_unknown_booking_404(fake):
    assert client.get("/api/payments/bookings/WF-NOPE").status_code == 404


def test_money_and_deposit_rounding(fake):
    assert paypal.money(12.5) == "12.50" and paypal.money("0.005") == "0.01"
    assert paypal.deposit_for(1000) == "300.00"
    assert paypal.deposit_for(0.01) == "0.01"  # never rounds down to zero


def test_rate_limit(fake):
    codes = [order({"constraints": {}}).status_code for _ in range(route.LIMIT + 1)]
    assert codes[-1] == 429
