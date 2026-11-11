#!/usr/bin/env python3
"""Export the inventory seed (Feature 1, Phase 1) from scripts/data/wayfare_master.csv.

    python scripts/export_inventory_seed.py

Deterministic (no randomness here; the master CSV is already seeded). Writes:
  app/data/inventory_suppliers.json   supplier rows
  app/data/inventory_items.json       item rows (+ responsible attribute JSON)
  app/data/inventory_rates.json       monthly net rates, columnar, WITHOUT anomaly labels
  app/data/inventory_meta.json        fx reference table, price bands, row counts
  tests/fixtures/rate_anomaly_labels.json   ground truth for #9 (never served by the API)

All rows keep their `data_origin` so the UI can say "Sample data".
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
MASTER = ROOT / "scripts" / "data" / "wayfare_master.csv"
OUT = ROOT / "app" / "data"
FIXTURES = ROOT / "tests" / "fixtures"

# USD base net price bands. Edit here, re-run, commit. (id, lower inclusive, upper exclusive)
PRICE_BANDS = [("under_30", 0, 30), ("30_75", 30, 75), ("75_150", 75, 150), ("over_150", 150, None)]


def _attrs(v) -> dict:
    return json.loads(v) if isinstance(v, str) and v else {}


def _py(x):
    """numpy/pandas scalars and NaN -> plain JSON values."""
    if x is None or (not isinstance(x, str) and pd.isna(x)):
        return None
    return x.item() if hasattr(x, "item") else x


def main() -> None:
    df = pd.read_csv(MASTER, low_memory=False)

    suppliers, sup_by_id = [], {}
    for r in df[df.record_type == "supplier"].itertuples():
        a = _attrs(r.attrs_json)
        s = {
            "id": r.record_id, "destination": r.destination_slug, "name": r.name,
            "kind": r.subtype, "tier": r.tier, "lat": _py(r.lat), "lon": _py(r.lon),
            "currency": r.currency, "locality": a.get("locality"), "ownership": a.get("ownership"),
            "chain_brand": a.get("chain_brand"), "overture_id": a.get("overture_id"),
            "data_origin": r.data_origin,
        }
        suppliers.append(s)
        sup_by_id[s["id"]] = s

    items = []
    for r in df[df.record_type == "item"].itertuples():
        a, s = _attrs(r.attrs_json), sup_by_id[r.parent_id]
        items.append({
            "id": r.record_id, "supplier_id": r.parent_id, "destination": r.destination_slug,
            "name": r.name, "category": r.category, "type": r.subtype, "tier": r.tier,
            "lat": _py(r.lat), "lon": _py(r.lon), "currency": r.currency,
            "base_net_price": _py(r.price_net), "base_net_price_usd": _py(r.price_net_usd),
            "capacity": int(r.quantity), "unit": a.get("unit"), "markup_pct": a.get("markup_pct"),
            # Slots: #8 fills the score/badge; this is only the raw material.
            "responsible": {"ownership": s["ownership"], "chain_brand": s["chain_brand"],
                            "locality": s["locality"]},
            "data_origin": r.data_origin,
        })

    rate_df = df[df.record_type == "rate"].sort_values(["parent_id", "period"])
    rates = {
        "columns": ["item_id", "period", "date", "net_price", "net_price_usd"],
        "rows": [[r.parent_id, r.period, r.date, _py(r.price_net), _py(r.price_net_usd)]
                 for r in rate_df.itertuples()],
    }
    labels = {
        r.record_id: {"item_id": r.parent_id, "period": r.period, "label": r.anomaly_label,
                      "true_price_net": _attrs(r.attrs_json).get("true_price_net"),
                      "observed_price_net": _py(r.price_net)}
        for r in rate_df[rate_df.anomaly_label.notna()].itertuples()
    }

    fx = {r.currency: _py(r.index_value) for r in df[df.record_type == "fx_assumption"].itertuples()}
    fx["USD"] = 1.0
    meta = {
        "price_bands": [{"id": n, "min_usd": lo, "max_usd": hi} for n, lo, hi in PRICE_BANDS],
        "fx_per_usd": fx,
        "fx_note": "Reference assumptions, not live rates. Refresh from Frankfurter/ECB.",
        "row_counts": {
            "destinations": int((df.record_type == "destination").sum()),
            "suppliers": len(suppliers), "items": len(items), "rates": len(rates["rows"]),
            "injected_rate_anomalies": len(labels),
        },
    }

    OUT.mkdir(exist_ok=True)
    FIXTURES.mkdir(parents=True, exist_ok=True)

    def dump(path: Path, obj) -> None:
        path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    dump(OUT / "inventory_suppliers.json", suppliers)
    dump(OUT / "inventory_items.json", items)
    dump(OUT / "inventory_rates.json", rates)
    dump(OUT / "inventory_meta.json", meta)
    dump(FIXTURES / "rate_anomaly_labels.json", labels)
    print(json.dumps(meta["row_counts"], indent=2))


if __name__ == "__main__":
    main()
