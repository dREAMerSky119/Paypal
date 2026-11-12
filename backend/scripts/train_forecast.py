#!/usr/bin/env python3
"""Phase E: fit and commit the demand forecasts OFFLINE.

Trains the seasonal-trend model per destination on `scripts/data/wayfare_master.csv`,
backtests it against a seasonal-naive baseline on held-out months, and writes the
committed forecast to `app/data/forecast_seed.json`. The running app only slices this
committed file (through app/services/demand_forecast.py); it never fits a model on
request. A fresh clone can regenerate the file with this script alone:

  cd backend && python scripts/train_forecast.py            # stdlib only, no network

Add --check to fail (exit 1) when the committed file is stale rather than rewriting it.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.forecast_model import (  # noqa: E402
    MAX_HORIZON,
    TREND_MODEL,
    fit_seasonal_trend,
    growth_rate,
    load_master_demand,
    predict,
    score_destination,
    seasonality_table,
)

BACKEND = Path(__file__).resolve().parents[1]
CSV_PATH = BACKEND / "scripts" / "data" / "wayfare_master.csv"
OUT_PATH = BACKEND / "app" / "data" / "forecast_seed.json"


def build_seed() -> dict:
    history = load_master_demand(CSV_PATH)
    destinations = []
    for slug in sorted(history):
        rows = history[slug]
        model, backtest, confidence, note = score_destination(rows[0]["country"], rows)
        fitted = fit_seasonal_trend(rows)
        destinations.append({
            "slug": slug,
            "country": rows[0]["country"],
            "latest_period": rows[-1]["period"],
            "n_history": len(rows),
            "served_model": model,
            "fitted_model": TREND_MODEL,
            "backtest": backtest,
            "confidence": confidence,
            "confidence_note": note.strip(),
            "confidence_level": 80,
            "growth_rate": growth_rate(rows),
            "historical": [{"period": row["period"], "actual": round(row["value"], 2)} for row in rows],
            "forecast": predict(fitted, rows[-1]["period"], MAX_HORIZON),
            "seasonality": seasonality_table(fitted),
        })
    return {
        "version": 1,
        "is_sample": True,
        "data_origin": "synthetic_calibrated",
        "generated_by": "backend/scripts/train_forecast.py from backend/scripts/data/wayfare_master.csv",
        "generated_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data_note": (
            "Historical demand values are synthetic calibrated indices, not verified "
            "tourist-arrival statistics. The 80% interval is an approximate model-based "
            "uncertainty range."
        ),
        "model_selection": (
            "A destination's committed forecast uses the seasonal trend projection when it beats "
            "a seasonal-naive baseline (same calendar month one year earlier) on held-out months; "
            "otherwise the naive model is served and confidence is low. India destinations are "
            "always low confidence until real arrival data replaces the calibrated sample."
        ),
        "destinations": destinations,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="fail when the committed seed is stale instead of rewriting it")
    args = parser.parse_args()

    seed = build_seed()
    if args.check and OUT_PATH.exists():
        committed = json.loads(OUT_PATH.read_text(encoding="utf-8"))
        # The timestamp and anything derived from it must not make --check flaky.
        for document in (committed, seed):
            document.pop("generated_at_utc", None)
        if committed == seed:
            print("forecast_seed.json is up to date.")
            return 0
        print("forecast_seed.json is stale; run scripts/train_forecast.py to regenerate.", file=sys.stderr)
        return 1

    OUT_PATH.write_text(json.dumps(seed, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT_PATH} ({len(seed['destinations'])} destinations)")
    for destination in seed["destinations"]:
        bt = destination["backtest"] or {}
        print(f"  {destination['slug']:<22} {destination['served_model']:<26} "
              f"confidence={destination['confidence']:<6} "
              f"MAE {bt.get('model_error', '-')} vs baseline {bt.get('baseline_error', '-')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
