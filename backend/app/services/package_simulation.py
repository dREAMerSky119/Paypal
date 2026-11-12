"""Apply a market-simulator scenario to a saved package (Phase F).

The simulator already turns a scenario into monthly price and cost multipliers for a
destination. Here those multipliers are applied to the package's own priced lines, month by
month, so the margin impact is about this package and not the destination's simulated bookings.
Demand volume does not change what one already-quoted package costs, so only the sell and cost
multipliers are used. Related-spot spillover from Phase D is attached as context.
"""
from __future__ import annotations

from app.services import packages, simulator

SCENARIO_KEYS = ("adjustments", "events", "overrides")
MAX_ALTERNATIVES = 2


class PackageSimulationError(ValueError):
    """Bad request that the caller can fix (HTTP 400)."""


def _months_between(first: str, last: str) -> int:
    fy, fm = map(int, first.split("-"))
    ly, lm = map(int, last.split("-"))
    return (ly - fy) * 12 + (lm - fm) + 1


def _pct(profit: float, sell: float) -> float:
    return round(profit / sell * 100, 2) if sell else 0.0


def apply_to_package(package_id: str, scenario: dict) -> dict | None:
    """Returns None when the package does not exist."""
    saved = packages.get(package_id)
    if saved is None:
        return None
    if not isinstance(scenario, dict):
        raise PackageSimulationError("scenario must be an object")
    quote = saved.get("quote") or {}
    lines = quote.get("line_items") or []
    if not lines:
        raise PackageSimulationError("This package has no priced lines to test.")

    periods = sorted({line["date"][:7] for line in lines})
    months = _months_between(periods[0], periods[-1])
    request = {key: scenario[key] for key in SCENARIO_KEYS if key in scenario}
    request.update({"destination": quote["destination"], "start": periods[0], "months": months})
    try:
        result = simulator.run_simulation(request)
    except simulator.SimulationError as error:
        raise PackageSimulationError(str(error)) from error

    rows = {row["period"]: row for row in result["months"]}
    fee_rate = float(quote.get("fee_rate") or 0)
    base_sell = base_net = scen_sell = scen_net = 0.0
    per_month: dict[str, dict] = {}
    for line in lines:
        row = rows[line["date"][:7]]
        sell, net = float(line["sell_usd"]), float(line["net_usd"])
        s_sell, s_net = sell * row["sell_multiplier"], net * row["cost_multiplier"]
        base_sell += sell
        base_net += net
        scen_sell += s_sell
        scen_net += s_net
        month = per_month.setdefault(row["period"], {
            "period": row["period"], "sell_multiplier": row["sell_multiplier"],
            "cost_multiplier": row["cost_multiplier"], "baseline_sell": 0.0, "scenario_sell": 0.0,
            "baseline_profit": 0.0, "scenario_profit": 0.0,
        })
        month["baseline_sell"] += sell
        month["scenario_sell"] += s_sell
        month["baseline_profit"] += sell - net - sell * fee_rate
        month["scenario_profit"] += s_sell - s_net - s_sell * fee_rate

    base_profit = base_sell - base_net - base_sell * fee_rate
    scen_profit = scen_sell - scen_net - scen_sell * fee_rate
    warnings = list(result["warnings"])
    if scen_profit < 0:
        warnings.append("Under this scenario the package would make a loss at its current price.")
    elif _pct(scen_profit, scen_sell) < 10:
        warnings.append("Under this scenario the package margin falls below 10%.")

    return {
        "package_id": package_id,
        "title": saved.get("title"),
        "destination": quote["destination"],
        "window": result["window"],
        "baseline": {"sell_usd": round(base_sell, 2), "net_usd": round(base_net, 2),
                     "profit_usd": round(base_profit, 2), "margin_pct": _pct(base_profit, base_sell)},
        "scenario": {"sell_usd": round(scen_sell, 2), "net_usd": round(scen_net, 2),
                     "profit_usd": round(scen_profit, 2), "margin_pct": _pct(scen_profit, scen_sell)},
        "delta": {"profit_usd": round(scen_profit - base_profit, 2),
                  "margin_points": round(_pct(scen_profit, scen_sell) - _pct(base_profit, base_sell), 2)},
        "months": [{**m, **{k: round(m[k], 2) for k in ("baseline_sell", "scenario_sell", "baseline_profit", "scenario_profit")}}
                   for m in sorted(per_month.values(), key=lambda m: m["period"])],
        "capped": result["capped"],
        "spillover": result["spillover"],
        "nearby_alternatives": _alternatives(result["spillover"]),
        "warnings": warnings,
        "basis": ("Applies the scenario's monthly price and cost multipliers to this package's own priced lines. "
                  "Fee rate is held at the package's rate. Assumption-based, sample data."),
        "is_sample": True,
        "data_origin": "assumption",
    }


def _alternatives(spillover: list[dict]) -> list[dict]:
    """Top related spots in the destinations that would receive displaced demand (Phase D)."""
    try:
        from app.services import spots
    except Exception:
        return []
    out = []
    for item in spillover[:MAX_ALTERNATIVES]:
        try:
            related = spots.related(item["slug"], mode="similar", limit=2)
        except Exception:  # missing coordinates or text must degrade, not fail the scenario
            continue
        out.append({
            "slug": item["slug"], "name": item["name"], "uplift_pct": item["uplift_pct"],
            "spots": [{"name": r.get("name"), "reason": r.get("reason")} for r in related.get("results", [])],
        })
    return out
