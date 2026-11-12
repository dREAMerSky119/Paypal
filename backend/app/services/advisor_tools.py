"""The advisor's tool belt (Phase G): strict schemas, validation, and the tool implementations.

Eight read/plan tools over the existing services. Each has:
  * a JSON schema with `additionalProperties: false`, enums and ranges, enforced by `validate_args`
    before the tool runs (the model's arguments are untrusted input);
  * a clear error response, never an exception: {"error": "..."} the model can act on;
  * a result that holds sell prices only. Net cost and margin never reach the model.

`create_checkout` is not here on purpose: it moves toward money, so it lives in agent.py behind
its own deterministic gate.

Tools take a `ctx` (agent._State or any object with the same attributes), so they can be unit
tested without Gemini.
"""
from __future__ import annotations

import re
from datetime import date

from app.services import advisor
from app.services import inventory as inv

SEARCH_LIMIT = 8
SLOTS = ("morning", "afternoon", "evening")


# ------------------------------------------------------------------ schema + validation

def _slugs() -> list[str]:
    return [d["slug"] for d in advisor._destinations()]


def schemas() -> dict[str, dict]:
    """Tool name -> {description, parameters(JSON Schema)}. Built per call so enums track the data."""
    slugs = _slugs()
    constraint_props = {
        "destination": {"type": "string", "enum": slugs},
        "nights": {"type": "integer", "minimum": 1, "maximum": advisor.MAX_NIGHTS},
        "travellers": {"type": "integer", "minimum": 1, "maximum": advisor.MAX_TRAVELLERS},
        "budget_amount": {"type": "number", "exclusiveMinimum": 0, "maximum": 1e9},
        "budget_currency": {"type": "string", "enum": ["INR", "USD"]},
        "budget_per_person": {"type": "boolean"},
        "tier": {"type": "string", "enum": list(advisor.TIER_RANK)},
        "pace": {"type": "string", "enum": list(advisor.PER_DAY)},
        "interests": {"type": "array", "items": {"type": "string", "enum": list(advisor.INTERESTS)}, "maxItems": 6},
        "prefer_responsible": {"type": "boolean",
                               "description": "Weight toward suppliers with VERIFIED responsible-travel claims."},
    }
    def obj(props, required=()):
        return {"type": "object", "properties": props, "required": list(required), "additionalProperties": False}
    return {
        "search_inventory": {
            "description": "Look up sample inventory in one destination (stays, experiences, guides, transfers). "
                           "Returns names, item_id and per-unit sell prices in USD, cheapest first. Items with an open anomaly flag are left out.",
            "parameters": obj({
                "destination": {"type": "string", "enum": slugs},
                "type": {"type": "string", "enum": list(inv.ITEM_TYPES)},
                "tier": {"type": "string", "enum": list(inv.TIERS)},
                "q": {"type": "string", "maxLength": 40, "description": "Optional keyword, e.g. 'tea' or 'hike'."},
                "limit": {"type": "integer", "minimum": 1, "maximum": SEARCH_LIMIT},
            }, ["destination"])},
        "get_rates": {
            "description": "Monthly sell rates (USD) for one inventory item_id from search_inventory.",
            "parameters": obj({"item_id": {"type": "string", "pattern": r"^item_\d{4}$"},
                               "months": {"type": "integer", "minimum": 1, "maximum": 12}}, ["item_id"])},
        "optimise_package": {
            "description": "Build the best priced itinerary the inventory and budget allow (deterministic). The ONLY source of "
                           "a package price. Call again with changed fields to revise it. Needs destination and nights.",
            "parameters": obj(constraint_props)},
        "quote_package": {
            "description": "Quote the CURRENT proposal for real travel dates: seasonal rates, travel-time and duplicate checks, "
                           "anomaly flags, responsible score and carbon. Call optimise_package first.",
            "parameters": obj({"start_date": {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$",
                                              "description": "YYYY-MM-DD; defaults to the first of next month."}})},
        "related_spots": {
            "description": "Places to add near the destination or an anchor spot. Modes: near (closest), similar (alike), day (fits the same day).",
            "parameters": obj({"destination": {"type": "string", "enum": slugs},
                               "mode": {"type": "string", "enum": ["near", "similar", "day"]},
                               "item": {"type": "string", "maxLength": 60, "description": "Optional anchor spot id or inventory item id."},
                               "limit": {"type": "integer", "minimum": 1, "maximum": 6}}, ["destination"])},
        "responsible_score": {
            "description": "Verified responsible-travel score. For the current proposal if one exists, otherwise for a destination. "
                           "Unverified claims are never counted.",
            "parameters": obj({"destination": {"type": "string", "enum": slugs}})},
        "forecast": {
            "description": "Demand forecast and confidence for one destination, plus its shoulder-season months.",
            "parameters": obj({"destination": {"type": "string", "enum": slugs},
                               "horizon": {"type": "integer", "minimum": 1, "maximum": 12}}, ["destination"])},
        "anomalies": {
            "description": "Open data-quality flags on inventory rates, so the agent can warn about suspicious prices.",
            "parameters": obj({"destination": {"type": "string", "enum": slugs},
                               "severity": {"type": "string", "enum": ["high", "medium", "low"]},
                               "limit": {"type": "integer", "minimum": 1, "maximum": 5}})},
    }


