"""Package Builder quote engine. Inventory and rates are read from the existing inventory service."""
from __future__ import annotations
import json, math, statistics
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from app.services import inventory

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
MAX_TRAVELLERS, MAX_NIGHTS = 40, 21
VALID_UNITS = {"per_room_night", "per_person", "per_guide_day", "per_guide_half_day", "per_vehicle", "per_vehicle_day"}

class PackageQuoteError(ValueError):
    """Invalid package request; suitable for an HTTP 400 response."""


def _read_json(name, default):
    path = DATA_DIR / name
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def _ceil_div(a, b):
    return math.ceil(a / max(1, b))


def _median(values):
    clean = [float(v) for v in values if v is not None and float(v) > 0]
    return statistics.median(clean) if clean else None


def _rate_for(item, service_date, rates, peer_medians):
    month = service_date.strftime("%Y-%m")
    rows = rates.get(item["id"], [])
    row = next((r for r in rows if r.get("period") == month), None)
    base = float(item.get("base_net_price_usd") or 0)
    if row is None:
        raise PackageQuoteError(f"No monthly rate for {item['name']} in {month}; supported rate period is Jan 2025–Dec 2027")
    value = float(row.get("net_price_usd") or 0)
    peer_key = (item.get("destination"), item.get("type"), item.get("category"))
    median = peer_medians.get(peer_key) or base
    trusted = value > 0 and median > 0 and median / 6 <= value <= median * 6
    if not trusted:
        return base, True, month
    return value, False, month


