"""Inventory-grounded travel advisor.

The proposal is deterministic: it is built only from rows in the inventory, so every
price traces to an inventory item id, and `plan()` never calls an LLM.

Gemini (optional, see services/llm.py) sits around `plan()` in two places:
  * before it, to understand free text. Its output is whitelisted by
    `sanitize_llm_constraints`; plain rules win on conflict and fill whatever it misses.
  * after it, to phrase the reply. Any money figure in that text must match the
    proposal (`narrative_is_faithful`), otherwise the rule-based `describe()` is used.
With no key, or on any Gemini failure, the advisor behaves exactly as it did without an LLM.
"""
import math
import re
import statistics
from collections import defaultdict

from app.services import inventory as inv
from app.services import llm
from app.services.seed import load_json

MAX_NIGHTS = 21
MAX_TRAVELLERS = 40
MAX_MESSAGE_CHARS = 600
SPEED_KMH = 40.0            # road-speed heuristic used for travel-time checks
MAX_LEG_HOURS = 2.0         # an activity further than this from the stay is dropped
OUTLIER_RATIO = 6.0         # price this many times off the peer median is excluded
PER_DAY = {"relaxed": 1, "balanced": 2, "packed": 3}
TIER_RANK = {"budget": 0, "mid": 1, "luxury": 2}

INTERESTS = {
    "food": ("food", "cook", "meal", "dairy", "cheese", "kitchen", "market", "tea", "eat", "culinary"),
    "culture": ("culture", "craft", "pottery", "textile", "studio", "heritage", "temple", "history", "artisan"),
    "walking": ("hike", "hiking", "walk", "trail", "trek", "mountain", "nature", "outdoors"),
    "stay": ("rifugio", "homestay", "overnight", "village"),
}
_WORD_NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
             "eight": 8, "nine": 9, "ten": 10, "a couple": 2, "couple": 2, "solo": 1}


class AdvisorError(ValueError):
    pass


def _num(tok: str) -> int | None:
    tok = tok.lower().strip()
    return int(tok) if tok.isdigit() else _WORD_NUM.get(tok)


def _destinations() -> list[dict]:
    return load_json("destinations.json")


def find_destination(text: str) -> str | None:
    low = text.lower()
    best, best_len = None, 0
    for d in _destinations():
        name = d["name"].lower()
        for key in {name, re.sub(r"^the ", "", name), d["slug"].replace("-", " "), d["slug"],
                    d["slug"].split("-")[0]}:
            if key in low and len(key) > best_len:
                best, best_len = d["slug"], len(key)
    return best


def parse_request(text: str) -> dict:
    """Pull whatever constraints the message states. Missing ones are simply absent."""
    low = text.lower()
    out: dict = {}
    dest = find_destination(text)
    if dest:
        out["destination"] = dest
    m = re.search(r"(\d+|one|two|three|four|five|six|seven|eight|nine|ten)[\s-]*(?:night|day)s?", low)
    if m and _num(m.group(1)):
        out["nights"] = _num(m.group(1))
    elif re.search(r"\bweek(?:end)?\b", low):
        out["nights"] = 2 if "weekend" in low else 7
    m = re.search(r"(?:for|of|with)\s+(\d+|two|three|four|five|six|seven|eight|nine|ten)\s*(?:people|persons|travell?ers|adults|guests|pax)?", low)
    if m and _num(m.group(1)) and not re.match(r"\s*(?:nights?|days?)", low[m.end():]):
        out["travellers"] = _num(m.group(1))
    elif re.search(r"\bcouple\b|\bhoneymoon\b", low):
        out["travellers"] = 2
    elif re.search(r"\bsolo\b|\bon my own\b", low):
        out["travellers"] = 1
    m = re.search(r"(?:₹|rs\.?\s*|inr\s*|\$|usd\s*|us\$)\s*([\d,]+(?:\.\d+)?)\s*(k)?|([\d,]+(?:\.\d+)?)\s*(k)?\s*(?:usd|dollars|inr|rupees)", low)
    if m:
        raw = (m.group(1) or m.group(3)).replace(",", "")
        val = float(raw) * (1000 if (m.group(2) or m.group(4)) else 1)
        cur = "INR" if re.search(r"₹|rs\.?|inr|rupee", m.group(0)) else "USD"
        out["budget_input"] = {"amount": val, "currency": cur,
                               "per_person": bool(re.search(r"per person|each|pp\b|/person", low))}
    if "luxury" in low or "splurge" in low:
        out["tier"] = "luxury"
    elif re.search(r"\bbudget\b(?!\s*(?:of|is|around|under|about|max|[:₹$\d]|rs|inr|usd))|\bcheap|\baffordable|\blow cost", low):
        out["tier"] = "budget"
    elif "mid-range" in low or "midrange" in low or "mid range" in low:
        out["tier"] = "mid"
    interests = [k for k, words in INTERESTS.items() if any(re.search(rf"\b{w}", low) for w in words)]
    if interests:
        out["interests"] = interests
    for pace, words in (("relaxed", ("relaxed", "slow", "easy", "leisurely")), ("packed", ("packed", "busy", "action")),
                        ("balanced", ("balanced",))):
        if any(w in low for w in words):
            out["pace"] = pace
            break
    return out