def _check(value, spec: dict, path: str) -> str | None:
    t = spec.get("type")
    if t == "string":
        if not isinstance(value, str):
            return f"{path} must be a string"
        if "enum" in spec and value not in spec["enum"]:
            return f"{path} must be one of: {', '.join(spec['enum'][:14])}"
        if len(value) > spec.get("maxLength", 200):
            return f"{path} is too long"
        if "pattern" in spec and not re.match(spec["pattern"], value):
            return f"{path} has the wrong format"
    elif t == "integer":
        if isinstance(value, bool) or not isinstance(value, (int, float)) or value != int(value):
            return f"{path} must be a whole number"
        if not spec.get("minimum", -1e18) <= value <= spec.get("maximum", 1e18):
            return f"{path} must be between {spec.get('minimum')} and {spec.get('maximum')}"
    elif t == "number":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return f"{path} must be a number"
        if value <= spec.get("exclusiveMinimum", -1e18) or value > spec.get("maximum", 1e18):
            return f"{path} is out of range"
    elif t == "boolean":
        if not isinstance(value, bool):
            return f"{path} must be true or false"
    elif t == "array":
        if not isinstance(value, list) or len(value) > spec.get("maxItems", 20):
            return f"{path} must be a short list"
        for n, v in enumerate(value):
            if (e := _check(v, spec["items"], f"{path}[{n}]")):
                return e
    return None


def validate_args(name: str, args) -> tuple[dict, str | None]:
    """Strictly check model-supplied arguments. Returns (clean_args, error). Unknown keys are an error."""
    spec = schemas().get(name)
    if spec is None:
        return {}, "Unknown tool."
    if args is None:
        args = {}
    if not isinstance(args, dict):
        return {}, "Arguments must be an object."
    params = spec["parameters"]
    extra = sorted(set(args) - set(params["properties"]))
    if extra:
        return {}, f"Unknown argument(s): {', '.join(extra)}."
    for r in params["required"]:
        if args.get(r) is None:
            return {}, f"Missing required argument: {r}."
    clean = {}
    for k, v in args.items():
        if v is None:
            continue
        if (e := _check(v, params["properties"][k], k)):
            return {}, e
        clean[k] = v
    return clean, None


def to_gemini(schema: dict) -> dict:
    """JSON Schema -> Gemini's OpenAPI subset (upper-case types, no additionalProperties/pattern)."""
    out = {}
    for k, v in schema.items():
        if k in ("additionalProperties", "pattern", "exclusiveMinimum", "maxLength", "maxItems"):
            continue
        if k == "type":
            out[k] = v.upper()
        elif k == "properties":
            out[k] = {pk: to_gemini(pv) for pk, pv in v.items()}
        elif k == "items":
            out[k] = to_gemini(v)
        elif k == "required" and not v:
            continue
        else:
            out[k] = v
    return out


