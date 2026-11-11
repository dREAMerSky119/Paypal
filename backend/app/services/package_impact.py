"""Responsible score, carbon estimate and swap suggestions for a package quote (Phase F).

The quote engine passes in its priced lines. Everything here is derived from
verified claims only (see services/responsible.py) and from the proxy carbon
factors in responsible.CARBON_FACTORS. Nothing is invented: when a line's
supplier has no verified claim it counts as "not yet verified", never as zero,
and a missing distance is reported as not included instead of being guessed.
"""
from __future__ import annotations

from typing import Callable

from app.services import inventory, responsible

MAX_SWAPS = 3
MAX_SWAP_PRICE_RISE_PCT = 25.0  # a swap that costs much more is not offered
SELF_REPORTED_NOTE = (
    "Self-reported and unverified claims are not counted. They can be read in the item details."
)


def _haversine_km(a: dict, b: dict):
    from app.services.quote import _haversine_km as haversine  # local import: quote imports this module
    return haversine(a, b)


def responsible_score(lines: list[dict], items: dict[str, dict]) -> dict:
    """Spend-weighted verified score for the package, plus how much of it is covered."""
    total_sell = sum(line["sell_usd"] for line in lines)
    by_supplier: dict[str, dict] = {}
    for line in lines:
        item = items.get(line["item_id"])
        if not item:
            continue
        sid = item["supplier_id"]
        entry = by_supplier.setdefault(sid, {"supplier_id": sid, "sell_usd": 0.0})
        entry["sell_usd"] += line["sell_usd"]

    scored_sell = weighted = 0.0
    verified_suppliers = 0
    pending_claims = 0
    suppliers_out = []
    for sid, entry in by_supplier.items():
        summary = responsible.supplier_summary(sid)
        score = summary["score"] if summary else None
        pending_claims += summary["pending_claim_count"] if summary else 0
        if score is not None:
            scored_sell += entry["sell_usd"]
            weighted += entry["sell_usd"] * score
            verified_suppliers += 1
        supplier = next((s for s in inventory.state()["suppliers"] if s["id"] == sid), {})
        suppliers_out.append({
            "supplier_id": sid,
            "name": supplier.get("name"),
            "spend_share_pct": round(entry["sell_usd"] / total_sell * 100, 1) if total_sell else 0.0,
            "score": score,
            "badge": bool(summary and summary["badge"]),
            "status": summary["status"] if summary else "not_yet_verified",
        })
    suppliers_out.sort(key=lambda s: -s["spend_share_pct"])

    coverage = round(scored_sell / total_sell * 100, 1) if total_sell else 0.0
    score = round(weighted / scored_sell, 1) if scored_sell else None
    badge = None
    if score is not None and coverage >= responsible.PACKAGE_BADGE_MIN_COVERAGE_PCT:
        badge = responsible.badge_for(score, verified_suppliers)

    if score is None:
        status, message = "not_yet_verified", "None of this package's partners has verified claims yet, so no score is shown."
    elif badge:
        status, message = "badge", f"{coverage:g}% of spend is with partners that have verified claims, and their spend-weighted score is {score:g}."
    else:
        status = "scored"
        message = (
            f"{coverage:g}% of spend is with scored partners (score {score:g}). "
            f"No badge: it needs {responsible.PACKAGE_BADGE_MIN_COVERAGE_PCT:g}% coverage and a score of {responsible.badge_threshold():g}."
        )
    return {
        "score": score,
        "badge": badge,
        "status": status,
        "coverage_pct": coverage,
        "scored_supplier_count": verified_suppliers,
        "supplier_count": len(by_supplier),
        "suppliers": suppliers_out,
        "self_reported_claims_not_counted": pending_claims,
        "message": message,
        "note": SELF_REPORTED_NOTE,
        "is_sample": True,
    }


