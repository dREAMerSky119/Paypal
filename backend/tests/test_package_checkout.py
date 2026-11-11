"""Package checkout: the deposit comes from the stored, server-priced quote; the client sends only an id."""
from fastapi.testclient import TestClient

from app.main import app
from app.services import bookings, paypal

client = TestClient(app)


def test_package_order_unknown_package_is_404(monkeypatch):
    monkeypatch.setattr(paypal, "is_configured", lambda: True)
    r = client.post("/api/payments/package-orders", json={"package_id": "PKG-NOPE"})
    assert r.status_code == 404


def test_package_order_needs_paypal_keys(monkeypatch):
    monkeypatch.setattr(paypal, "is_configured", lambda: False)
    r = client.post("/api/payments/package-orders", json={"package_id": "PKG-ANY"})
    assert r.status_code == 503


def test_package_booking_is_null_until_paid():
    r = client.get("/api/payments/packages/PKG-NEVER-PAID/booking")
    assert r.status_code == 200 and r.json() == {"booking": None}
    assert bookings.paid_for_package("PKG-NEVER-PAID") is None


def test_overview_lists_saved_packages_not_seed_journeys():
    body = client.get("/api/overview").json()
    assert all("package_id" in j and "status" in j for j in body["journeys"])