def declarations() -> list[dict]:
    return [{"name": n, "description": s["description"], "parameters": to_gemini(s["parameters"])}
            for n, s in schemas().items()]


# ------------------------------------------------------------------ proposal -> package payload

def default_start_date(today: date | None = None) -> str:
    t = today or date.today()
    return date(t.year + (t.month == 12), t.month % 12 + 1, 1).isoformat()


def proposal_to_package(proposal: dict, start_date: str | None = None, title: str | None = None) -> dict:
    """The package-builder payload for an advisor proposal. Prices are NOT carried over: the quote
    engine recomputes them from inventory rates, so the builder can never show a figure the server did not make."""
    nights = proposal["nights"]
    stay = next(l for l in proposal["lines"] if l["type"] == "stay")
    days: dict[int, list] = {}
    for l in proposal["lines"]:
        if l["day"]:
            n = len(days.setdefault(l["day"], []))
            days[l["day"]].append({"item_id": l["item_id"], "slot": SLOTS[min(n, len(SLOTS) - 1)]})
    transfer = next((l for l in proposal["lines"] if l["type"] == "transport"), None)
    return {
        "title": title or f"Advisor proposal · {proposal['destination']} · {nights} nights",
        "destination": proposal["destination"], "start_date": start_date or default_start_date(),
        "nights": nights, "travellers": proposal["travellers"],
        "stays": [{"item_id": stay["item_id"], "check_in_night": 1, "nights": nights}],
        "days": [{"day": d, "stops": s} for d, s in sorted(days.items())],
        "transfers": {"arrival": transfer["item_id"], "departure": transfer["item_id"]} if transfer else {},
    }


def proposal_impact(proposal: dict, start_date: str | None = None) -> dict | None:
    """Responsible score, carbon, anomaly flags and travel checks for the proposal card.
    None if the quote engine cannot price it; a failure here never blocks a proposal."""
    try:
        from app.services import quote
        q = quote.quote_package(proposal_to_package(proposal, start_date))
    except Exception:
        return None
    c = q["checks"]
    rs = c.get("responsible_score") or {}
    return {
        "start_date": q["start_date"],
        "dated_sell_usd": q["totals"]["sell_usd"],
        "responsible": {"score": rs.get("score"), "badge": rs.get("badge"), "status": rs.get("status"),
                        "coverage_pct": rs.get("coverage_pct")},
        "carbon": c.get("carbon"),
        "anomaly_flags": [{"item_id": f["item_id"], "name": f["name"], "severity": f["severity"],
                           "detail": f["detail"]} for f in c.get("anomaly_flags", [])],
        "travel_time": c.get("travel_time", []),
        "swap_suggestions": c.get("swap_suggestions", []),
        "notes": [w for w in q["warnings"] if not w.startswith(("Two stops share", "No arrival", "No departure"))],
    }


# ------------------------------------------------------------------ tools

def _flagged() -> set[str]:
    from app.services import optimiser
    return optimiser.flagged_item_ids()


def search_inventory(ctx, a: dict) -> dict:
    usable, _ = advisor._trusted_items(a["destination"])
    flagged = _flagged()
    q = str(a.get("q") or "").strip().lower()
    rows = [i for i in usable if i["id"] not in flagged
            and (not a.get("type") or i["type"] == a["type"]) and (not a.get("tier") or i["tier"] == a["tier"])
            and (not q or q in f"{i['name']} {i['category']}".lower())]
    rows.sort(key=lambda i: (advisor.sell_unit(i), i["name"]))
    items = [{"item_id": i["id"], "name": i["name"], "type": i["type"], "tier": i["tier"], "category": i["category"],
              "unit": i["unit"], "price_usd": advisor.sell_unit(i)} for i in rows[:a.get("limit", 5)]]
    ctx.known_amounts += [i["price_usd"] for i in items]
    ctx.steps.append({"tool": "search_inventory", "ok": True, "note": f"{len(items)} of {len(rows)} items"})
    return {"count": len(rows), "items": items}  # sell prices only: no net cost, markup or supplier


