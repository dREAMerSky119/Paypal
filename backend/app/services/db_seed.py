"""Reads the seed data back out of the database in exactly the shapes the committed JSON files have,
so every service keeps working unchanged whether the data comes from Aiven or from app/data/.

Imported inventory rows (data_origin = 'imported') sort after the generated ones, matching the order
they had in memory before the database existed.
"""
import json

from app import db

_IMPORTED_LAST = "CASE WHEN data_origin = 'imported' THEN 1 ELSE 0 END"

DOCS = {"destinations.json", "overview_seed.json", "inventory_meta.json"}
SUPPORTED = DOCS | {"inventory_items.json", "inventory_suppliers.json", "inventory_rates.json", "bookings.json"}


def _iso(v):
    return v if v is None or isinstance(v, str) else v.isoformat()


def _items(c):
    rows = c.all(
        "SELECT i.item_id, i.supplier_id, i.destination_slug, i.name, i.category, i.item_type, i.tier, i.lat, i.lon,"
        " i.currency, i.base_net_price, i.base_net_price_usd, i.capacity, i.unit, i.markup_pct, i.data_origin,"
        " s.ownership, s.chain_brand, s.locality"
        f" FROM item i LEFT JOIN supplier s ON s.supplier_id = i.supplier_id ORDER BY {_IMPORTED_LAST.replace('data_origin', 'i.data_origin')}, i.item_id")
    return [{
        "id": r["item_id"], "supplier_id": r["supplier_id"], "destination": r["destination_slug"], "name": r["name"],
        "category": r["category"], "type": r["item_type"], "tier": r["tier"], "lat": r["lat"], "lon": r["lon"],
        "currency": r["currency"], "base_net_price": r["base_net_price"], "base_net_price_usd": r["base_net_price_usd"],
        "capacity": r["capacity"], "unit": r["unit"], "markup_pct": r["markup_pct"],
        "responsible": {"ownership": r["ownership"], "chain_brand": r["chain_brand"], "locality": r["locality"]},
        "data_origin": r["data_origin"],
    } for r in rows]


def _suppliers(c):
    rows = c.all(
        "SELECT supplier_id, destination_slug, name, subtype, tier, lat, lon, currency, locality, ownership,"
        f" chain_brand, overture_id, data_origin FROM supplier ORDER BY {_IMPORTED_LAST}, supplier_id")
    return [{
        "id": r["supplier_id"], "destination": r["destination_slug"], "name": r["name"], "kind": r["subtype"],
        "tier": r["tier"], "lat": r["lat"], "lon": r["lon"], "currency": r["currency"], "locality": r["locality"],
        "ownership": r["ownership"], "chain_brand": r["chain_brand"], "overture_id": r["overture_id"],
        "data_origin": r["data_origin"],
    } for r in rows]


def _rates(c):
    rows = c.all(f"SELECT item_id, period, rate_date, price_net, price_net_usd FROM rate ORDER BY {_IMPORTED_LAST}, rate_id")
    return {"columns": ["item_id", "period", "date", "net_price", "net_price_usd"],
            "rows": [[r["item_id"], r["period"], _iso(r["rate_date"]), r["price_net"], r["price_net_usd"]] for r in rows]}


def _bookings(c):
    rows = c.all(
        "SELECT booking_id, item_id, trip_id, destination_slug, market_segment, line_type, tier, check_in, period, currency,"
        " net_cost, sell_price, fees, quantity, nights, lead_time_days, is_canceled, supplier_id, cancel_penalty_usd, data_origin"
        " FROM booking ORDER BY booking_id")
    return [{
        "id": r["booking_id"], "item_id": r["item_id"], "trip_id": r["trip_id"], "destination": r["destination_slug"],
        "channel": r["market_segment"], "type": r["line_type"], "tier": r["tier"], "date": _iso(r["check_in"]),
        "month": r["period"], "currency": r["currency"], "net_amount": r["net_cost"], "sell_amount": r["sell_price"],
        "fees": r["fees"], "quantity": r["quantity"], "nights": r["nights"], "lead_time_days": r["lead_time_days"],
        "is_canceled": bool(r["is_canceled"]), "supplier_id": r["supplier_id"], "cancel_penalty": r["cancel_penalty_usd"],
        "data_origin": r["data_origin"],
    } for r in rows]


def _doc(c, name):
    r = c.one("SELECT body FROM content_doc WHERE doc_name = ?", (name,))
    return json.loads(r["body"]) if r else None


def load(name: str):
    """The data of one seed file from the database; None when the database has none of it yet."""
    with db.connect() as c:
        if name in DOCS:
            return _doc(c, name)
        data = {"inventory_items.json": _items, "inventory_suppliers.json": _suppliers,
                "inventory_rates.json": _rates, "bookings.json": _bookings}[name](c)
        empty = not data["rows"] if isinstance(data, dict) else not data
        return None if empty else data


def save_imported(suppliers: list[dict], items: list[dict], rates: dict[str, list[dict]]) -> None:
    """Persist rows added by the inventory CSV import (one transaction: all or nothing)."""
    with db.connect() as c:
        c.executemany(
            "INSERT INTO supplier (supplier_id, destination_slug, name, subtype, supplier_kind, tier, lat, lon, currency, data_origin)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported')",
            [(s["id"], s["destination"], s["name"], s["kind"], s["kind"], s["tier"], s["lat"], s["lon"], s["currency"]) for s in suppliers])
        c.executemany(
            "INSERT INTO item (item_id, supplier_id, destination_slug, name, category, item_type, tier, lat, lon, currency,"
            " base_net_price, base_net_price_usd, capacity, unit, data_origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'imported')",
            [(i["id"], i["supplier_id"], i["destination"], i["name"], i["category"], i["type"], i["tier"], i["lat"], i["lon"],
              i["currency"], i["base_net_price"], i["base_net_price_usd"], i["capacity"], i["unit"]) for i in items])
        c.executemany(
            "INSERT INTO rate (rate_id, item_id, destination_slug, period, rate_date, currency, price_net, price_net_usd, data_origin)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'imported')",
            [(f"r_{i['id']}", i["id"], i["destination"], r["period"], r["date"], i["currency"], r["net_price"], r["net_price_usd"])
             for i in items for r in rates.get(i["id"], [])])


def table_counts() -> dict[str, int]:
    tables = ("destination", "supplier", "item", "rate", "booking", "demand_monthly", "content_doc", "checkout_booking")
    with db.connect() as c:
        return {t: c.one(f"SELECT COUNT(*) AS n FROM {t}")["n"] for t in tables}
