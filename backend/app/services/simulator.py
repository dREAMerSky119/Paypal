"""Market simulator engine (feature #5).

Scenario = baseline demand forecast (feature #6) x multipliers from an editable
assumptions table. Outputs per month: demand, rate pressure, occupancy and margin,
plus spillover to similar destinations.

Everything here is an illustration built from assumptions in
app/data/simulator_assumptions.json. It is not a measurement or a prediction.
Pure functions: no network, no randomness, same input gives the same output.
"""
import calendar
import json
import math
from datetime import date
from functools import lru_cache
from pathlib import Path

from app.services import profitability
from app.services.demand_forecast import get_demand_forecast

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
ASSUMPTIONS_FILE = DATA_DIR / "simulator_assumptions.json"

MAX_MONTHS = 12
MAX_EVENTS = 20
STRENGTH_RANGE = (0, 200)
COEFFICIENT_LIMIT = 3.0
# Globals a caller may override (bounds stay fixed so scenarios cannot break the engine).
OVERRIDABLE_GLOBALS = {
    "demand_to_rate": (0.0, 1.0),
    "sell_pass_through": (0.0, 1.0),
    "cost_follows_rate": (0.0, 1.0),
    "occupancy_at_peak": (0.3, 0.98),
    "occupancy_ceiling": (0.5, 1.0),
    "spill_share": (0.0, 1.0),
    "spill_cap_pct": (0.0, 100.0),
}


class SimulationError(ValueError):
    """Invalid scenario input. The route turns this into a 400."""


# ---------------------------------------------------------------- loading

@lru_cache(maxsize=1)
def load_assumptions():
    with ASSUMPTIONS_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def get_assumptions():
    """The full assumptions table, for the UI's assumptions panel and sliders."""
    seed = load_assumptions()
    forecast_months = available_months()
    return {
        "is_sample": True,
        "data_origin": seed["data_origin"],
        "disclaimer": seed["disclaimer"],
        "bounds": seed["bounds"],
        "effect_types": seed["effect_types"],
        "globals": seed["globals"],
        "events": seed["events"],
        "fx": seed["fx"],
        "destinations": seed["destinations"],
        "available_months": forecast_months,
        "max_months": MAX_MONTHS,
    }


def get_presets():
    seed = load_assumptions()
    return {"is_sample": True, "count": len(seed["presets"]), "presets": seed["presets"]}


@lru_cache(maxsize=32)
def _baseline(slug):
    """12 months of baseline forecast plus the history stats the engine needs."""
    forecast = get_demand_forecast(slug, MAX_MONTHS)
    values = [point["actual"] for point in forecast["historical"]]
    return forecast, values


def available_months():
    """Months a scenario can start in. Same for every destination (one shared dataset)."""
    slug = load_assumptions()["destinations"][0]["slug"]
    forecast, _ = _baseline(slug)
    return [point["period"] for point in forecast["forecast"]]


def _destination(slug):
    for item in load_assumptions()["destinations"]:
        if item["slug"] == slug:
            return item
    raise SimulationError(f"Unknown destination: {slug}")


@lru_cache(maxsize=1)
def _bookings_by_destination():
    grouped = {}
    for booking in profitability.get_bookings():
        grouped.setdefault(booking["destination"], []).append(booking)
    return grouped


# ---------------------------------------------------------------- helpers

def _clamp(value, low, high):
    return max(low, min(high, value))


def _month_days(period):
    year, month = (int(part) for part in period.split("-"))
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


def _overlap_fraction(period, start_text, end_text):
    """Share of the month's days that fall inside the event's date range."""
    first, last = _month_days(period)
    start = date.fromisoformat(start_text)
    end = date.fromisoformat(end_text or start_text)
    overlap = (min(last, end) - max(first, start)).days + 1
    if overlap <= 0:
        return 0.0
    return overlap / ((last - first).days + 1)


def _shift_month(period, offset):
    year, month = (int(part) for part in period.split("-"))
    index = year * 12 + (month - 1) + offset
    return f"{index // 12}-{index % 12 + 1:02d}"


