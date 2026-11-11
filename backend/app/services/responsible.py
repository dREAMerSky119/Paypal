"""Responsible-travel stay discovery and indicative carbon estimates.

The bundled accommodation records are synthetic demo listings. Copy and imagery
are editorial presentation only; they do not assert property-specific benefits.
"""
import math
from app.services.seed import load_json

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
        idx = int(item.get("id", "item_0001").split("_")[-1]) - 1
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


def carbon_estimate(payload: dict) -> dict:
    """Keep the existing Feature 8 carbon calculator's proxy factors and response contract."""
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
            raise ValueError(f"Enter a valid number for {field.replace('_', ' ')}.") from None
        if not math.isfinite(number):
            raise ValueError(f"{field.replace('_', ' ').title()} must be a finite number.")
        if number < minimum or number > maximum:
            raise ValueError(
                f"{field.replace('_', ' ').title()} must be between {minimum:,} and {maximum:,}."
            )
        values[field] = number

    flight_factor = 0.11 if values["flight_km"] >= 3700 else 0.15
    factors = {
        "flight_short": 0.15,
        "flight_long": 0.11,
        "rail": 0.035,
        "road": 0.17,
        "hotel": 18.0,
    }
    components = {
        "flights": values["flight_km"] * flight_factor,
        "rail": values["rail_km"] * factors["rail"],
        "road": values["road_km"] * factors["road"],
        "accommodation": values["hotel_nights"] * factors["hotel"],
    }
    total = sum(components.values())
    travellers = values["travellers"]
    return {
        "total_kg": round(total, 1),
        "per_traveller_kg": round(total / travellers, 1),
        "components_kg": {key: round(value, 1) for key, value in components.items()},
        "assumptions": (
            "Approximate trip-planning estimate, not an audited footprint. Factors are proxy "
            "averages; flight class, occupancy, vehicle type, electricity mix and hotel country "
            "can materially change results."
        ),
        "factors": factors,
    }