def carbon_estimate(lines: list[dict], day_coords: dict[int, list[dict]], travellers: int) -> dict:
    """Accommodation from the stay lines, ground travel from straight-line distance between stops.

    Flights and airport transfers are left out because a package does not hold their
    distances. The estimate says so instead of guessing.
    """
    factors = responsible.CARBON_FACTORS
    room_nights = sum(line["quantity"] for line in lines if line["type"] == "stay")
    road_km = 0.0
    for stops in day_coords.values():
        for a, b in zip(stops, stops[1:]):
            km = _haversine_km(a, b)
            if km is not None and km >= 0.5:
                road_km += km
    components = {
        "accommodation": room_nights * factors["hotel"],
        "ground_between_stops": road_km * factors["road"] * travellers,
    }
    total = sum(components.values())
    return {
        "total_kg": round(total, 1),
        "per_traveller_kg": round(total / travellers, 1) if travellers else 0.0,
        "components_kg": {key: round(value, 1) for key, value in components.items()},
        "inputs": {"room_nights": round(room_nights, 1), "ground_km_straight_line": round(road_km, 1)},
        "not_included": ["flights", "airport and hotel transfers", "meals and activities"],
        "assumptions": (
            "Planning estimate from proxy factors, not a measured or audited footprint. "
            "Ground distance is straight-line between stops, so real travel is usually longer."
        ),
        "factors": {"hotel_kg_per_room_night": factors["hotel"], "road_kg_per_passenger_km": factors["road"]},
        "is_sample": True,
    }


def swap_suggestions(
    lines: list[dict],
    items: dict[str, dict],
    price_line: Callable[[dict, str, float], tuple[float, float] | None],
) -> list[dict]:
    """Offer a like-for-like swap for lines whose supplier has no badge.

    The alternative must share destination, type, category, tier and pricing unit, belong to a
    badged supplier, carry no open anomaly flag and not push that line's price up by more than
    MAX_SWAP_PRICE_RISE_PCT. Suggestions are advice only; nothing is changed automatically.
    """
    state = inventory.state()
    suppliers = {s["id"]: s for s in state["suppliers"]}
    in_package = {line["item_id"] for line in lines}
    out = []
    seen_items = set()
    for line in lines:
        item = items.get(line["item_id"])
        if not item or line["item_id"] in seen_items:
            continue
        seen_items.add(line["item_id"])
        current = responsible.supplier_summary(item["supplier_id"])
        if current and current["badge"]:
            continue
        best = None
        for alt in state["items"]:
            if (alt["id"] in in_package or alt["supplier_id"] == item["supplier_id"]
                    or alt["destination"] != item["destination"] or alt["type"] != item["type"]
                    or alt["category"] != item["category"] or alt["tier"] != item["tier"]
                    or alt["unit"] != item["unit"]):
                continue
            summary = responsible.supplier_summary(alt["supplier_id"])
            if not summary or not summary["badge"]:
                continue
            if _has_open_flag(alt["id"]):
                continue
            priced = price_line(alt, line["date"], line["quantity"])
            if priced is None:
                continue
            new_sell, _ = priced
            delta = new_sell - line["sell_usd"]
            delta_pct = delta / line["sell_usd"] * 100 if line["sell_usd"] else 0.0
            if delta_pct > MAX_SWAP_PRICE_RISE_PCT:
                continue
            key = (-summary["score"], delta)
            if best is None or key < best[0]:
                best = (key, alt, summary, delta, delta_pct)
        if best is None:
            continue
        _, alt, summary, delta, delta_pct = best
        out.append({
            "line_item_id": line["item_id"],
            "from": {
                "item_id": item["id"], "name": item["name"],
                "supplier": suppliers.get(item["supplier_id"], {}).get("name"),
                "score": current["score"] if current else None,
                "status": current["status"] if current else "not_yet_verified",
            },
            "to": {
                "item_id": alt["id"], "name": alt["name"],
                "supplier": suppliers.get(alt["supplier_id"], {}).get("name"),
                "score": summary["score"], "badge": True,
            },
            "delta_sell_usd": round(delta, 2),
            "delta_pct": round(delta_pct, 1),
            "reason": (
                f"Same {item['category'].replace('_', ' ')} at the same tier. The partner has verified "
                f"claims worth {summary['score']:g} points. That is a record of claims, not a guarantee."
            ),
            "is_sample": True,
        })
    out.sort(key=lambda s: (-(s["to"]["score"] - (s["from"]["score"] or 0)), s["delta_sell_usd"]))
    return out[:MAX_SWAPS]


def _has_open_flag(item_id: str) -> bool:
    try:
        from app.services import anomalies
        return bool(anomalies.item_flag(item_id))
    except Exception:
        return False  # a detector failure must not hide a valid swap


def build(lines, items, day_coords, travellers, price_line) -> dict:
    return {
        "responsible_score": responsible_score(lines, items),
        "carbon": carbon_estimate(lines, day_coords, travellers),
        "swap_suggestions": swap_suggestions(lines, items, price_line),
    }