def _month_range(start, months):
    return [_shift_month(start, step) for step in range(months)]


def _number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise SimulationError(f"{label} must be a number.")
    return float(value)


def _effective_tables(overrides):
    """Merge caller overrides onto the seed. Returns (effect_types, globals) as plain dicts."""
    seed = load_assumptions()
    types = {name: dict(spec) for name, spec in seed["effect_types"].items()}
    params = {name: spec["value"] for name, spec in seed["globals"].items()}
    overrides = overrides or {}

    for name, changes in (overrides.get("types") or {}).items():
        if name not in types or types[name].get("driver") != "slider":
            raise SimulationError(f"Cannot override unknown effect type: {name}")
        for key, value in (changes or {}).items():
            if key not in ("demand_per_unit", "rate_per_unit", "cost_per_unit"):
                raise SimulationError(f"Cannot override {name}.{key}")
            value = _number(value, f"{name}.{key}")
            if abs(value) > COEFFICIENT_LIMIT:
                raise SimulationError(f"{name}.{key} must be between -{COEFFICIENT_LIMIT} and {COEFFICIENT_LIMIT}.")
            types[name][key] = value

    for key, value in (overrides.get("globals") or {}).items():
        if key not in OVERRIDABLE_GLOBALS:
            raise SimulationError(f"Cannot override global: {key}")
        low, high = OVERRIDABLE_GLOBALS[key]
        value = _number(value, key)
        if not low <= value <= high:
            raise SimulationError(f"{key} must be between {low} and {high}.")
        params[key] = value

    return types, params


# ---------------------------------------------------------------- effects

def slider_factors(adjustments, types):
    """Turn slider values into (label, demand, rate, cost) multipliers, one per active slider.

    multiplier = 1 + coefficient x value / 100, floored so no single factor can go negative.
    """
    factors = []
    for name, spec in types.items():
        if spec.get("driver") != "slider":
            continue
        value = _number(adjustments.get(name, spec.get("default", 0)), f"adjustments.{name}")
        if not spec["min"] <= value <= spec["max"]:
            raise SimulationError(f"{spec['label']} must be between {spec['min']} and {spec['max']}.")
        if value == 0:
            continue
        factors.append({
            "type": name,
            "label": spec["label"],
            "value": value,
            "demand": max(0.05, 1 + spec["demand_per_unit"] * value / 100),
            "rate": max(0.05, 1 + spec["rate_per_unit"] * value / 100),
            "cost": max(0.05, 1 + spec["cost_per_unit"] * value / 100),
        })
    return factors


def event_factors(period, selected, events_by_id):
    """Multipliers contributed by the chosen events in one month, scaled by overlap and strength."""
    factors = []
    for choice in selected:
        event = events_by_id[choice["id"]]
        fraction = _overlap_fraction(period, event["start"], event["end"])
        if fraction == 0:
            continue
        weight = fraction * choice["strength"] / 100
        factors.append({
            "type": "festival" if event["type"] in ("festival", "seasonal", "holiday") else event["type"],
            "label": event["name"],
            "event_id": event["id"],
            "demand": max(0.05, 1 + (event["demand_multiplier"] - 1) * weight),
            "rate": max(0.05, 1 + (event["rate_multiplier"] - 1) * weight),
            "cost": 1.0,
        })
    return factors


def combine(factors, bounds):
    """Multiply factors together, then cap the result. Returns (demand, rate, cost, capped)."""
    totals = {"demand": 1.0, "rate": 1.0, "cost": 1.0}
    for factor in factors:
        for key in totals:
            totals[key] *= factor[key]
    capped = False
    for key in totals:
        low, high = bounds[key]
        clamped = _clamp(totals[key], low, high)
        capped = capped or clamped != totals[key]
        totals[key] = clamped
    return totals["demand"], totals["rate"], totals["cost"], capped


# ---------------------------------------------------------------- margin

