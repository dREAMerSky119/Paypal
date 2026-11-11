
"""Responsible travel scoring from the project's supplied master CSV.

Supplier scores are calculated as the sum of claim points whose status is
`verified`. Self-reported and unverified claims are visible but contribute 0.
The supplier.score column is retained as a cross-check; in the supplied sample
CSV it matches this calculation for all 171 suppliers.
"""
import csv
import json
import math
from collections import defaultdict
from functools import lru_cache
from pathlib import Path

from app.services.seed import load_json

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
CSV_PATH = DATA_DIR / "wayfare_master.csv"
DESTINATIONS_PATH = DATA_DIR / "destinations.json"

WEIGHTS = {
    "local_ownership": 35,
    "certification": 30,
    "community_benefit": 20,
    "environmental": 15,
}
VERIFICATION_STATUSES = {"verified", "self_reported", "unverified"}

# Transparent planning estimates, kg CO2e per passenger-km / room-night.
# These are explicitly presented as approximate proxies, not official country factors.
CARBON_FACTORS = {
    "flight_short": 0.15,
    "flight_long": 0.11,
    "rail": 0.035,
    "road": 0.17,
    "hotel": 18.0,
}


def _json_object(raw):
    try:
        value = json.loads(raw or "{}")
        return value if isinstance(value, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


@lru_cache(maxsize=1)
def _load_rows():
    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


@lru_cache(maxsize=1)
def _load_destinations():
    with DESTINATIONS_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def _num(value, default=0.0):
    try:
        number = float(value)
        return number if math.isfinite(number) else default
    except (TypeError, ValueError):
        return default


def _data():
    rows = _load_rows()
    suppliers = {
        row["record_id"]: row
        for row in rows
        if row.get("record_type") == "supplier"
    }
    claims_by_supplier = defaultdict(list)
    for row in rows:
        if row.get("record_type") == "responsible_claim":
            parent_id = row.get("parent_id")
            if parent_id:
                claims_by_supplier[parent_id].append(row)
    return suppliers, claims_by_supplier


def _claim_view(claim):
    status = (claim.get("verification") or "unverified").lower()
    if status not in VERIFICATION_STATUSES:
        status = "unverified"
    category = claim.get("category") or "other"
    raw_score = max(0.0, _num(claim.get("score")))
    points = raw_score if status == "verified" else 0.0
    return {
        "id": claim.get("record_id"),
        "category": category,
        "label": category.replace("_", " ").title(),
        "claim": claim.get("text") or claim.get("source_note") or category.replace("_", " "),
        "status": status,
        "points": round(points, 1),
        "possible_points": round(raw_score, 1),
        "data_origin": claim.get("data_origin") or "unknown",
        "evidence_url": _json_object(claim.get("attrs_json")).get("evidence_url"),
    }


def _supplier_view(supplier, claims):
    attrs = _json_object(supplier.get("attrs_json"))
    claim_views = [_claim_view(claim) for claim in claims]
    verified_claims = [claim for claim in claim_views if claim["status"] == "verified"]
    score = min(100.0, sum(claim["points"] for claim in claim_views))
    # Existing supplier.score is a stored copy of this exact verified-claims sum.
    stored_score = _num(supplier.get("score"), default=-1)
    score_consistent = stored_score < 0 or abs(stored_score - score) < 0.01
    has_verified_evidence = bool(verified_claims)
    return {
        "id": supplier.get("record_id"),
        "name": supplier.get("name") or "Unnamed sample partner",
        "destination_slug": supplier.get("destination_slug"),
        "kind": attrs.get("supplier_kind") or supplier.get("subtype") or "partner",
        "ownership": attrs.get("ownership") or "not specified",
        "locality": attrs.get("locality") or "",
        "chain_brand": attrs.get("chain_brand"),
        "score": round(score, 1) if has_verified_evidence else None,
        "status": "scored" if has_verified_evidence else "not_yet_verified",
        "verified_claim_count": len(verified_claims),
        "pending_claim_count": sum(1 for claim in claim_views if claim["status"] != "verified"),
        "claims": claim_views,
        "category_breakdown": {
            category: round(sum(c["points"] for c in claim_views if c["category"] == category), 1)
            for category in WEIGHTS
        },
        "stored_score": round(stored_score, 1) if stored_score >= 0 else None,
        "score_consistent_with_csv": score_consistent,
        "data_origin": supplier.get("data_origin") or "unknown",
        "is_sample": (supplier.get("data_origin") or "").startswith("synthetic"),
    }


def overview(destination=None, kind=None, query=None):
    suppliers, claims_by_supplier = _data()
    all_partners = [
        _supplier_view(supplier, claims_by_supplier.get(supplier_id, []))
        for supplier_id, supplier in suppliers.items()
    ]
    if destination:
        all_partners = [p for p in all_partners if p["destination_slug"] == destination]
    if kind:
        all_partners = [p for p in all_partners if p["kind"].lower() == kind.lower()]
    if query:
        needle = query.strip().lower()
        all_partners = [
            p for p in all_partners
            if needle in p["name"].lower() or needle in p["locality"].lower()
        ]

    destinations_data = []
    for destination_row in _load_destinations():
        slug = destination_row["slug"]
        dest_partners = [p for p in all_partners if p["destination_slug"] == slug]
        scored = [p for p in dest_partners if p["score"] is not None]
        average = (
            round(sum(p["score"] for p in scored) / len(scored), 1)
            if scored else None
        )
        destinations_data.append({
            "slug": slug,
            "name": destination_row["name"],
            "country": destination_row["country"],
            "average_score": average,
            "supplier_count": len(dest_partners),
            "scored_supplier_count": len(scored),
            "not_yet_verified_count": len(dest_partners) - len(scored),
            "coverage_pct": round(len(scored) / len(dest_partners) * 100, 1) if dest_partners else 0,
        })
    return {
        "destinations": destinations_data,
        "partners": all_partners,
        "total_suppliers": len(all_partners),
        "scored_suppliers": sum(1 for p in all_partners if p["score"] is not None),
        "not_yet_verified_suppliers": sum(1 for p in all_partners if p["score"] is None),
        "scoring_weights": WEIGHTS,
        "scoring_logic": "Supplier score = sum of claim points with verification=verified. Self-reported and unverified claims contribute 0. Destination average includes only suppliers with at least one verified claim.",
        "sample_data_notice": "These are illustrative sample-data scores generated from the supplied CSV, not independent real-world sustainability certifications or audits.",
    }


def destination_detail(slug):
    destinations = {d["slug"]: d for d in _load_destinations()}
    destination = destinations.get(slug)
    if not destination:
        return None
    result = overview(destination=slug)
    scored = [p for p in result["partners"] if p["score"] is not None]
    return {
        "destination": {
            "slug": slug,
            "name": destination["name"],
            "country": destination["country"],
        },
        "average_score": (
            round(sum(p["score"] for p in scored) / len(scored), 1)
            if scored else None
        ),
        "supplier_count": len(result["partners"]),
        "scored_supplier_count": len(scored),
        "partners": result["partners"],
        "scoring_weights": WEIGHTS,
        "message": "Destination average is calculated from scored suppliers only; suppliers without verified claims are excluded, not treated as zero.",
    }


def package_impact(package_id):
    # The master CSV does not contain persisted package-level composition records.
    return None


def calculate_carbon(payload):
    limits = {
        "flight_km": (0, 50000),
        "rail_km": (0, 50000),
        "road_km": (0, 50000),
        "hotel_nights": (0, 365),
        "travellers": (1, 20),
    }
    values = {}
    for field, (minimum, maximum) in limits.items():
        raw = payload.get(field, 1 if field == "travellers" else 0)
        if isinstance(raw, bool):
            raise ValueError(f"{field.replace('_', ' ').title()} must be a number.")
        try:
            number = float(raw)
        except (TypeError, ValueError):
            raise ValueError(f"Enter a valid number for {field.replace('_', ' ')}.")
        if not math.isfinite(number):
            raise ValueError(f"{field.replace('_', ' ').title()} must be a finite number.")
        if number < minimum or number > maximum:
            raise ValueError(
                f"{field.replace('_', ' ').title()} must be between {minimum:,} and {maximum:,}."
            )
        values[field] = number

    flight_factor = CARBON_FACTORS["flight_long"] if values["flight_km"] >= 3700 else CARBON_FACTORS["flight_short"]
    components = {
        "flights": values["flight_km"] * flight_factor,
        "rail": values["rail_km"] * CARBON_FACTORS["rail"],
        "road": values["road_km"] * CARBON_FACTORS["road"],
        "accommodation": values["hotel_nights"] * CARBON_FACTORS["hotel"],
    }
    total = sum(components.values())
    travellers = values["travellers"]
    return {
        "total_kg": round(total, 1),
        "per_traveller_kg": round(total / travellers, 1),
        "components_kg": {key: round(value, 1) for key, value in components.items()},
        "assumptions": "Approximate trip-planning estimate, not an audited footprint. Factors are proxy averages; flight class, occupancy, vehicle type, electricity mix and hotel country can materially change results.",
        "factors": CARBON_FACTORS,
    }


# ---------------------------------------------------------------------------
# Royal Stay Collection (Feature 8 redesign)
# Editorial stay discovery over the accommodation records in inventory_items.json.
# Additive: the verified-claim scoring above is unchanged. Records and imagery are
# illustrative sample data and make no property-specific impact claims.
# ---------------------------------------------------------------------------
STAY_IMAGES = [
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1539020140153-e479b8c22e70?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1512813195386-6cf811ad3542?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1497250681960-ef046c08a56e?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1599661046827-dacff0c0f09a?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1598974357801-cbca100e65d3?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1587974928442-77dc3e0dba72?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1593693411515-c20261bcad6e?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1544735716-392fe2489ffa?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1504829857797-ddff29c27927?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?auto=format&fit=crop&w=1100&q=85",
    "https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1100&q=85"
]

STAY_COPY = {
    "guesthouse": "A relaxed base for exploring the destination at your own pace.",
    "homestay": "Settle in, slow down, and let the neighbourhood set the rhythm.",
    "community_host": "A welcoming starting point for a day of discovery.",
    "boutique_hotel": "Make this your base for a memorable escape.",
    "heritage_hotel": "A stay to anchor your days of discovery.",
    "rifugio_or_lodge": "An inviting base for days spent exploring the outdoors.",
}

DESTINATION_LABELS = {
    "dolomites-italy": "The Dolomites",
    "kyoto-japan": "Kyoto",
    "marrakech-morocco": "Marrakech",
    "kashmir-india": "Kashmir",
    "jaipur-india": "Jaipur",
    "udaipur-india": "Udaipur",
    "kerala-india": "Kerala",
    "ladakh-india": "Ladakh",
    "meghalaya-india": "Meghalaya",
    "bali-indonesia": "Bali",
    "iceland": "Iceland",
    "amalfi-coast-italy": "Amalfi Coast",
}

def list_stays(destination: str | None = None, q: str | None = None, kind: str | None = None) -> dict:
    items = load_json("inventory_items.json")
    suppliers = {s["id"]: s for s in load_json("inventory_suppliers.json")}
    stays = [i for i in items if i.get("type") == "stay"]
    out = []
    for item in stays:
        supplier = suppliers.get(item.get("supplier_id"), {})
        dest = item.get("destination", "")
        supplier_kind = supplier.get("kind", "guesthouse")
        name = item.get("name") or supplier.get("name") or "Sample stay"
        if destination and dest != destination:
            continue
        if kind and supplier_kind != kind:
            continue
        haystack = f"{name} {supplier.get('name', '')} {supplier.get('locality', '')} {DESTINATION_LABELS.get(dest, dest)}".lower()
        if q and not all(token in haystack for token in q.lower().split()):
            continue
        try:
            idx = int(str(item.get("id", "item_0001")).split("_")[-1]) - 1
        except ValueError:
            idx = 0
        image = STAY_IMAGES[idx % len(STAY_IMAGES)]
        out.append({
            "id": item["id"],
            "supplier_id": item["supplier_id"],
            "name": name,
            "supplier_name": supplier.get("name"),
            "destination": dest,
            "destination_name": DESTINATION_LABELS.get(dest, dest.replace("-", " ").title()),
            "locality": supplier.get("locality") or item.get("responsible", {}).get("locality"),
            "kind": supplier_kind,
            "kind_label": supplier_kind.replace("_", " ").title(),
            "tier": item.get("tier"),
            "price": item.get("base_net_price"),
            "price_usd": item.get("base_net_price_usd"),
            "currency": item.get("currency"),
            "unit": item.get("unit"),
            "capacity": item.get("capacity"),
            "image_url": image,
            "image_alt": f"Editorial accommodation and destination photography for {name}",
            "editorial_note": STAY_COPY.get(supplier_kind, "A considered base for exploring somewhere new."),
            "is_sample": True,
        })
    out.sort(key=lambda row: (row["destination_name"], row["name"].lower()))
    return {
        "count": len(out),
        "items": out,
        "destinations": sorted({(x["destination"], x["destination_name"]) for x in out}, key=lambda x: x[1]),
        "is_sample": True,
        "notice": "Illustrative sample listings. Names, rates and supplier records are demo data; imagery is editorial and not a verified photograph of the named property.",
    }