def get_rates(ctx, a: dict) -> dict:
    item = next((i for i in inv.state()["items"] if i["id"] == a["item_id"]), None)
    if item is None:
        return {"error": "No such item_id. Use search_inventory to find one."}
    if a["item_id"] in _flagged():
        ctx.steps.append({"tool": "get_rates", "ok": False, "note": "rate is flagged as suspicious"})
        return {"error": "This item's rates have an open anomaly flag, so they are not quoted. Pick another item."}
    markup = 1 + (item.get("markup_pct") or 0) / 100
    rows = sorted(inv.state()["rates"].get(item["id"], []), key=lambda r: r.get("period", ""))
    rows = [r for r in rows if (r.get("net_price_usd") or 0) > 0][-a.get("months", 6):]
    rates = [{"period": r["period"], "price_usd": round(r["net_price_usd"] * markup, 2)} for r in rows]
    base = advisor.sell_unit(item)
    ctx.known_amounts += [base] + [r["price_usd"] for r in rates]
    ctx.steps.append({"tool": "get_rates", "ok": True, "note": f"{len(rates)} month(s) for {item['name']}"})
    return {"name": item["name"], "unit": item["unit"], "base_price_usd": base, "monthly": rates}


def optimise_package(ctx, a: dict) -> dict:
    from app.services import optimiser
    args = dict(a)
    prefer = args.pop("prefer_responsible", None)
    merged = advisor.merge_constraints(ctx.constraints, advisor.sanitize_llm_constraints(args))
    merged = advisor.merge_constraints(merged, ctx.rule_hints)  # explicit wording in the message wins
    if prefer is not None:
        merged["prefer_responsible"] = prefer
    advisor.validate(merged)
    missing = optimiser.missing_hard(merged)
    ctx.constraints = merged
    if missing:
        ctx.steps.append({"tool": "optimise_package", "ok": False, "note": f"missing {', '.join(missing)}"})
        return {"error": f"Still need: {', '.join(missing)}. Ask the customer one short question and call no tool."}
    proposal = optimiser.optimise(merged)
    proposal["impact"] = proposal_impact(proposal)
    ctx.proposal, ctx.checkout = proposal, None  # a revised trip invalidates any open checkout
    ctx.known_amounts += advisor._allowed_amounts(proposal)
    ctx.steps.append({"tool": "optimise_package", "ok": True, "note": f"${proposal['totals']['sell_usd']:,.2f} total"})
    facts = advisor.narrative_facts(proposal)  # excludes net cost, margin and item ids
    facts["prices_trace_to_inventory"] = not optimiser.trace_prices(proposal)
    return facts


def quote_package(ctx, a: dict) -> dict:
    if ctx.proposal is None:
        return {"error": "There is no proposal yet. Call optimise_package first."}
    start = a.get("start_date") or default_start_date()
    from app.services import quote
    try:
        date.fromisoformat(start)
        q = quote.quote_package(proposal_to_package(ctx.proposal, start))
    except (ValueError, quote.PackageQuoteError) as e:
        ctx.steps.append({"tool": "quote_package", "ok": False, "note": str(e)[:80]})
        return {"error": f"Could not quote: {e}"}
    t, c = q["totals"], q["checks"]
    ctx.known_amounts += [t["sell_usd"], t["per_person_usd"]]
    ctx.steps.append({"tool": "quote_package", "ok": True, "note": f"${t['sell_usd']:,.2f} for {start}"})
    rs = c.get("responsible_score") or {}
    return {"start_date": start, "total_usd": t["sell_usd"], "per_person_usd": t["per_person_usd"],
            "note": "Dated quote using that month's rates; it can differ from the proposal total, which uses base rates.",
            "travel_time_warnings": c["travel_time"], "duplicate_warnings": c["duplicates"],
            "anomaly_flag_count": len(c["anomaly_flags"]),
            "responsible": {"score": rs.get("score"), "coverage_pct": rs.get("coverage_pct"), "status": rs.get("status")},
            "other_warnings": [w for w in q["warnings"] if not w.startswith(("Two stops share", "No arrival", "No departure"))][:4]}


