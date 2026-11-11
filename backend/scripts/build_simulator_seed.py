"""Build app/data/simulator_assumptions.json for the market simulator (feature #5).

Reads scripts/data/wayfare_master.csv (events, FX assumptions, destinations) and
writes one small JSON file that the API loads at startup. Nothing here is a
measurement: every multiplier is an editable assumption with a source note.

Run from the backend folder:  python scripts/build_simulator_seed.py
No third-party packages needed.
"""
import csv
import json
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
MASTER = BACKEND / "scripts" / "data" / "wayfare_master.csv"
DESTINATIONS = BACKEND / "app" / "data" / "destinations.json"
OUT = BACKEND / "app" / "data" / "simulator_assumptions.json"

ASSUMPTION_FLAG = "Assumption, not a measurement"

# Effect of one unit of each slider. "Demand % per unit" means: moving the slider by
# 1 unit changes demand by that many percent. Calibrated to the preset rows in the
# master dataset (evt_047 to evt_053) within rounding.
EFFECT_TYPES = {
    "festival": {
        "label": "Festival and seasonal events",
        "driver": "events",
        "unit": "strength of each chosen event (%)",
        "note": "Multipliers live on each event row below (editable per event). Choose events instead of a slider.",
        "source_note": "Hand-curated events table; dates from the `holidays` package where available. " + ASSUMPTION_FLAG + ".",
    },
    "weather": {
        "label": "Weather shock", "driver": "slider", "unit": "severity (0 to 100)",
        "min": 0, "max": 100, "default": 0, "step": 1,
        "demand_per_unit": -0.30, "rate_per_unit": -0.15, "cost_per_unit": 0.0,
        "source_note": "Calibrated so severity 67 gives x0.80 demand, matching the 'Heavy monsoon' preset row (evt_047). " + ASSUMPTION_FLAG + ".",
    },
    "fuel": {
        "label": "Fuel price", "driver": "slider", "unit": "change in fuel price (%)",
        "min": -30, "max": 100, "default": 0, "step": 1,
        "demand_per_unit": -0.30, "rate_per_unit": 0.40, "cost_per_unit": 0.40,
        "source_note": "Calibrated so +20% gives x0.94 demand and x1.08 rates and costs (evt_048). Transport costs pass through. " + ASSUMPTION_FLAG + ".",
    },
    "currency": {
        "label": "Local currency vs USD", "driver": "slider", "unit": "change in local currency (%); negative = weaker",
        "min": -20, "max": 20, "default": 0, "step": 1,
        "demand_per_unit": -0.80, "rate_per_unit": 1.00, "cost_per_unit": 1.00,
        "source_note": "A weaker local currency makes the destination cheaper for USD travellers. Calibrated to evt_049 and evt_050 within rounding. " + ASSUMPTION_FLAG + ".",
    },
    "visa": {
        "label": "Visa and entry policy", "driver": "slider", "unit": "change in ease of entry (%); negative = harder",
        "min": -50, "max": 50, "default": 0, "step": 1,
        "demand_per_unit": 0.30, "rate_per_unit": 0.09, "cost_per_unit": 0.0,
        "source_note": "Calibrated so +33 gives x1.10 demand (evt_051). " + ASSUMPTION_FLAG + ".",
    },
    "disruption": {
        "label": "Disruption (strikes, closures, unrest)", "driver": "slider", "unit": "severity (0 to 100)",
        "min": 0, "max": 100, "default": 0, "step": 1,
        "demand_per_unit": -0.55, "rate_per_unit": -0.15, "cost_per_unit": 0.05,
        "source_note": "Calibrated so severity 100 gives x0.45 demand (evt_052). " + ASSUMPTION_FLAG + ".",
    },
}

GLOBALS = {
    "demand_to_rate": {"value": 0.35, "label": "Rate response to demand", "note": "Rates move by demand multiplier to this power (0 = rates ignore demand, 1 = fully proportional)."},
    "sell_pass_through": {"value": 0.90, "label": "Sell price follows market rates", "note": "Share of a rate move the agency passes into sell prices (power on the rate multiplier)."},
    "cost_follows_rate": {"value": 0.50, "label": "Supplier cost follows rates", "note": "Share of a market rate move that reaches supplier net cost."},
    "occupancy_at_peak": {"value": 0.85, "label": "Occupancy in the busiest historical month", "note": "Proxy only. Used to turn the demand index into an occupancy estimate."},
    "occupancy_ceiling": {"value": 0.98, "label": "Occupancy ceiling", "note": "Demand above this is turned away and can spill to similar destinations."},
    "spill_share": {"value": 0.30, "label": "Displaced demand that moves elsewhere", "note": "Rest is assumed lost to the wider market."},
    "spill_cap_pct": {"value": 25, "label": "Largest uplift a neighbour can receive (%)", "note": "Keeps spillover from producing implausible jumps."},
}

# Hard bounds so stacked events cannot produce absurd or negative demand.
BOUNDS = {
    "demand": [0.35, 2.5],
    "rate": [0.6, 1.6],
    "cost": [0.6, 1.6],
}