def _margin_basis(slug):
    """Cash components of the destination's most recent 12 months of simulated bookings."""
    bookings = _bookings_by_destination().get(slug, [])
    if not bookings:
        return None
    latest = max(booking["month"] for booking in bookings)
    cutoff = _shift_month(latest, -11)
    recent = [booking for booking in bookings if booking["month"] >= cutoff]
    sales = cost = fees = leakage = 0.0
    for booking in recent:
        if booking["is_canceled"]:
            leakage += float(booking.get("cancel_penalty", 0))
        else:
            sales += float(booking["sell_amount"])
            cost += float(booking["net_amount"])
            fees += float(booking["fees"])
    if sales <= 0:
        return None
    return {"sales": sales, "cost": cost, "fees": fees, "leakage": leakage,
            "profit": sales - cost - fees - leakage, "first_month": cutoff, "last_month": latest,
            "bookings": len(recent)}


def _size_weight(slug):
    basis = _margin_basis(slug)
    return basis["sales"] if basis else 0.0


# ---------------------------------------------------------------- validation

def validate_request(request):
    seed = load_assumptions()
    if not isinstance(request, dict):
        raise SimulationError("Request must be a JSON object.")

    slug = request.get("destination")
    destination = _destination(slug)

    months = request.get("months", 6)
    if isinstance(months, bool) or not isinstance(months, int) or not 1 <= months <= MAX_MONTHS:
        raise SimulationError(f"months must be a whole number from 1 to {MAX_MONTHS}.")

    allowed = available_months()
    start = request.get("start", allowed[0])
    if start not in allowed:
        raise SimulationError(f"start must be one of {allowed[0]} to {allowed[-1]}.")
    if allowed.index(start) + months > len(allowed):
        raise SimulationError(f"The window runs past the forecast. From {start} you can simulate at most {len(allowed) - allowed.index(start)} months.")

    adjustments = request.get("adjustments") or {}
    if not isinstance(adjustments, dict):
        raise SimulationError("adjustments must be an object.")
    unknown = set(adjustments) - {n for n, s in seed["effect_types"].items() if s.get("driver") == "slider"}
    if unknown:
        raise SimulationError(f"Unknown adjustment: {sorted(unknown)[0]}")

    chosen = request.get("events") or []
    if not isinstance(chosen, list) or len(chosen) > MAX_EVENTS:
        raise SimulationError(f"events must be a list of at most {MAX_EVENTS}.")
    events_by_id = {event["id"]: event for event in seed["events"]}
    selected, seen = [], set()
    for item in chosen:
        if isinstance(item, str):
            item = {"id": item}
        if not isinstance(item, dict) or item.get("id") not in events_by_id:
            raise SimulationError(f"Unknown event: {item.get('id') if isinstance(item, dict) else item}")
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        event = events_by_id[item["id"]]
        applies = event["destination"] == slug or (event["destination"] is None and event["country"] == destination["country"])
        if not applies:
            raise SimulationError(f"{event['name']} does not apply to {destination['name']}.")
        strength = _number(item.get("strength", 100), "strength")
        if not STRENGTH_RANGE[0] <= strength <= STRENGTH_RANGE[1]:
            raise SimulationError(f"strength must be between {STRENGTH_RANGE[0]} and {STRENGTH_RANGE[1]}.")
        selected.append({"id": item["id"], "strength": strength})

    return destination, start, months, adjustments, selected, events_by_id


# ---------------------------------------------------------------- engine