def _int_in(value, lo: int, hi: int) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value != int(value):
        return None
    return int(value) if lo <= int(value) <= hi else None


def sanitize_llm_constraints(raw: dict | None) -> dict:
    """Keep only well-formed, in-range values from the model. Anything else is dropped
    silently: a confused model must never turn into a validation error for the user."""
    if not isinstance(raw, dict):
        return {}
    out: dict = {}
    if raw.get("destination") in {d["slug"] for d in _destinations()}:
        out["destination"] = raw["destination"]
    if (n := _int_in(raw.get("nights"), 1, MAX_NIGHTS)) is not None:
        out["nights"] = n
    if (t := _int_in(raw.get("travellers"), 1, MAX_TRAVELLERS)) is not None:
        out["travellers"] = t
    if raw.get("tier") in TIER_RANK:
        out["tier"] = raw["tier"]
    if raw.get("pace") in PER_DAY:
        out["pace"] = raw["pace"]
    if isinstance(raw.get("interests"), list):
        interests = [i for i in dict.fromkeys(raw["interests"]) if isinstance(i, str) and i in INTERESTS]
        if interests:
            out["interests"] = interests
    amount = raw.get("budget_amount")
    if (not isinstance(amount, bool) and isinstance(amount, (int, float)) and 0 < amount < 1e9
            and raw.get("budget_currency") in ("INR", "USD")):
        out["budget_input"] = {"amount": float(amount), "currency": raw["budget_currency"],
                               "per_person": raw.get("budget_per_person") is True}
    return out


def llm_constraints(message: str, previous: dict | None) -> dict:
    """Constraints Gemini understood from the message (sanitized), or {} if unavailable."""
    raw = llm.extract_constraints(
        message, previous,
        destinations=[d["slug"] for d in _destinations()],
        tiers=list(TIER_RANK), paces=list(PER_DAY), interests=list(INTERESTS),
    )
    return sanitize_llm_constraints(raw)


_MONEY_RE = re.compile(r"(?:\$|US\$|USD\s*|₹|Rs\.?\s*|INR\s*|€|£)\s*([\d,]+(?:\.\d+)?)", re.I)
_MAX_NARRATIVE_CHARS = 700


def _allowed_amounts(proposal: dict) -> list[float]:
    t = proposal["totals"]
    vals = [t["sell_usd"], t["per_person_usd"]]
    if proposal.get("budget_usd") is not None:
        vals.append(proposal["budget_usd"])
    for l in proposal["lines"]:
        vals += [l["sell_usd"], l["unit_sell_usd"]]
    return vals


def narrative_is_faithful(text: str, proposal: dict | None, extra_amounts: list[float] | None = None) -> bool:
    """True only if the text is plain, short, and every money amount it states is a figure
    from the proposal (cents-exact, or rounded to a whole unit). Net cost and margin are
    internal, so quoting them fails the check too. `extra_amounts` lets the agent also allow
    figures it was handed by a tool (the deposit, a searched unit price)."""
    if not text or len(text) > _MAX_NARRATIVE_CHARS or re.search(r"[*#`]|\n\s*[-•]", text):
        return False
    allowed = (_allowed_amounts(proposal) if proposal else []) + list(extra_amounts or [])
    for m in _MONEY_RE.finditer(text):
        raw = m.group(1).replace(",", "").rstrip(".")
        try:
            val = float(raw)
        except ValueError:
            return False
        tol = 0.011 if "." in raw else 0.51
        if not any(abs(val - a) <= tol for a in allowed):
            return False
    return True