def _haversine_km(a, b):
    if None in (a.get("lat"), a.get("lon"), b.get("lat"), b.get("lon")):
        return None
    from math import radians, sin, cos, asin, sqrt
    lat1, lon1, lat2, lon2 = map(radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = sin((lat2-lat1)/2)**2 + cos(lat1)*cos(lat2)*sin((lon2-lon1)/2)**2
    return 6371 * 2 * asin(sqrt(h))


def _travel_warnings(day_coords: dict[int, list[dict]]) -> list[str]:
    """Estimated transfer time between consecutive stops in a day, from stop coordinates.
    Modes: 60 km/h when either stop is a transport leg, 35 km/h for local road travel."""
    out = []
    for day_no, stops in sorted(day_coords.items()):
        for a, b in zip(stops, stops[1:]):
            km = _haversine_km(a, b)
            if km is None or km < 0.5:
                continue  # same place, or coordinates missing on either stop
            speed = 60 if "transport" in (a.get("type"), b.get("type")) else 35
            minutes = round(km / speed * 60)
            if minutes >= 90:
                out.append(f"Day {day_no}: about {minutes} min transfer between {a['name']} and {b['name']}")
    return out


def quote_package(payload: dict) -> dict:
    """Validate and price a package payload; never trust client-supplied totals."""
    if not isinstance(payload, dict):
        raise PackageQuoteError("Package must be an object")
    destination = payload.get("destination")
    try:
        start = date.fromisoformat(payload.get("start_date", ""))
    except (TypeError, ValueError):
        raise PackageQuoteError("start_date must use YYYY-MM-DD") from None
    try:
        nights, travellers = int(payload.get("nights", 0)), int(payload.get("travellers", 0))
    except (TypeError, ValueError):
        raise PackageQuoteError("nights and travellers must be whole numbers") from None
    if not 1 <= nights <= MAX_NIGHTS:
        raise PackageQuoteError(f"nights must be between 1 and {MAX_NIGHTS}")
    if not 1 <= travellers <= MAX_TRAVELLERS:
        raise PackageQuoteError(f"travellers must be between 1 and {MAX_TRAVELLERS}")

    state = inventory.state()
    items = {i["id"]: i for i in state["items"]}
    if destination not in state["destinations"]:
        raise PackageQuoteError(f"Unknown destination '{destination}'")
    rates = state["rates"]
    peer_values = defaultdict(list)
    for i in state["items"]:
        for r in rates.get(i["id"], []):
            try:
                val = float(r.get("net_price_usd") or 0)
            except (TypeError, ValueError):
                continue
            if val > 0:
                peer_values[(i["destination"], i["type"], i["category"])].append(val)
    peer_medians = {k: _median(v) for k, v in peer_values.items()}

    errors, warnings, lines, used_months = [], [], [], set()
    slot_usage: dict[int, dict[str, str]] = {}
    day_coords: dict[int, list[dict]] = {}
    def add_item(item_id, service_day, quantity, section, label=None):
        item = items.get(item_id)
        if not item:
            errors.append(f"Unknown inventory item '{item_id}'")
            return None
        if item["destination"] != destination:
            errors.append(f"{item['name']} belongs to {item['destination']}, not {destination}")
            return None
        if item.get("unit") not in VALID_UNITS:
            errors.append(f"Unsupported pricing unit for {item['name']}: {item.get('unit')}")
            return None
        unit_price, untrusted, month = _rate_for(item, service_day, rates, peer_medians)
        used_months.add(month)
        if untrusted:
            warnings.append(f"Untrusted monthly rate for {item['name']} in {month}; base price used")
        markup = float(item.get("markup_pct") or 0) / 100
        net = unit_price * quantity
        sell = net * (1 + markup)
        lines.append({"item_id": item_id, "name": item["name"], "type": item["type"],
            "section": section, "date": service_day.isoformat(), "unit": item["unit"],
            "quantity": quantity, "unit_net_usd": round(unit_price, 2),
            "net_usd": round(net, 2), "markup_pct": round(markup*100, 2),
            "sell_usd": round(sell, 2), "rate_untrusted": untrusted})
        if travellers > int(item.get("capacity") or 1) and item["unit"] in {"per_person", "per_guide_day", "per_guide_half_day", "per_vehicle", "per_vehicle_day"}:
            warnings.append(f"Group exceeds listed capacity for {item['name']}; quantity scaled where applicable")
        return item

    stays = payload.get("stays") or []
    covered = [0] * nights
    for stay in stays:
        try:
            first, length = int(stay.get("check_in_night", 1)), int(stay.get("nights", 0))
        except (TypeError, ValueError):
            errors.append("Stay check_in_night and nights must be whole numbers")
            continue
        if length < 1 or first < 1 or first + length - 1 > nights:
            errors.append("Stay dates must fit within the package nights")
            continue
        item = items.get(stay.get("item_id"))
        if not item:
            errors.append(f"Unknown inventory item '{stay.get('item_id')}'")
            continue
        if item.get("type") != "stay":
            errors.append(f"{item.get('name')} is not a stay")
            continue
        rooms = _ceil_div(travellers, int(item.get("capacity") or 1))
        for n in range(first - 1, first - 1 + length):
            if covered[n]: errors.append(f"Stay overlap on night {n+1}")
            covered[n] += 1
            add_item(item["id"], start + timedelta(days=n), rooms, "stay")
    if stays and any(v == 0 for v in covered):
        errors.append("Stay coverage has gaps")

    seen = set()
    for day in payload.get("days") or []:
        try: day_no = int(day.get("day"))
        except (TypeError, ValueError):
            errors.append("Each itinerary day needs a valid day number"); continue
        if not 1 <= day_no <= nights + 1:
            errors.append(f"Day {day_no} is outside the trip")
            continue
        service_day = start + timedelta(days=day_no-1)
        for stop in day.get("stops") or []:
            if stop.get("kind") == "spot":
                continue
            item_id = stop.get("item_id")
            item = items.get(item_id)
            if not item:
                errors.append(f"Unknown inventory item '{item_id}'"); continue
            if item["type"] == "stay":
                errors.append(f"Stay {item['name']} must be added in the stays section"); continue
            unit = item.get("unit")
            capacity = int(item.get("capacity") or 1)
            if unit == "per_person": qty = travellers
            elif unit in {"per_guide_day", "per_guide_half_day", "per_vehicle", "per_vehicle_day"}: qty = _ceil_div(travellers, capacity)
            else:
                errors.append(f"Unsupported unit {unit} for {item['name']}"); continue
            slot = stop.get("slot") or "unspecified"
            duplicate_key = (day_no, item_id)
            if duplicate_key in seen: warnings.append(f"Duplicate {item['name']} on day {day_no}")
            seen.add(duplicate_key)
            if slot in slot_usage.setdefault(day_no, {}):
                warnings.append(f"Two stops share the {slot} slot on day {day_no}")
            else:
                slot_usage[day_no][slot] = item_id
            if item.get("lat") is not None and item.get("lon") is not None:
                day_coords.setdefault(day_no, []).append(item)
            add_item(item_id, service_day, qty, f"day_{day_no}:{slot}")

    transfers = payload.get("transfers") or {}
    for key, service_day in (("arrival", start), ("departure", start + timedelta(days=nights))):
        item_id = transfers.get(key)
        if not item_id:
            warnings.append(f"No {key} transfer selected")
            continue
        item = items.get(item_id)
        if item and item.get("type") != "transport":
            errors.append(f"{item.get('name')} is not transport")
            continue
        if item:
            unit = item.get("unit")
            qty = travellers if unit == "per_person" else (_ceil_div(travellers, int(item.get("capacity") or 1)) if unit in {"per_vehicle", "per_vehicle_day"} else 1)
            add_item(item_id, service_day, qty, f"transfer_{key}")

    if errors:
        raise PackageQuoteError("; ".join(dict.fromkeys(errors)))

    travel = _travel_warnings(day_coords)
    warnings.extend(travel)

    fees_cfg = _read_json("package_fees.json", {"fee_rate": 0})
    fee_rate = float(fees_cfg.get("fee_rate", 0) or 0)
    net_total = sum(x["net_usd"] for x in lines)
    sell_total = sum(x["sell_usd"] for x in lines)
    fees = sell_total * fee_rate
    profit = sell_total - net_total - fees
    margin = profit / sell_total if sell_total else 0
    if margin < 0: warnings.append("Package has a negative margin")
    elif margin < 0.10: warnings.append("Package margin is below 10%")
    duplicate_warnings = [w for w in warnings if w.startswith(("Duplicate ", "Two stops share"))]
    return {"destination": destination, "start_date": start.isoformat(), "nights": nights,
        "travellers": travellers, "line_items": lines, "totals": {
            "net_usd": round(net_total, 2), "sell_usd": round(sell_total, 2),
            "fees_usd": round(fees, 2), "profit_usd": round(profit, 2),
            "margin_pct": round(margin*100, 2), "per_person_usd": round(sell_total/travellers, 2)},
        "fee_rate": fee_rate, "rate_months": sorted(used_months),
        "warnings": list(dict.fromkeys(warnings)),
        "checks": {
            "travel_time": travel,
            "duplicates": duplicate_warnings,
            "anomaly_flags": [],  # filled by the anomaly service in Phase C
            "margin": {"margin_pct": round(margin*100, 2),
                       "level": "negative" if margin < 0 else "low" if margin < 0.10 else "ok"},
            "responsible_score": None,  # filled in Phase F
            "carbon": None,  # filled in Phase F
        },
        "is_sample": True}
