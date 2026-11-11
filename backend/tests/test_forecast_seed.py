"""Phase E tests: the forecast is committed offline and sliced on request."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import demand_forecast as forecast_service

ROOT = Path(__file__).resolve().parents[1]
SEED_FILE = ROOT / "app" / "data" / "forecast_seed.json"
CSV_FILE = ROOT / "scripts" / "data" / "wayfare_master.csv"

client = TestClient(app)


def _reload_seed(monkeypatch, seed):
    SEED_FILE.write_text(json.dumps(seed), encoding="utf-8")
    forecast_service.clear_cache()


# ---------- the committed seed ----------

def test_committed_seed_exists_and_is_valid():
    seed = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    assert seed["is_sample"] is True
    assert seed["data_origin"] == "synthetic_calibrated"
    assert len(seed["destinations"]) == 12
    slugs = {entry["slug"] for entry in seed["destinations"]}
    assert "kyoto-japan" in slugs and "jaipur-india" in slugs


def test_every_destination_has_forecast_with_interval_and_confidence():
    seed = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    for entry in seed["destinations"]:
        assert entry["confidence"] in {"high", "medium", "low"}, entry["slug"]
        assert entry["confidence_note"], entry["slug"]
        assert entry["confidence_level"] == 80
        assert entry["served_model"], entry["slug"]
        assert entry["backtest"], entry["slug"]
        assert len(entry["forecast"]) == 12
        for point in entry["forecast"]:
            assert 0 <= point["lower"] <= point["predicted"] <= point["upper"], point
        assert len(entry["seasonality"]) == 12


def test_india_destinations_are_low_confidence():
    seed = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    for entry in seed["destinations"]:
        if entry["country"] == "India":
            assert entry["confidence"] == "low", entry["slug"]
            assert "India" in entry["confidence_note"]


def test_models_that_lose_to_the_baseline_are_not_served():
    """Keep the trend model only when it beats the seasonal-naive baseline."""
    seed = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    trend_name = "Seasonal trend projection"
    for entry in seed["destinations"]:
        if entry["served_model"] == trend_name:
            assert entry["backtest"]["beats_baseline"] is True, entry["slug"]
        else:
            assert entry["backtest"]["beats_baseline"] is False, entry["slug"]


def test_seed_regenerates_identically_from_the_scripts():
    """A fresh clone can regenerate the committed file (modulo the timestamp)."""
    from scripts import train_forecast

    fresh = train_forecast.build_seed()
    committed = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    fresh.pop("generated_at_utc")
    committed.pop("generated_at_utc")
    assert fresh == committed


# ---------- the service slices, never fits ----------

def test_service_does_not_fit_on_request(monkeypatch):
    """Fitting maths lives in forecast_model and the training script only."""
    source = Path(forecast_service.__file__).read_text(encoding="utf-8")
    assert "from app.services.forecast_model import" not in source


def test_forecast_horizons(monkeypatch):
    result = forecast_service.get_demand_forecast("amalfi-coast-italy", 3)
    assert len(result["forecast"]) == 3
    assert result["confidence_level"] == 80
    assert result["model"] and result["confidence"] and result["confidence_note"]

    with pytest.raises(ValueError):
        forecast_service.get_demand_forecast("amalfi-coast-italy", 0)
    with pytest.raises(ValueError):
        forecast_service.get_demand_forecast("atlantis", 6)


# ---------- the API ----------

def test_forecast_demand_route():
    body = client.get(
        "/api/forecast/demand",
        params={"destination": "kyoto-japan", "horizon": 6},
    ).json()
    assert body["destination"] == "kyoto-japan"
    assert len(body["forecast"]) == 6
    assert all(point["lower"] <= point["predicted"] <= point["upper"] for point in body["forecast"])
    assert body["confidence"] in {"high", "medium", "low"}


def test_forecast_demand_route_errors():
    assert client.get("/api/forecast/demand", params={"destination": "atlantis"}).status_code == 404
    assert client.get(
        "/api/forecast/demand", params={"destination": "kyoto-japan", "horizon": 99}
    ).status_code == 422


def test_forecast_destinations_route_includes_confidence():
    body = client.get("/api/forecast/destinations").json()
    assert len(body["destinations"]) == 12
    for item in body["destinations"]:
        assert {"slug", "name", "country", "confidence", "served_model"} <= set(item)


def test_shoulder_season_route():
    body = client.get("/api/forecast/shoulder-season").json()
    assert body["is_sample"] is True
    assert len(body["destinations"]) == 12
    for item in body["destinations"]:
        assert 1 <= len(item["months"]) <= 12, item["slug"]
        for month in item["months"]:
            assert month["index"] < 0.9, month
        assert item["peak_month"] and item["quietest_month"]


def test_unknown_destination_and_missing_seed(monkeypatch):
    assert client.get("/api/forecast/demand", params={"destination": "atlantis"}).status_code == 404

    real_seed = SEED_FILE.read_text(encoding="utf-8")
    SEED_FILE.unlink()
    try:
        forecast_service.clear_cache()
        response = client.get("/api/forecast/shoulder-season")
        assert response.status_code == 500
        assert "train_forecast" in response.json()["detail"]
    finally:
        SEED_FILE.write_text(real_seed, encoding="utf-8")
        forecast_service.clear_cache()


def test_simulator_still_runs_on_the_committed_forecast():
    from app.services import simulator

    months = simulator.available_months()
    assert len(months) == 12
    body = client.get("/api/simulator/presets").json()
    assert body["count"] > 0