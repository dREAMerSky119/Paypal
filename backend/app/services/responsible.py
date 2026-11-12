"""Responsible-travel stay discovery and indicative carbon estimates.

The bundled accommodation records are synthetic demo listings. Copy and imagery
are editorial presentation only; they do not assert property-specific benefits.
"""
import math
from app.services.seed import load_json

# Curated photographs of real accommodation buildings (homestays, cottages,
# guesthouses and resort villas). The supplier records in this demo are synthetic,
# so these are illustrative category images, not photographs of the named listings.
HOMESTAY_IMAGES = [
    "https://assets.cntraveller.in/photos/62b97e586494f32523f7516a/master/w_1600%2Cc_limit/Casa-galgibaga-6.jpg",
    "https://static.toiimg.com/photo/49720744.cms",
    "https://dynamic-media-cdn.tripadvisor.com/media/photo-o/04/9e/8d/09/cottage.jpg?h=-1&s=1&w=700",
    "https://www.raahghar.com/public/storage/image/stay/gallery/parijaat/1754475005_7.webp",
    "https://pix6.agoda.net/hotelImages/36838135/0/605d0a2651299a9a9583aeb0a4bc45cb.jpg?ce=0&s=1024x768",
    "https://cf.bstatic.com/xdata/images/hotel/max1024x768/389777262.jpg?hp=1&k=607e0e114e926327571cbda48c4c181936a023841909bf7734132fc867837fd0&o=",
]

RESORT_IMAGES = [
    "https://r2imghtlak.mmtcdn.com/r2-mmt-htl-image/htl-imgs/202304051228171615-47ea524d-3056-438c-9f6c-c8fb4a69e50a.jpg",
    "https://r1imghtlak.mmtcdn.com/66a3699c-f50a-48e6-afda-aea188a852fa.jpg",
    "https://pix10.agoda.net/hotelImages/78059040/0/5ba2d861f5c02654536ee71302a1bf92.jpg?ce=2&s=1024x768",
    "https://thelotusresort.vn/admin/app/webroot/img/upload/11711187168500.jpg",
    "https://images.trvl-media.com/lodging/116000000/115560000/115559200/115559167/06547c0b.jpg?impolicy=resizecrop&ra=fill&rh=575&rw=575",
]

LODGING_IMAGES = HOMESTAY_IMAGES + RESORT_IMAGES


def image_for_stay(kind: str, index: int) -> tuple[str, str]:
    if kind in {"homestay", "guesthouse"}:
        return HOMESTAY_IMAGES[index % len(HOMESTAY_IMAGES)], "Illustrative photograph of a real homestay or guesthouse"
    if kind in {"boutique_hotel", "heritage_hotel"}:
        return RESORT_IMAGES[index % len(RESORT_IMAGES)], "Illustrative photograph of a real resort or hotel property"
    return LODGING_IMAGES[index % len(LODGING_IMAGES)], "Illustrative photograph of a real lodge, cottage or resort property"


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
        image, image_alt = image_for_stay(supplier_kind, idx)
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
            "image_alt": image_alt,
            "editorial_note": STAY_COPY.get(supplier_kind, "A considered base for exploring somewhere new."),
            "is_sample": True,
        })
    out.sort(key=lambda row: (row["destination_name"], row["name"].lower()))
    return {
        "count": len(out),
        "items": out,
        "destinations": sorted({(x["destination"], x["destination_name"]) for x in out}, key=lambda x: x[1]),
        "is_sample": True,
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