def related_spots(ctx, a: dict) -> dict:
    from app.services import spots
    try:
        res = spots.related(a["destination"], a.get("item"), a.get("mode", "near"), limit=a.get("limit", 4))
    except spots.SpotError as e:
        ctx.steps.append({"tool": "related_spots", "ok": False, "note": str(e)[:80]})
        return {"error": str(e)}
    ctx.steps.append({"tool": "related_spots", "ok": True, "note": f"{res['count']} {res['mode']} spot(s)"})
    return {"mode": res["mode"], "anchor": res["anchor"]["name"],
            "spots": [{"name": r["name"], "category": r["category"], "travel_min": r["travel_min"], "reason": r["reason"]}
                      for r in res["results"]]}


def responsible_score(ctx, a: dict) -> dict:
    from app.services import responsible
    if ctx.proposal is not None and not a.get("destination"):
        imp = ctx.proposal.get("impact") or proposal_impact(ctx.proposal)
        if imp is None:
            return {"error": "Could not score this proposal."}
        ctx.steps.append({"tool": "responsible_score", "ok": True, "note": "current proposal"})
        return {"scope": "proposal", **imp["responsible"],
                "note": "Verified claims only; suppliers without a verified claim count as not yet verified, not as zero."}
    dest = a.get("destination") or ctx.constraints.get("destination")
    if not dest:
        return {"error": "Give a destination, or build a proposal first."}
    d = responsible.destination_detail(dest)
    ctx.steps.append({"tool": "responsible_score", "ok": True, "note": dest})
    return {"scope": "destination", "average_score": d["average_score"], "supplier_count": d["supplier_count"],
            "scored_supplier_count": d["scored_supplier_count"], "note": d.get("message")}


def forecast(ctx, a: dict) -> dict:
    from app.services import demand_forecast as df
    try:
        f = df.get_demand_forecast(a["destination"], a.get("horizon", 3))
    except ValueError as e:
        return {"error": str(e)}
    shoulder = next((s for s in df.get_shoulder_season() if s["slug"] == a["destination"]), None)
    ctx.steps.append({"tool": "forecast", "ok": True, "note": f"{f['confidence_level']}% interval, {f['confidence']} confidence"})
    return {"destination": a["destination"], "confidence": f["confidence"], "interval_level_pct": f["confidence_level"],
            "note": f["confidence_note"],
            "months": [{"period": r["period"], "expected": r["predicted"], "low": r["lower"], "high": r["upper"]} for r in f["forecast"]],
            "shoulder_season_months": [m["month"] for m in (shoulder or {}).get("months", [])],
            "quietest_month": (shoulder or {}).get("quietest_month"), "peak_month": (shoulder or {}).get("peak_month")}


def anomalies_tool(ctx, a: dict) -> dict:
    from app.services import anomalies
    try:
        feed = anomalies.feed(severity=a.get("severity"), destination=a.get("destination"), status="open",
                              page_size=a.get("limit", 3))
    except ValueError as e:
        return {"error": str(e)}
    ctx.steps.append({"tool": "anomalies", "ok": True, "note": f"{feed['count']} open"})
    return {"open_count": feed["count"],
            "top": [{"item": r["item_name"], "severity": r["severity"], "codes": r["codes"],
                     "explanation": r["explanation"][:240]} for r in feed["items"]]}


IMPLEMENTATIONS = {
    "search_inventory": search_inventory, "get_rates": get_rates, "optimise_package": optimise_package,
    "quote_package": quote_package, "related_spots": related_spots, "responsible_score": responsible_score,
    "forecast": forecast, "anomalies": anomalies_tool,
}


def run_tool(ctx, name: str, args) -> dict:
    """Validate, then run. Always returns a dict: {"error": ...} on bad input or failure."""
    clean, err = validate_args(name, args)
    if err:
        ctx.steps.append({"tool": name, "ok": False, "note": err[:90]})
        return {"error": err}
    return IMPLEMENTATIONS[name](ctx, clean)