def run_simulation(request):
    """Run one scenario. Raises SimulationError on bad input."""
    destination, start, months, adjustments, selected, events_by_id = validate_request(request)
    slug = destination["slug"]
    seed = load_assumptions()
    types, params = _effective_tables(request.get("overrides"))
    bounds = seed["bounds"]

    forecast, history = _baseline(slug)
    by_period = {point["period"]: point for point in forecast["forecast"]}
    periods = _month_range(start, months)
    peak = max(history) if history else 1.0
    recent_mean = sum(history[-12:]) / min(12, len(history))

    sliders = slider_factors(adjustments, types)
    basis = _margin_basis(slug)

    rows = []
    any_capped = False
    for period in periods:
        point = by_period[period]
        factors = sliders + event_factors(period, selected, events_by_id)
        demand_mult, rate_from_factors, cost_from_factors, capped = combine(factors, bounds)
        any_capped = any_capped or capped

        # Rates follow demand a little, on top of direct rate effects.
        rate_mult = _clamp(rate_from_factors * demand_mult ** params["demand_to_rate"], *bounds["rate"])
        sell_mult = rate_mult ** params["sell_pass_through"]
        cost_mult = _clamp(cost_from_factors * rate_mult ** params["cost_follows_rate"], *bounds["cost"])

        baseline = point["predicted"]
        wanted = baseline * demand_mult
        ceiling = peak * params["occupancy_ceiling"] / params["occupancy_at_peak"]
        scenario = min(wanted, ceiling) if baseline <= ceiling else min(wanted, baseline)
        turned_away = max(0.0, wanted - scenario)

        occ_base = _clamp(params["occupancy_at_peak"] * baseline / peak, 0.0, params["occupancy_ceiling"])
        occ_scen = _clamp(params["occupancy_at_peak"] * scenario / peak, 0.0, params["occupancy_ceiling"])
        realised = scenario / baseline if baseline > 0 else 1.0

        row = {
            "period": period,
            "baseline": round(baseline, 2),
            "baseline_lower": point["lower"],
            "baseline_upper": point["upper"],
            "scenario": round(scenario, 2),
            "scenario_lower": round(point["lower"] * realised, 2),
            "scenario_upper": round(point["upper"] * realised, 2),
            "demand_multiplier": round(demand_mult, 4),
            "rate_multiplier": round(rate_mult, 4),
            "sell_multiplier": round(sell_mult, 4),
            "cost_multiplier": round(cost_mult, 4),
            "occupancy_baseline": round(occ_base, 4),
            "occupancy_scenario": round(occ_scen, 4),
            "turned_away": round(turned_away, 2),
            "capped": capped,
        }
        if basis:
            weight = (baseline / recent_mean) / 12 if recent_mean > 0 else 1 / 12
            sales_b, cost_b = basis["sales"] * weight, basis["cost"] * weight
            fees_b, leak_b = basis["fees"] * weight, basis["leakage"] * weight
            sales_s = sales_b * realised * sell_mult
            cost_s = cost_b * realised * cost_mult
            fees_s = fees_b * realised * sell_mult
            leak_s = leak_b * realised * cost_mult
            row.update({
                "sales_baseline": round(sales_b, 2), "sales_scenario": round(sales_s, 2),
                "profit_baseline": round(sales_b - cost_b - fees_b - leak_b, 2),
                "profit_scenario": round(sales_s - cost_s - fees_s - leak_s, 2),
            })
        rows.append(row)

    return {
        "is_sample": True,
        "data_origin": "assumption",
        "disclaimer": seed["disclaimer"],
        "destination": destination,
        "window": {"start": start, "months": months, "end": periods[-1]},
        "scenario": {"adjustments": {k: v for k, v in adjustments.items()}, "events": selected},
        "baseline_model": forecast["model"],
        "baseline_note": forecast["data_note"],
        "factors": [{"type": f["type"], "label": f["label"], "value": f.get("value"),
                     "demand": round(f["demand"], 4), "rate": round(f["rate"], 4), "cost": round(f["cost"], 4)}
                    for f in sliders] + _event_summary(selected, events_by_id, periods),
        "months": rows,
        "summary": _summary(rows),
        "margin": _margin_summary(rows, basis),
        "spillover": _spillover(slug, rows, params, basis),
        "capped": any_capped,
        "warnings": _warnings(any_capped, rows, basis, params),
        "parameters": params,
    }


def _event_summary(selected, events_by_id, periods):
    out = []
    for choice in selected:
        event = events_by_id[choice["id"]]
        inside = any(_overlap_fraction(p, event["start"], event["end"]) > 0 for p in periods)
        out.append({"type": "festival" if event["type"] in ("festival", "seasonal", "holiday") else event["type"],
                    "label": event["name"], "event_id": event["id"], "value": choice["strength"],
                    "demand": event["demand_multiplier"], "rate": event["rate_multiplier"], "cost": 1.0,
                    "inside_window": inside})
    return out


