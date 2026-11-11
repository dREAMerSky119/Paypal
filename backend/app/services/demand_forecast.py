"""Phase E: demand forecasting is served from a committed, offline-trained seed.

`scripts/train_forecast.py` fits each destination's model and runs the held-out
backtest against a seasonal-naive baseline; its output is committed to
`app/data/forecast_seed.json`. This service only slices that file on request —
nothing is fitted while serving, and the file can be regenerated from the
scripts alone on a fresh clone.
"""
from __future__ import annotations

import json
from pathlib import Path

DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "forecast_seed.json"
DEFAULT_HORIZON = 6

_cache = {"loaded": False, "seed": None}


def _seed():
    if not _cache["loaded"]:
        if not DATA_FILE.exists():
            raise FileNotFoundError(
                "Committed forecast seed not found: "
                f"{DATA_FILE}. Run scripts/train_forecast.py to generate it."
            )
        _cache["seed"] = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        _cache["loaded"] = True
    return _cache["seed"]


def clear_cache() -> None:
    """Drop the memoised seed (used by tests that rewrite the file)."""
    _cache["loaded"] = False
    _cache["seed"] = None


def get_demand_destinations():
    """Destinations available for forecasting, with their committed confidence."""
    return [
        {
            "slug": entry["slug"],
            "name": entry["slug"].replace("-", " ").title(),
            "country": entry["country"],
            "confidence": entry["confidence"],
            "served_model": entry["served_model"],
        }
        for entry in _seed()["destinations"]
    ]


def get_shoulder_season():
    """Shoulder-season months per destination, from the committed seasonal shape.

    A calendar month is shoulder season when its seasonal index is below the
    model's threshold, i.e. quieter than an average month of the year.
    """
    destinations = []
    for entry in _seed()["destinations"]:
        seasonality = entry["seasonality"]
        shoulder = [row for row in seasonality if row["index"] < 0.9]
        peak = max(seasonality, key=lambda row: row["index"])
        destinations.append({
            "slug": entry["slug"],
            "country": entry["country"],
            "confidence": entry["confidence"],
            "months": [
                {
                    "month": row["month"],
                    "month_number": row["month_number"],
                    "index": row["index"],
                }
                for row in sorted(shoulder, key=lambda row: row["month_number"])
            ],
            "quietest_month": min(seasonality, key=lambda row: row["index"])["month"],
            "peak_month": peak["month"],
        })
    return destinations


def get_demand_forecast(destination_slug, horizon=DEFAULT_HORIZON):
    """Slice the committed forecast for one destination.

    The horizon is capped at the committed window; no model is fitted here.
    """
    entry = next(
        (item for item in _seed()["destinations"] if item["slug"] == destination_slug),
        None,
    )
    if entry is None:
        raise ValueError(f"No demand data found for destination: {destination_slug}")

    if not 1 <= horizon <= len(entry["forecast"]):
        raise ValueError(
            f"Forecast horizon must be between 1 and {len(entry['forecast'])} months."
        )

    return {
        "destination": destination_slug,
        "latest_period": entry["latest_period"],
        "forecast_horizon": horizon,
        "confidence_level": entry["confidence_level"],
        "confidence": entry["confidence"],
        "confidence_note": entry["confidence_note"],
        "model": entry["served_model"],
        "data_origin": _seed()["data_origin"],
        "data_note": _seed()["data_note"],
        "growth_rate": entry["growth_rate"],
        "historical": entry["historical"],
        "forecast": entry["forecast"][:horizon],
        "seasonality": entry["seasonality"],
    }