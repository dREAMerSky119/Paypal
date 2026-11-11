"""Market simulator: engine and API tests.

Engine tests use hand-checkable numbers (a 20% fuel rise, a 67-severity monsoon) and the
invariants from the plan: effects are monotonic and bounded, and no scenario produces
negative demand. Route tests run against the committed seed.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import profitability
from app.services import simulator as sim

client = TestClient(app)

BASE = {"destination": "kerala-india", "start": "2027-06", "months": 3}


def run(**changes):
    return sim.run_simulation({**BASE, **changes})


# ---------- seed and assumptions ----------
def test_every_multiplier_has_a_source_note_and_assumption_flag():
    seed = sim.load_assumptions()
    for name, spec in seed["effect_types"].items():
        assert spec["source_note"], name
        assert "assumption" in spec["source_note"].lower(), name
    for event in seed["events"]:
        assert event["source_note"], event["id"]
        assert "assumption" in event["source_note"].lower(), event["id"]
    assert seed["is_sample"] is True


def test_presets_use_real_destinations_and_fit_the_forecast_window():
    seed = sim.load_assumptions()
    slugs = {d["slug"] for d in seed["destinations"]}
    months = sim.available_months()
    for preset in seed["presets"]:
        assert preset["destination"] in slugs
        assert preset["start"] in months
        assert months.index(preset["start"]) + preset["months"] <= len(months)


# ---------- engine, hand-computed ----------
def test_no_adjustments_leaves_baseline_unchanged():
    result = run()
    for month in result["months"]:
        assert month["scenario"] == month["baseline"]
        assert month["demand_multiplier"] == 1
        assert month["rate_multiplier"] == 1
    assert result["summary"]["demand_change_pct"] == 0
    assert result["margin"]["delta"]["profit"] == 0


def test_monsoon_preset_matches_the_events_table_row():
    # evt_047: heavy monsoon is x0.80 demand. Severity 67 x -0.30 per unit = -20.1%.
    result = run(adjustments={"weather": 67})
    assert result["months"][0]["demand_multiplier"] == pytest.approx(0.799, abs=0.001)


def test_fuel_plus_20_hand_computed():
    # demand 1 - 0.30*20/100 = 0.94; direct rate 1 + 0.40*20/100 = 1.08; direct cost the same.
    # rate = 1.08 * 0.94 ** 0.35, cost = 1.08 * rate ** 0.5
    result = run(adjustments={"fuel": 20})
    month = result["months"][0]
    assert month["demand_multiplier"] == pytest.approx(0.94, abs=1e-4)
    rate = 1.08 * 0.94 ** 0.35
    assert month["rate_multiplier"] == pytest.approx(rate, abs=1e-3)
    assert month["cost_multiplier"] == pytest.approx(1.08 * rate ** 0.5, abs=1e-3)


def test_margin_baseline_matches_the_profitability_engine():
    basis = sim._margin_basis("kerala-india")
    bookings = [b for b in profitability.get_bookings()
                if b["destination"] == "kerala-india" and basis["first_month"] <= b["month"] <= basis["last_month"]]
    summary = profitability.calculate_summary(bookings)
    assert basis["profit"] == pytest.approx(summary["gross_profit"], abs=0.05)
    assert basis["sales"] == pytest.approx(summary["gross_sales"], abs=0.05)


# ---------- invariants ----------
@pytest.mark.parametrize("name,low,high", [("weather", 0, 100), ("fuel", -30, 100), ("currency", -20, 20),
                                           ("visa", -50, 50), ("disruption", 0, 100)])
def test_effects_are_monotonic_and_demand_never_negative(name, low, high):
    spec = sim.load_assumptions()["effect_types"][name]
    direction = 1 if spec["demand_per_unit"] > 0 else -1
    previous = None
    for value in range(low, high + 1, 10):
        demand = run(adjustments={name: value})["months"][0]["demand_multiplier"]
        assert demand > 0
        if previous is not None:
            assert (demand - previous) * direction >= -1e-9
        previous = demand


def test_extreme_stacked_scenario_stays_inside_bounds():
    events = [e["id"] for e in sim.load_assumptions()["events"] if e["destination"] == "kerala-india"]
    result = run(adjustments={"weather": 100, "disruption": 100, "fuel": 100, "currency": 20, "visa": -50},
                 events=[{"id": i, "strength": 200} for i in events])
    low, high = sim.load_assumptions()["bounds"]["demand"]
    for month in result["months"]:
        assert low <= month["demand_multiplier"] <= high
        assert month["scenario"] >= 0
        assert 0 <= month["occupancy_scenario"] <= 0.98
    assert result["capped"] is True
    assert any("cap" in note.lower() for note in result["warnings"])


def test_festival_event_lifts_demand_only_in_months_it_overlaps():
    # Gion Matsuri 2026 is 10 to 24 July. Window June to August 2026 is outside the forecast, so use 2027's.
    events = [e for e in sim.load_assumptions()["events"] if e["destination"] == "kyoto-japan" and e["start"].startswith("2027")]
    event = events[0]
    start = event["start"][:7]
    result = sim.run_simulation({"destination": "kyoto-japan", "start": "2026-11", "months": 12,
                                 "events": [{"id": event["id"], "strength": 100}]})
    in_window = [m for m in result["months"] if m["period"] == start]
    assert in_window and in_window[0]["demand_multiplier"] > 1
    assert any(m["demand_multiplier"] == 1 for m in result["months"])


def test_event_factors_are_tagged_so_they_never_mix_with_slider_factors():
    # Kerala has a "weather" event; it must not be mistaken for the weather slider.
    result = run(adjustments={"weather": 30}, events=["evt_009"])
    slider = [f for f in result["factors"] if "event_id" not in f]
    events = [f for f in result["factors"] if "event_id" in f]
    assert [f["type"] for f in slider] == ["weather"]
    assert [f["event_id"] for f in events] == ["evt_009"]


def test_overrides_change_the_result_and_are_validated():
    base = run(adjustments={"fuel": 20})["months"][0]["demand_multiplier"]
    harsher = run(adjustments={"fuel": 20}, overrides={"types": {"fuel": {"demand_per_unit": -0.6}}})
    assert harsher["months"][0]["demand_multiplier"] < base
    with pytest.raises(sim.SimulationError):
        run(overrides={"types": {"fuel": {"demand_per_unit": -9}}})
    with pytest.raises(sim.SimulationError):
        run(overrides={"globals": {"spill_share": 5}})


# ---------- spillover ----------
def test_disruption_spills_demand_to_similar_destinations():
    result = sim.run_simulation({"destination": "kashmir-india", "start": "2027-04", "months": 3,
                                 "adjustments": {"disruption": 100}})
    assert result["spillover"], "expected at least one receiving destination"
    for item in result["spillover"]:
        assert item["slug"] != "kashmir-india"
        assert 0 < item["uplift_pct"] <= sim.load_assumptions()["globals"]["spill_cap_pct"]["value"]


def test_no_spillover_when_nothing_is_displaced():
    assert run()["spillover"] == []
    assert run(adjustments={"visa": 30})["spillover"] == []


# ---------- validation ----------
@pytest.mark.parametrize("changes", [
    {"destination": "atlantis"},
    {"months": 0}, {"months": 13}, {"months": "3"},
    {"start": "2020-01"}, {"start": "2027-10", "months": 3},
    {"adjustments": {"weather": 101}}, {"adjustments": {"fuel": "high"}}, {"adjustments": {"magic": 1}},
    {"events": ["evt_does_not_exist"]},
    {"events": [{"id": "evt_001", "strength": 500}]},
])
def test_bad_input_is_rejected(changes):
    with pytest.raises(sim.SimulationError):
        run(**changes)


def test_event_for_another_destination_is_rejected():
    kyoto_event = next(e for e in sim.load_assumptions()["events"] if e["destination"] == "kyoto-japan")
    with pytest.raises(sim.SimulationError):
        run(events=[kyoto_event["id"]])


# ---------- API ----------
def test_assumptions_endpoint():
    body = client.get("/api/simulator/assumptions").json()
    assert body["is_sample"] is True
    assert len(body["destinations"]) == 12
    assert {"weather", "fuel", "currency", "visa", "disruption"} <= set(body["effect_types"])
    assert body["available_months"][0] == "2026-11"


def test_presets_endpoint_reproduces_expected_directions():
    body = client.get("/api/simulator/presets").json()
    assert body["count"] == len(body["presets"]) >= 6
    for preset in body["presets"]:
        events = []
        if preset["event_types"]:
            events = [e["id"] for e in client.get("/api/simulator/assumptions").json()["events"]
                      if e["destination"] == preset["destination"] and e["type"] in preset["event_types"]
                      and preset["start"] <= e["start"][:7] <= sim._shift_month(preset["start"], preset["months"] - 1)]
        result = client.post("/api/simulator/run", json={
            "destination": preset["destination"], "start": preset["start"], "months": preset["months"],
            "adjustments": preset["adjustments"], "events": events}).json()
        change = result["summary"]["demand_change_pct"]
        expected_down = {"heavy-monsoon", "fuel-plus-20", "eur-plus-5", "regional-disruption", "airline-strike"}
        expected_up = {"inr-minus-5", "visa-easing", "festival-shift"}
        if preset["id"] in expected_down:
            assert change < 0, preset["id"]
        if preset["id"] in expected_up:
            assert change > 0, preset["id"]


def test_run_endpoint_returns_a_full_result():
    body = client.post("/api/simulator/run", json={**BASE, "adjustments": {"fuel": 20}}).json()
    assert body["is_sample"] is True
    assert len(body["months"]) == 3
    assert {"summary", "margin", "spillover", "factors", "warnings", "disclaimer"} <= set(body)


def test_run_endpoint_returns_400_with_a_readable_reason():
    response = client.post("/api/simulator/run", json={**BASE, "destination": "atlantis"})
    assert response.status_code == 400
    assert "Unknown destination" in response.json()["detail"]
