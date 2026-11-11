from datetime import date
import pytest
from app.services import inventory
from app.services.quote import quote_package, PackageQuoteError

@pytest.fixture(autouse=True)
def reload_inventory():
    inventory.reset()


def first_item(kind, unit=None):
    rows = [x for x in inventory.state()["items"] if x["type"] == kind and (unit is None or x["unit"] == unit)]
    return rows[0]


def test_quote_prices_per_person_and_markup():
    item = first_item("experience", "per_person")
    payload = {"destination": item["destination"], "start_date": "2026-11-20", "nights": 2,
        "travellers": 3, "days": [{"day": 1, "stops": [{"kind": "item", "item_id": item["id"], "slot": "morning"}]}]}
    result = quote_package(payload)
    line = result["line_items"][0]
    assert line["quantity"] == 3
    assert result["totals"]["sell_usd"] >= result["totals"]["net_usd"]
    assert result["totals"]["profit_usd"] == pytest.approx(result["totals"]["sell_usd"] - result["totals"]["net_usd"] - result["totals"]["fees_usd"], abs=.02)


def test_room_quantity_uses_capacity_and_nights():
    item = first_item("stay", "per_room_night")
    payload = {"destination": item["destination"], "start_date": "2026-11-20", "nights": 2,
        "travellers": 5, "stays": [{"item_id": item["id"], "check_in_night": 1, "nights": 2}]}
    result = quote_package(payload)
    assert [x["quantity"] for x in result["line_items"]] == [3, 3]


def test_rejects_unknown_destination():
    with pytest.raises(PackageQuoteError, match="Unknown destination"):
        quote_package({"destination": "not-a-place", "start_date": "2026-11-20", "nights": 2, "travellers": 2})


def test_rejects_out_of_range_trip():
    item = first_item("experience")
    with pytest.raises(PackageQuoteError, match="nights must be"):
        quote_package({"destination": item["destination"], "start_date": "2026-11-20", "nights": 22, "travellers": 2})


def test_month_boundary_uses_service_months():
    item = first_item("stay", "per_room_night")
    payload = {"destination": item["destination"], "start_date": "2026-11-30", "nights": 2,
        "travellers": 2, "stays": [{"item_id": item["id"], "check_in_night": 1, "nights": 2}]}
    result = quote_package(payload)
    assert result["rate_months"] == ["2026-11", "2026-12"]


def test_rejects_cross_destination_inventory():
    items = inventory.state()["items"]
    first = next(x for x in items if x["type"] == "experience")
    other = next(x for x in items if x["type"] == "experience" and x["destination"] != first["destination"])
    payload = {"destination": first["destination"], "start_date": "2026-11-20", "nights": 2,
        "travellers": 2, "days": [{"day": 1, "stops": [{"kind": "item", "item_id": other["id"]}]}]}
    with pytest.raises(PackageQuoteError, match="belongs to"):
        quote_package(payload)
