"""Phase B acceptance: packages round-trip through the API, bad payloads return clear 4xx,
quotes cover multi-day / multi-traveller / out-of-range / missing-rate cases, and saved
packages survive a restart (new store instance, same SQLite file)."""
from dataclasses import replace
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.services import inventory, packages

client = TestClient(app)


@pytest.fixture(autouse=True)
def _offline(monkeypatch, tmp_path):
    monkeypatch.setattr(db, "db_settings", replace(db.db_settings, url="", packages_db=str(tmp_path / "packages.sqlite3")))
    inventory.reset()


def _trip_payload(**over):
    items = inventory.state()["items"]
    stay = next(x for x in items if x["type"] == "stay" and x["unit"] == "per_room_night")
    exp = next(x for x in items if x["type"] == "experience" and x["unit"] == "per_person" and x["destination"] == stay["destination"])
    payload = {
        "title": "Two quiet days",
        "destination": stay["destination"],
        "start_date": "2026-11-20",
        "nights": 2,
        "travellers": 3,
        "stays": [{"item_id": stay["id"], "name": stay["name"], "check_in_night": 1, "nights": 2}],
        "days": [
            {"day": 1, "stops": [{"kind": "item", "item_id": exp["id"], "name": exp["name"], "slot": "morning", "type": exp["type"]}]},
            {"day": 2, "stops": [{"kind": "item", "item_id": exp["id"], "name": exp["name"], "slot": "afternoon", "type": exp["type"]}]},
        ],
    }
    payload.update(over)
    return payload


def test_quote_multi_day_multi_traveller():
    quote = client.post("/api/packages/quote", json=_trip_payload()).json()
    assert quote["rate_months"] == ["2026-11"]
    assert [x["quantity"] for x in quote["line_items"] if x["type"] == "stay"] == [2, 2]  # 3 travellers -> 2 rooms
    assert [x["quantity"] for x in quote["line_items"] if x["type"] == "experience"] == [3, 3]
    assert quote["totals"]["per_person_usd"] == pytest.approx(quote["totals"]["sell_usd"] / 3, abs=.02)
    assert quote["checks"]["travel_time"] is not None


def test_quote_rejects_out_of_range_dates_and_missing_fields():
    r = client.post("/api/packages/quote", json={"destination": "kyoto-japan", "start_date": "20/11/2026", "nights": 2, "travellers": 2})
    assert r.status_code == 400 and "start_date" in r.json()["detail"]
    r = client.post("/api/packages/quote", json={"destination": "kyoto-japan", "start_date": "2026-11-20", "nights": 40, "travellers": 2})
    assert r.status_code == 400 and "nights" in r.json()["detail"]
    r = client.post("/api/packages/quote", json=_trip_payload(nights=2, travellers=0))
    assert r.status_code == 400


def test_quote_flags_duplicate_and_missing_rate():
    payload = _trip_payload(days=[{"day": 1, "stops": [
        {"kind": "item", "item_id": "x1"}, {"kind": "item", "item_id": "x1", "slot": "afternoon"}]}])
    r = client.post("/api/packages/quote", json=payload)
    assert r.status_code == 400 and "Unknown inventory item" in r.json()["detail"]
    # Missing rate: a date outside the seeded Jan 2025-Dec 2027 window
    items = inventory.state()["items"]
    stay = next(x for x in items if x["type"] == "stay")
    r = client.post("/api/packages/quote", json=_trip_payload(destination=stay["destination"], start_date="2030-06-01"))
    assert r.status_code == 400 and "No monthly rate" in r.json()["detail"]


def test_package_round_trips_through_the_api():
    created = client.post("/api/packages", json=_trip_payload()).json()
    assert created["package_id"].startswith("PKG-") and created["revision"] == 1
    pid = created["package_id"]

    listed = client.get("/api/packages").json()
    assert listed["count"] == 1 and listed["items"][0]["package_id"] == pid

    fetched = client.get(f"/api/packages/{pid}").json()
    assert fetched["payload"]["stays"] == created["stays"]
    assert [s["item_id"] for s in fetched["payload"]["days"][1]["stops"]] == [created["days"][1]["stops"][0]["item_id"]]
    assert fetched["quote"]["totals"]["sell_usd"] == created["quote"]["totals"]["sell_usd"]
    assert [l["item_id"] for l in fetched["stored_lines"]] == [x["item_id"] for x in created["quote"]["line_items"]]


def test_bad_save_returns_clear_400_and_404():
    r = client.post("/api/packages", json={"title": "No destination"})
    assert r.status_code == 400 and "destination" in r.json()["detail"]
    assert client.get("/api/packages/PKG-nothing").status_code == 404
    assert client.put("/api/packages/PKG-nothing", json=_trip_payload()).status_code == 404


def test_optimistic_concurrency_rejects_stale_revision():
    created = client.post("/api/packages", json=_trip_payload()).json()
    pid = created["package_id"]
    # Two readers see revision 1; the second save must not clobber the first.
    first = client.put(f"/api/packages/{pid}", json={**_trip_payload(title="Edit A"), "revision": 1})
    assert first.status_code == 200 and first.json()["revision"] == 2
    second = client.put(f"/api/packages/{pid}", json={**_trip_payload(title="Edit B"), "revision": 1})
    assert second.status_code == 409
    assert client.get(f"/api/packages/{pid}").json()["payload"]["title"] == "Edit A"


def test_saved_package_survives_a_restart(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'packages.sqlite3'}"
    monkeypatch.setattr(db, "db_settings", replace(db.db_settings, url=url))
    created = client.post("/api/packages", json=_trip_payload()).json()
    pid = created["package_id"]
    packages._ready.clear()  # simulate a fresh process
    again = client.get(f"/api/packages/{pid}").json()
    assert again["payload"]["title"] == "Two quiet days"
    assert again["quote"]["totals"]["sell_usd"] == created["quote"]["totals"]["sell_usd"]
    assert client.delete(f"/api/packages/{pid}").status_code == 204
    assert client.get(f"/api/packages/{pid}").status_code == 404