PRESETS = [
    {"id": "heavy-monsoon", "label": "Heavy monsoon", "destination": "kerala-india", "start": "2027-06", "months": 3,
     "adjustments": {"weather": 67}, "event_types": [], "expect": "Demand and rates fall.",
     "detail": "Severity 67 of 100, from the monsoon preset in the events table."},
    {"id": "fuel-plus-20", "label": "Fuel +20%", "destination": "bali-indonesia", "start": "2027-01", "months": 3,
     "adjustments": {"fuel": 20}, "event_types": [], "expect": "Demand dips, costs and rates rise.",
     "detail": "Transport costs pass through to supplier net cost and market rates."},
    {"id": "inr-minus-5", "label": "INR \u22125%", "destination": "jaipur-india", "start": "2027-01", "months": 3,
     "adjustments": {"currency": -5}, "event_types": [], "expect": "Demand up slightly, USD rates and costs down.",
     "detail": "A weaker rupee makes India cheaper for USD travellers."},
    {"id": "eur-plus-5", "label": "EUR +5%", "destination": "amalfi-coast-italy", "start": "2027-01", "months": 3,
     "adjustments": {"currency": 5}, "event_types": [], "expect": "Demand dips, USD rates and costs up.",
     "detail": "A stronger euro makes Italy dearer for USD travellers."},
    {"id": "visa-easing", "label": "Visa easing", "destination": "udaipur-india", "start": "2027-01", "months": 6,
     "adjustments": {"visa": 33}, "event_types": [], "expect": "Demand and rates rise.",
     "detail": "Easier entry for inbound travellers."},
    {"id": "regional-disruption", "label": "Regional disruption", "destination": "kashmir-india", "start": "2027-04", "months": 3,
     "adjustments": {"disruption": 100}, "event_types": [], "expect": "Large demand drop, some spillover to similar destinations.",
     "detail": "Severe disruption over a quarter."},
    {"id": "airline-strike", "label": "Airline strike week", "destination": "amalfi-coast-italy", "start": "2027-06", "months": 1,
     "adjustments": {"disruption": 27}, "event_types": [], "expect": "Short, mild dip.",
     "detail": "One month, moderate severity."},
    {"id": "festival-shift", "label": "Festival season boost", "destination": "kyoto-japan", "start": "2027-03", "months": 3,
     "adjustments": {}, "event_types": ["festival", "seasonal"], "expect": "Demand and rates rise in event months.",
     "detail": "Switches on the festival and seasonal events that fall inside the window."},
]


def read_rows():
    with MASTER.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def build():
    rows = read_rows()

    destinations_json = json.loads(DESTINATIONS.read_text(encoding="utf-8"))
    currency = {r["destination_slug"]: r["currency"] for r in rows if r["record_type"] == "destination"}
    destinations = [
        {"slug": d["slug"], "name": d["name"], "country": d["country"], "currency": currency.get(d["slug"], "USD")}
        for d in destinations_json
    ]
    country_of = {d["slug"]: d["country"] for d in destinations}

    events = []
    for r in rows:
        if r["record_type"] != "event" or "(preset)" in r["name"]:
            continue
        slug = r["destination_slug"] or None
        events.append({
            "id": r["record_id"],
            "name": r["name"],
            "type": r["subtype"],
            "destination": slug,
            "country": r["country"] or (country_of.get(slug) if slug else None),
            "start": r["date"],
            "end": r["date_end"],
            "demand_multiplier": float(r["demand_multiplier"]),
            "rate_multiplier": float(r["rate_multiplier"]),
            "source_note": r["source_note"],
        })
    events.sort(key=lambda e: (e["start"], e["id"]))

    fx = [
        {"currency": r["currency"], "per_usd": float(r["index_value"]), "annual_volatility": float(r["score"]), "source_note": r["source_note"]}
        for r in rows if r["record_type"] == "fx_assumption"
    ]

    relations = {}
    for r in rows:
        if r["record_type"] == "relation" and r["category"] == "similar" and r["subtype"] == "destination":
            relations.setdefault(r["parent_id"], []).append({"slug": r["related_id"], "score": float(r["score"])})
    for items in relations.values():
        items.sort(key=lambda item: -item["score"])

    return {
        "version": 1,
        "is_sample": True,
        "data_origin": "assumption",
        "disclaimer": "Scenario results are illustrations built from editable assumptions. They are not forecasts of real demand, prices or profit.",
        "bounds": BOUNDS,
        "effect_types": EFFECT_TYPES,
        "globals": GLOBALS,
        "events": events,
        "fx": fx,
        "destinations": destinations,
        "similar_destinations": relations,
        "presets": PRESETS,
    }


if __name__ == "__main__":
    seed = build()
    OUT.write_text(json.dumps(seed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUT.relative_to(BACKEND)}: {len(seed['events'])} events, {len(seed['presets'])} presets, {len(seed['destinations'])} destinations")
