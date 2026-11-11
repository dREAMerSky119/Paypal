"""Overview dashboard payload, computed from the same services the other pages use.

Nothing here is hand-written: every card reads the service that owns that number, so the
Overview can never disagree with Profitability, Inventory, Packages, Forecast, Responsible
travel or Anomaly watch. A section whose service fails is returned as ``None`` / empty and
the rest of the page still loads (the Overview is the landing page; it must not 500).

| Overview element | Source of truth |
| --- | --- |
| Gross booking value, avg. gross margin | ``profitability.get_profitability_summary()`` (same call as /app/analytics, no date filter) |
| Active itineraries, Upcoming journeys | ``packages.list_packages()`` (saved packages) |
| Supplier partners | ``inventory.state()`` (follows CSV imports) |
| "On the horizon" chart | ``demand_forecast`` committed forecast, mean demand index across destinations |
| Shoulder-season row | ``/api/forecast/shoulder-season`` (frontend) |
| Responsible note | ``responsible.overview()`` verified-supplier counts |
| Anomaly row | ``anomalies.summary()`` (same count as the topbar bell) |
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone

from app.services import inventory as inv

log = logging.getLogger(__name__)

_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]


def _safe(name: str, fn, fallback=None):
    try:
        return fn()
    except Exception:  # noqa: BLE001 - one broken section must not take the landing page down
        log.exception("Overview section %r failed", name)
        return fallback


def _destination_names() -> dict[str, str]:
    from app.services.seed import load_json
    return {d["slug"]: d["name"] for d in load_json("destinations.json")}


def _money(value: float) -> str:
    return f"${value:,.0f}"


def _metrics(packages: dict | None, summary: dict | None) -> list[dict]:
    st = inv.state()
    n_dest = len({i["destination"] for i in st["items"]})
    out = []

    if summary:
        out.append({"key": "gbv", "label": "Gross booking value", "value": _money(summary["gross_sales"]), "change": "",
                    "detail": f"{summary['completed_bookings']:,} completed bookings, all dates"})
    else:
        out.append({"key": "gbv", "label": "Gross booking value", "value": "—", "change": "", "detail": "Profitability data unavailable"})

    if packages is not None:
        count = packages["count"]
        dests = len({p["destination_slug"] for p in packages["items"]})
        detail = f"across {dests} destination{'s' if dests != 1 else ''}" if count else "none saved yet, build one in Packages"
        out.append({"key": "itineraries", "label": "Active itineraries", "value": str(count), "change": "", "detail": detail})
    else:
        out.append({"key": "itineraries", "label": "Active itineraries", "value": "—", "change": "", "detail": "Saved packages unavailable"})

    if summary:
        out.append({"key": "margin", "label": "Avg. gross margin", "value": f"{summary['gross_margin']:.1f}%", "change": "",
                    "detail": "after fees and cancellation leakage"})
    else:
        out.append({"key": "margin", "label": "Avg. gross margin", "value": "—", "change": "", "detail": "Profitability data unavailable"})

    out.append({"key": "suppliers", "label": "Supplier partners", "value": str(len(st["suppliers"])), "change": "",
                "detail": f"{len(st['items'])} bookable items across {n_dest} destinations"})
    return out


def _journeys(packages: dict | None, today: date, limit: int = 5) -> list[dict]:
    if not packages:
        return []
    names = _destination_names()

    def start(p):
        try:
            return date.fromisoformat(p["start_date"])
        except (TypeError, ValueError):
            return None

    rows = []
    for p in packages["items"]:
        s, e = start(p), None
        try:
            e = date.fromisoformat(p["end_date"])
        except (TypeError, ValueError):
            pass
        nights = (e - s).days if s and e else None
        quoted = p.get("sell_usd") is not None
        rows.append({
            "id": p["package_id"],
            "place": p["title"],
            "destination_slug": p["destination_slug"],
            "region": " · ".join(x for x in (names.get(p["destination_slug"], p["destination_slug"]),
                                              f"{nights} night{'s' if nights != 1 else ''}" if nights is not None else "") if x),
            "travellers": p.get("travellers"),
            "departure_date": s.isoformat() if s else None,
            "departure_offset_days": (s - today).days if s else None,
            "sell_usd": p.get("sell_usd"),
            "status": "Quoted" if quoted else "Draft",
            "tone": "sage" if quoted else "blue",
        })
    # Upcoming first (soonest), then past/undated by most recently updated (list_packages is already newest-first).
    upcoming = sorted((r for r in rows if r["departure_offset_days"] is not None and r["departure_offset_days"] >= 0),
                      key=lambda r: r["departure_offset_days"])
    rest = [r for r in rows if r not in upcoming]
    return (upcoming + rest)[:limit]


def _trend() -> dict | None:
    from app.services import demand_forecast
    seed = demand_forecast._seed()
    dests = seed["destinations"]
    if not dests:
        return None
    periods = [row["period"] for row in dests[0]["forecast"]][:6]
    values = []
    for i in range(len(periods)):
        vals = [d["forecast"][i]["predicted"] for d in dests if len(d["forecast"]) > i]
        values.append(round(sum(vals) / len(vals), 1))
    labels = [_MONTHS[int(p.split("-")[1]) - 1] for p in periods]
    first, peak = values[0], max(values)
    change = ((values[-1] - first) / first * 100) if first else 0.0
    return {
        "labels": labels,
        "values": values,
        "summary_value": f"{change:+.1f}%",
        "summary_text": f"Mean forecast demand index across {len(dests)} destinations, {labels[0]} to {labels[-1]} (peak {labels[values.index(peak)]})",
        "footnote": "Computed from the committed demand forecast · synthetic calibrated sample, not a live forecast",
    }


def _responsible_note() -> str | None:
    from app.services import responsible
    o = responsible.overview()
    total, scored = o["total_suppliers"], o["scored_suppliers"]
    if not total:
        return None
    if scored == 0:
        return f"0 of {total} sample partners have verified sustainability claims yet"
    return f"{scored} of {total} sample partners have verified sustainability claims"


def _anomalies() -> dict | None:
    from app.services import anomalies
    s = anomalies.summary()
    return {"open": s["open"], "high": s["high"], "resolved": s["resolved"]}


def build(today: date | None = None) -> dict:
    from app.services import packages as pkg
    from app.services import profitability

    today = today or date.today()
    packages = _safe("packages", pkg.list_packages)
    summary = _safe("profitability", profitability.get_profitability_summary)
    return {
        "is_sample": True,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "metrics": _metrics(packages, summary),
        "journeys": _journeys(packages, today),
        "journeys_total": packages["count"] if packages else 0,
        "trend": _safe("trend", _trend),
        "responsible_note": _safe("responsible", _responsible_note),
        "anomalies": _safe("anomalies", _anomalies),
    }
