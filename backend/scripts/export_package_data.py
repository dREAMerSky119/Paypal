"""Export Package Builder reference data from wayfare_master.csv.

Run from backend/: python scripts/export_package_data.py
The script is deterministic and safe to re-run.
"""
from __future__ import annotations
import csv, json, statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "scripts" / "data" / "wayfare_master.csv"
OUT = ROOT / "app" / "data"


def number(value):
    try:
        return float(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def attrs(row):
    try:
        return json.loads(row.get("attrs_json") or "{}")
    except json.JSONDecodeError:
        return {}


def main():
    if not CSV_PATH.exists():
        raise SystemExit(f"Source CSV not found: {CSV_PATH}")
    with CSV_PATH.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    spots = []
    for r in rows:
        if r["record_type"] == "spot":
            a = attrs(r)
            spots.append({"id": r["record_id"], "destination": r["destination_slug"],
                "name": r["name"], "category": r["category"], "subtype": r["subtype"],
                "lat": number(r["lat"]), "lon": number(r["lon"]), **a})

    spot_links, day_links, similar_links = [], [], []
    for r in rows:
        if r["record_type"] != "relation":
            continue
        link = {"from_id": r["parent_id"], "to_id": r["related_id"],
                "destination": r["destination_slug"], "distance_km": number(r["distance_km"]),
                "travel_min": number(r["travel_min"])}
        if r["subtype"] == "spot" and r["category"] == "near":
            spot_links.append(link)
        elif r["subtype"] == "item" and r["category"] == "day":
            day_links.append(link)
        elif r["subtype"] == "spot" and r["category"] == "similar":
            similar_links.append(link)

    airports = []
    for r in rows:
        if r["record_type"] == "airport":
            airports.append({"id": r["record_id"], "destination": r["destination_slug"],
                "name": r["name"], "category": r["category"], "type": r["subtype"],
                "distance_km": number(r["distance_km"]), "travel_min": number(r["travel_min"]),
                **attrs(r)})

    # Infer the average fee rate from booking rows with both fee and selling amount.
    ratios = []
    for r in rows:
        if r["record_type"] == "booking":
            fee, sell = number(r["fees"]), number(r["price_sell"])
            if fee is not None and sell and sell > 0 and fee >= 0:
                ratios.append(fee / sell)
    fee_rate = statistics.median(ratios) if ratios else 0.0
    fee_data = {"fee_rate": round(fee_rate, 6), "method": "median booking fees / sell amount",
                "source_rows": len(ratios), "currency": "USD", "is_sample": True}

    OUT.mkdir(parents=True, exist_ok=True)
    outputs = {"spots.json": spots,
        "spot_links.json": {"near": spot_links, "day_items": day_links, "similar": similar_links},
        "airports.json": airports, "package_fees.json": fee_data}
    for name, payload in outputs.items():
        (OUT / name).write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Exported {len(spots)} spots, {len(spot_links)} near links, {len(day_links)} day links, "
          f"{len(airports)} airports; fee rate={fee_rate:.4%} from {len(ratios)} bookings")

if __name__ == "__main__":
    main()