def _summary(rows):
    base = sum(r["baseline"] for r in rows)
    scen = sum(r["scenario"] for r in rows)
    n = len(rows)
    return {
        "baseline_total": round(base, 2),
        "scenario_total": round(scen, 2),
        "demand_change_pct": round((scen / base - 1) * 100, 2) if base else 0.0,
        "rate_pressure_pct": round((sum(r["rate_multiplier"] for r in rows) / n - 1) * 100, 2),
        "occupancy_baseline": round(sum(r["occupancy_baseline"] for r in rows) / n, 4),
        "occupancy_scenario": round(sum(r["occupancy_scenario"] for r in rows) / n, 4),
        "turned_away_total": round(sum(r["turned_away"] for r in rows), 2),
        "peak_month": max(rows, key=lambda r: r["scenario"])["period"],
    }


def _margin_summary(rows, basis):
    if not basis:
        return None
    sales_b = sum(r["sales_baseline"] for r in rows)
    sales_s = sum(r["sales_scenario"] for r in rows)
    profit_b = sum(r["profit_baseline"] for r in rows)
    profit_s = sum(r["profit_scenario"] for r in rows)
    margin_b = profit_b / sales_b * 100 if sales_b else 0.0
    margin_s = profit_s / sales_s * 100 if sales_s else 0.0
    return {
        "basis": (f"Simulated bookings for this destination, {basis['first_month']} to {basis['last_month']} "
                  f"({basis['bookings']} bookings), spread over the window by the baseline demand shape. "
                  "Saved packages can be tested separately with the package impact tool."),
        "currency": "USD",
        "baseline": {"sales": round(sales_b, 2), "profit": round(profit_b, 2), "margin_pct": round(margin_b, 2)},
        "scenario": {"sales": round(sales_s, 2), "profit": round(profit_s, 2), "margin_pct": round(margin_s, 2)},
        "delta": {"sales": round(sales_s - sales_b, 2), "profit": round(profit_s - profit_b, 2),
                  "margin_points": round(margin_s - margin_b, 2)},
    }


def _spillover(slug, rows, params, basis):
    """Demand that is lost or turned away can move to similar destinations."""
    lost = sum(max(0.0, r["baseline"] - r["scenario"]) for r in rows) + sum(r["turned_away"] for r in rows)
    baseline_total = sum(r["baseline"] for r in rows)
    similar = load_assumptions()["similar_destinations"].get(slug, [])[:3]
    if not similar or not basis or baseline_total <= 0 or lost <= 0:
        return []

    displaced_share = lost / baseline_total  # fraction of this destination's own volume
    displaced_to_others = displaced_share * params["spill_share"]
    own_size = basis["sales"]
    total_score = sum(item["score"] for item in similar) or 1.0
    start = rows[0]["period"]
    results = []
    for item in similar:
        other_size = _size_weight(item["slug"])
        if other_size <= 0:
            continue
        gained = displaced_to_others * item["score"] / total_score * own_size
        uplift = _clamp(gained / other_size * 100, 0.0, params["spill_cap_pct"])
        name = _destination(item["slug"])["name"]
        results.append({
            "slug": item["slug"], "name": name, "similarity": item["score"],
            "uplift_pct": round(uplift, 2),
            "reason": f"{round(item['score'] * 100)}% similar by tags and editorial text. Receives "
                      f"{round(item['score'] / total_score * 100)}% of the displaced demand that moves elsewhere.",
        })
    results.sort(key=lambda r: -r["uplift_pct"])
    return results


def _warnings(capped, rows, basis, params):
    notes = []
    if capped:
        notes.append("Stacked effects hit the safety cap, so the combined result is held to a sane range.")
    if any(r["turned_away"] > 0 for r in rows):
        notes.append("Demand exceeds capacity in some months. The excess is shown as turned away.")
    if not basis:
        notes.append("No simulated bookings for this destination, so margin impact is unavailable.")
    return notes