def narrative_facts(proposal: dict) -> dict:
    """The only things the model is told about a proposal. Deliberately excludes net cost,
    margin, item ids and the user's own message."""
    name = next((d["name"] for d in _destinations() if d["slug"] == proposal["destination"]), proposal["destination"])
    t = proposal["totals"]
    stay = next((l["name"] for l in proposal["lines"] if l["type"] == "stay"), None)
    return {
        "destination": name, "nights": proposal["nights"], "travellers": proposal["travellers"],
        "stay": stay,
        "activities": [{"day": l["day"], "name": l["name"]} for l in proposal["lines"] if l["day"]],
        "total_usd": t["sell_usd"], "per_person_usd": t["per_person_usd"],
        "budget_usd": proposal.get("budget_usd"), "within_budget": proposal["within_budget"],
        "notes": [c["message"] for c in proposal["checks"] if c["level"] == "warn"],
    }


def merge_constraints(previous: dict | None, new: dict) -> dict:
    merged = {**(previous or {}), **new}
    return merged


def validate(c: dict) -> dict:
    dest_slugs = {d["slug"] for d in _destinations()}
    if c.get("destination") and c["destination"] not in dest_slugs:
        raise AdvisorError(f"Unknown destination '{c['destination']}'")
    if "nights" in c and not 1 <= int(c["nights"]) <= MAX_NIGHTS:
        raise AdvisorError(f"Trips can be 1 to {MAX_NIGHTS} nights")
    if "travellers" in c and not 1 <= int(c["travellers"]) <= MAX_TRAVELLERS:
        raise AdvisorError(f"Group size can be 1 to {MAX_TRAVELLERS}")
    return c


def to_usd(budget_input: dict | None) -> float | None:
    if not budget_input:
        return None
    fx = inv.state()["meta"]["fx_per_usd"]
    amt = float(budget_input["amount"])
    usd = amt / fx.get(budget_input.get("currency", "USD"), 1.0)
    return round(usd, 2) if usd > 0 else None


def missing_fields(c: dict) -> list[str]:
    return [f for f in ("destination", "nights") if not c.get(f)]


_QUESTIONS = {
    "destination": "Which destination should I plan for? I can use any of the 12 in the sample inventory (for example Kyoto, Kerala or the Dolomites).",
    "nights": "How many nights is the trip?",
}


def clarifying_question(missing: list[str]) -> str:
    return " ".join(_QUESTIONS[m] for m in missing[:2])


# ------------------------------------------------------------------ geometry

def haversine_km(a: tuple, b: tuple) -> float:
    r = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def _pt(i: dict) -> tuple | None:
    return (i["lat"], i["lon"]) if i.get("lat") is not None and i.get("lon") is not None else None


# ------------------------------------------------------------------ pricing

def sell_unit(item: dict) -> float:
    return round(item["base_net_price_usd"] * (1 + (item.get("markup_pct") or 0) / 100), 2)


def _line(item: dict, qty: float, qty_label: str, day: int | None) -> dict:
    net = round(item["base_net_price_usd"] * qty, 2)
    sell = round(sell_unit(item) * qty, 2)
    return {"item_id": item["id"], "name": item["name"], "type": item["type"], "tier": item["tier"],
            "destination": item["destination"], "day": day, "unit": item["unit"], "qty": qty,
            "qty_label": qty_label, "unit_net_usd": item["base_net_price_usd"], "unit_sell_usd": sell_unit(item),
            "net_usd": net, "sell_usd": sell, "lat": item.get("lat"), "lon": item.get("lon")}


def _stay_line(item, nights, travellers):
    rooms = math.ceil(travellers / max(1, item["capacity"]))
    return _line(item, rooms * nights, f"{rooms} room(s) × {nights} night(s)", None)


def _activity_line(item, travellers, day):
    if item["unit"] == "per_person":
        return _line(item, travellers, f"{travellers} traveller(s)", day)
    return _line(item, 1, "1 guide", day)


def _transfer_line(item, travellers):
    vehicles = math.ceil(travellers / max(1, item["capacity"]))
    return _line(item, vehicles * 2, f"{vehicles} vehicle(s) × 2 legs (arrive + depart)", None)


# ------------------------------------------------------------------ candidates

def _trusted_items(destination: str) -> tuple[list[dict], list[dict]]:
    """Items for one destination, minus price outliers (likely data errors).
    Returns (usable, excluded)."""
    items = [i for i in inv.state()["items"] if i["destination"] == destination]
    groups: dict = defaultdict(list)
    for i in items:
        groups[(i["type"], i["category"])].append(i["base_net_price_usd"])
    usable, excluded = [], []
    for i in items:
        peers = groups[(i["type"], i["category"])]
        med = statistics.median(peers) if len(peers) >= 3 else None
        p = i["base_net_price_usd"]
        if p <= 0 or (med and (p > med * OUTLIER_RATIO or p < med / OUTLIER_RATIO)):
            excluded.append(i)
        else:
            usable.append(i)
    return usable, excluded


def _interest_score(item: dict, interests: list[str]) -> int:
    hay = f"{item['name']} {item['category']}".lower()
    return sum(1 for k in interests for w in INTERESTS.get(k, (k,)) if re.search(rf"\b{w}", hay))


def plan(c: dict) -> dict:
    """Build a proposal for complete constraints. Raises AdvisorError when impossible."""
    validate(c)
    dest, nights = c["destination"], int(c["nights"])
    trav = int(c.get("travellers") or 2)
    pace = c.get("pace") or "balanced"
    interests = c.get("interests") or []
    tier_pref = c.get("tier")
    budget = to_usd(c.get("budget_input"))
    if budget and c["budget_input"].get("per_person"):
        budget = round(budget * trav, 2)

    usable, excluded = _trusted_items(dest)
    stays = [i for i in usable if i["type"] == "stay"]
    if not stays:
        raise AdvisorError("This destination has no usable stays in the sample inventory.")
    checks: list[dict] = []
    if excluded:
        checks.append({"level": "info", "message": f"Left out {len(excluded)} item(s) whose price looked wrong against peers."})

    # 1) stay: best tier that fits ~50% of the budget, else cheapest
    stay_cap = budget * 0.5 if budget else None
    def stay_cost(i): return _stay_line(i, nights, trav)["sell_usd"]
    pool = [i for i in stays if not tier_pref or i["tier"] == tier_pref] or stays
    if tier_pref and pool is stays:
        checks.append({"level": "info", "message": f"No {tier_pref} stays here, so I used the closest alternatives."})
    if stay_cap is not None:
        fits = [i for i in pool if stay_cost(i) <= stay_cap]
        if not fits and pool is not stays:
            fits = [i for i in stays if stay_cost(i) <= stay_cap]
        chosen = max(fits, key=lambda i: (TIER_RANK[i["tier"]], _interest_score(i, interests), -stay_cost(i))) if fits \
            else min(stays, key=stay_cost)
    else:
        want = tier_pref or "mid"
        chosen = min(pool, key=lambda i: (abs(TIER_RANK[i["tier"]] - TIER_RANK[want]), stay_cost(i)))
    stay = chosen
    lines = [_stay_line(stay, nights, trav)]
    spent = lines[0]["sell_usd"]

    # 2) airport transfer: nearest to the stay
    transfers = [i for i in usable if i["category"] == "airport_transfer"]
    sp = _pt(stay)
    if transfers:
        t = min(transfers, key=lambda i: haversine_km(sp, _pt(i)) if sp and _pt(i) else 1e9)
        tl = _transfer_line(t, trav)
        if budget is None or spent + tl["sell_usd"] <= budget:
            lines.append(tl)
            spent += tl["sell_usd"]
        else:
            checks.append({"level": "warn", "message": "Airport transfer skipped to stay within budget."})

    # 3) activities, greedy by value per dollar within the remaining budget
    slots = nights * PER_DAY[pace]
    cands = []
    for i in usable:
        if i["type"] not in ("experience", "guide"):
            continue
        p = _pt(i)
        dist = haversine_km(sp, p) if sp and p else None
        if dist is not None and dist / SPEED_KMH > MAX_LEG_HOURS:
            continue
        cost = _activity_line(i, trav, None)["sell_usd"]
        score = 1.0 + 3 * _interest_score(i, interests) + (1 if not tier_pref or i["tier"] == tier_pref else 0) \
            - (dist / 100 if dist is not None else 0.5)
        if i["type"] == "guide" and not interests:
            score -= 0.5
        cands.append((score / max(cost, 1.0), score, cost, i))
    cands.sort(key=lambda x: (-x[0], x[3]["id"]))
    picked = []
    guides_used = 0
    for _, score, cost, i in cands:
        if len(picked) >= slots:
            break
        if budget is not None and spent + cost > budget:
            continue
        if i["type"] == "guide":
            if guides_used >= max(1, nights // 2):
                continue
            guides_used += 1
        picked.append(i)
        spent += cost
    # order by nearest-neighbour from the stay, then spread over days
    ordered, cur, left = [], sp, picked[:]
    while left:
        nxt = min(left, key=lambda i: haversine_km(cur, _pt(i)) if cur and _pt(i) else 0)
        ordered.append(nxt)
        cur = _pt(nxt) or cur
        left.remove(nxt)
    per_day = PER_DAY[pace]
    for n, i in enumerate(ordered):
        lines.append(_activity_line(i, trav, min(nights, n // per_day + 1)))

    net = round(sum(l["net_usd"] for l in lines), 2)
    sell = round(sum(l["sell_usd"] for l in lines), 2)
    margin = round(sell - net, 2)

    # 4) checks
    by_day = defaultdict(list)
    for l in lines:
        if l["day"]:
            by_day[l["day"]].append(l)
    for d, ls in sorted(by_day.items()):
        pts = [(sp)] + [(l["lat"], l["lon"]) for l in ls if l["lat"] is not None]
        km = sum(haversine_km(pts[k], pts[k + 1]) for k in range(len(pts) - 1)) if sp else 0
        if km / SPEED_KMH > MAX_LEG_HOURS * 2:
            checks.append({"level": "warn", "message": f"Day {d} has about {km / SPEED_KMH:.1f}h of driving."})
    if budget is not None and sell > budget:
        checks.append({"level": "warn", "message": f"Over budget by ${sell - budget:,.0f}: the cheapest valid stay already exceeds the share set aside for it."})
    if interests and not any(_interest_score(i, interests) for i in ordered):
        checks.append({"level": "info", "message": "Nothing in this destination's sample inventory matched your interests closely."})
    if len([l for l in lines if l["day"]]) < slots:
        checks.append({"level": "info", "message": "Fewer activities than the pace allows: that is all that fits the budget and distance limits."})
    checks.append({"level": "info", "message": "Sample data. Prices are generated, not live availability."})

    return {
        "destination": dest, "nights": nights, "travellers": trav, "pace": pace, "tier": tier_pref,
        "interests": interests, "budget_usd": budget, "lines": lines,
        "totals": {"net_usd": net, "sell_usd": sell, "margin_usd": margin,
                   "margin_pct": round(margin / sell * 100, 1) if sell else 0.0,
                   "per_person_usd": round(sell / trav, 2)},
        "within_budget": budget is None or sell <= budget, "checks": checks, "is_sample": True,
    }


def describe(c: dict, proposal: dict) -> str:
    name = next((d["name"] for d in _destinations() if d["slug"] == proposal["destination"]), proposal["destination"])
    stay = next(l for l in proposal["lines"] if l["type"] == "stay")
    n_act = sum(1 for l in proposal["lines"] if l["day"])
    t = proposal["totals"]
    return (f"Here is a {proposal['nights']}-night plan for {name} for {proposal['travellers']} traveller(s): "
            f"{stay['name']} plus {n_act} activit{'y' if n_act == 1 else 'ies'}. "
            f"Total ${t['sell_usd']:,.0f} (${t['per_person_usd']:,.0f} per person). Every price comes from a sample inventory item.")


def respond(message: str, constraints: dict | None = None, destination_hint: str | None = None) -> dict:
    message = (message or "").strip()
    if not message:
        raise AdvisorError("Please type a request.")
    if len(message) > MAX_MESSAGE_CHARS:
        raise AdvisorError(f"Please keep requests under {MAX_MESSAGE_CHARS} characters.")
    base = dict(constraints or {})
    if destination_hint and not base.get("destination") and destination_hint in {d["slug"] for d in _destinations()}:
        base["destination"] = destination_hint
    # Constraints the caller sent explicitly are checked on their own first, so a bad
    # value is rejected rather than silently replaced by whatever the message parses to.
    validate(base)
    # Layers, weakest first: earlier turns < Gemini's reading < explicit rule matches.
    # Rules win because they are deterministic; Gemini fills what the rules cannot read
    # ("a long weekend", "2 lakh rupees").
    understood = llm_constraints(message, base)
    merged = validate(merge_constraints(merge_constraints(base, understood), parse_request(message)))
    ai = {"model": llm.model_name() if llm.is_configured() else None,
          "understanding": "gemini" if understood else "rules", "reply": "rules"}
    missing = missing_fields(merged)
    if missing:
        return {"reply": clarifying_question(missing), "constraints": merged, "missing": missing,
                "proposal": None, "ai": ai}
    proposal = plan(merged)
    reply = describe(merged, proposal)
    text = llm.narrate(narrative_facts(proposal))
    if text and narrative_is_faithful(text, proposal):
        reply, ai["reply"] = text, "gemini"
    return {"reply": reply, "constraints": merged, "missing": [], "proposal": proposal, "ai": ai}
