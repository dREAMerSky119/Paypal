"""Deterministic package optimiser (Phase G).

Same inputs always give the same proposal; no LLM is involved. Rules:

* Hard constraints come first: destination and nights must be known (`missing_hard`), the
  budget is never exceeded when a plan inside it exists, and an infeasible budget is reported
  with the cheapest possible total instead of being silently broken (`feasibility`).
* Items with an open anomaly flag are excluded, so a suspicious rate never reaches a customer.
  If that would leave no stay at all, the flagged stays are used and a warning says so.
* Stay and transfer are chosen by rule; activities are chosen by a 0/1 knapsack (maximise value
  subject to the budget left and the number of slots), with the greedy value-per-dollar answer
  as a floor, so the result is never worse than the greedy plan.
* `prefer_responsible` adds a bounded boost from VERIFIED supplier scores only (see
  services/responsible.py); unverified claims contribute nothing.
* Every price is `base_net_price_usd` of an inventory item plus that item's markup, so each line
  traces to an inventory rate: `trace_prices` proves it.
"""
from __future__ import annotations

import logging
import re
from collections import defaultdict

from app.services import advisor
from app.services import inventory as inv

log = logging.getLogger("wayfare.optimiser")

RESPONSIBLE_BOOST = 1.5      # most a perfect verified score can add to an activity's value
KNAPSACK_BUCKETS = 400       # cost resolution of the DP: enough for exactness within ~$1 on typical trips


def missing_hard(c: dict) -> list[str]:
    """Hard constraints still unknown. The advisor must ask for these, never guess them."""
    return advisor.missing_fields(c)


def flagged_item_ids() -> set[str]:
    """Items with an open anomaly flag. Empty if the anomaly service is unavailable."""
    try:
        from app.services import anomalies
        return set(anomalies.flags_by_item())
    except Exception:
        log.warning("anomaly flags unavailable; optimiser is not excluding flagged rates")
        return set()


def _verified_score(item: dict) -> float:
    """0..1 from the supplier's verified score, 0 when it has none."""
    try:
        from app.services import responsible
        s = responsible.supplier_summary(item.get("supplier_id"))
        return max(0.0, min(1.0, (s["score"] or 0) / 100.0)) if s and s.get("score") is not None else 0.0
    except Exception:
        return 0.0


def trace_prices(proposal: dict) -> list[dict]:
    """Lines whose price does NOT trace to an inventory rate. Empty means every price is traceable."""
    items = {i["id"]: i for i in inv.state()["items"]}
    bad = []
    for l in proposal.get("lines", []):
        it = items.get(l["item_id"])
        if (it is None or it["name"] != l["name"] or abs(it["base_net_price_usd"] - l["unit_net_usd"]) > 0.005
                or abs(advisor.sell_unit(it) - l["unit_sell_usd"]) > 0.005):
            bad.append({"item_id": l["item_id"], "name": l["name"]})
    return bad


def _knapsack(cands: list[tuple], slots: int, budget_left: float | None, max_guides: int) -> list[dict]:
    """Pick up to `slots` activities maximising total score within budget_left.
    cands: (score, cost, item). Guides are capped. Deterministic: ties broken by item id."""
    cands = sorted(cands, key=lambda x: (-x[0] / max(x[1], 1.0), x[2]["id"]))
    if budget_left is None:
        picked, guides = [], 0
        for score, cost, i in cands:
            if len(picked) >= slots:
                break
            if i["type"] == "guide":
                if guides >= max_guides:
                    continue
                guides += 1
            picked.append(i)
        return picked

    unit = max(1.0, budget_left / KNAPSACK_BUCKETS)
    cap = int(budget_left // unit)
    w = [int(-(-c // unit)) for _, c, _ in cands]            # round costs UP so a pick can never overspend
    n = len(cands)
    # best[k][b] = best (score, picks) using exactly k items and at most b buckets; guides tracked in the key
    best: dict[tuple[int, int], tuple[float, tuple[int, ...]]] = {(0, 0): (0.0, ())}
    for idx in range(n):
        score, cost, item = cands[idx]
        if w[idx] > cap:
            continue
        for (k, b), (val, picks) in sorted(best.items(), reverse=True):
            if k >= slots or b + w[idx] > cap:
                continue
            if item["type"] == "guide" and sum(1 for p in picks if cands[p][2]["type"] == "guide") >= max_guides:
                continue
            key = (k + 1, b + w[idx])
            cand = (val + score, picks + (idx,))
            cur = best.get(key)
            if cur is None or cand[0] > cur[0] + 1e-9:
                best[key] = cand
    top = max(best.values(), key=lambda v: (round(v[0], 9), tuple(-x for x in v[1])))
    chosen = [cands[p][2] for p in top[1]]
    # exact re-check with real (unrounded) costs; drop the lowest-value pick until it fits
    def total(items): return sum(next(c for _, c, i in cands if i is it) for it in items)
    while chosen and total(chosen) > budget_left + 1e-6:
        chosen.remove(min(chosen, key=lambda it: next(s for s, _, i in cands if i is it)))
    return chosen


def optimise(c: dict, *, prefer_responsible: bool | None = None, exclude_flagged: bool = True) -> dict:
    """Build a proposal for complete constraints. Raises AdvisorError when impossible."""
    advisor.validate(c)
    if missing_hard(c):
        raise advisor.AdvisorError("Need " + " and ".join(missing_hard(c)) + " before planning.")
    prefer = bool(c.get("prefer_responsible")) if prefer_responsible is None else prefer_responsible
    dest, nights = c["destination"], int(c["nights"])
    trav = int(c.get("travellers") or 2)
    pace = c.get("pace") or "balanced"
    interests = c.get("interests") or []
    tier_pref = c.get("tier")
    budget = advisor.to_usd(c.get("budget_input"))
    if budget and c["budget_input"].get("per_person"):
        budget = round(budget * trav, 2)

    usable, excluded = advisor._trusted_items(dest)
    checks: list[dict] = []
    if excluded:
        checks.append({"level": "info", "message": f"Left out {len(excluded)} item(s) whose price looked wrong against peers."})
    flagged = flagged_item_ids() if exclude_flagged else set()
    n_flagged = 0
    if flagged:
        clean = [i for i in usable if i["id"] not in flagged]
        n_flagged = len(usable) - len(clean)
        if n_flagged and not any(i["type"] == "stay" for i in clean):
            checks.append({"level": "warn", "message": "Every stay here has an open anomaly flag, so a flagged stay was used. Review it before quoting."})
            n_flagged = 0
        else:
            usable = clean
    if n_flagged:
        checks.append({"level": "info", "message": f"Left out {n_flagged} item(s) with an open anomaly flag."})

    stays = [i for i in usable if i["type"] == "stay"]
    if not stays:
        raise advisor.AdvisorError("This destination has no usable stays in the sample inventory.")

    # 1) stay: best tier that fits ~50% of the budget, else cheapest
    stay_cap = budget * 0.5 if budget else None
    def stay_cost(i): return advisor._stay_line(i, nights, trav)["sell_usd"]
    def stay_resp(i): return _verified_score(i) if prefer else 0.0
    pool = [i for i in stays if not tier_pref or i["tier"] == tier_pref] or stays
    if tier_pref and pool is stays:
        checks.append({"level": "info", "message": f"No {tier_pref} stays here, so I used the closest alternatives."})
    if stay_cap is not None:
        fits = [i for i in pool if stay_cost(i) <= stay_cap]
        if not fits and pool is not stays:
            fits = [i for i in stays if stay_cost(i) <= stay_cap]
        chosen = max(fits, key=lambda i: (advisor.TIER_RANK[i["tier"]], advisor._interest_score(i, interests),
                                          round(stay_resp(i), 3), -stay_cost(i), i["id"])) if fits \
            else min(stays, key=lambda i: (stay_cost(i), -stay_resp(i), i["id"]))
    else:
        want = tier_pref or "mid"
        chosen = min(pool, key=lambda i: (abs(advisor.TIER_RANK[i["tier"]] - advisor.TIER_RANK[want]),
                                          -round(stay_resp(i), 3), stay_cost(i), i["id"]))
    stay = chosen
    lines = [advisor._stay_line(stay, nights, trav)]
    spent = lines[0]["sell_usd"]

    # 2) airport transfer: nearest to the stay
    transfers = [i for i in usable if i["category"] == "airport_transfer"]
    sp = advisor._pt(stay)
    if transfers:
        t = min(transfers, key=lambda i: (advisor.haversine_km(sp, advisor._pt(i)) if sp and advisor._pt(i) else 1e9, i["id"]))
        tl = advisor._transfer_line(t, trav)
        if budget is None or spent + tl["sell_usd"] <= budget:
            lines.append(tl)
            spent += tl["sell_usd"]
        else:
            checks.append({"level": "warn", "message": "Airport transfer skipped to stay within budget."})

    # 3) activities: knapsack over value, floor = greedy
    slots = nights * advisor.PER_DAY[pace]
    cands = []
    for i in usable:
        if i["type"] not in ("experience", "guide"):
            continue
        p = advisor._pt(i)
        dist = advisor.haversine_km(sp, p) if sp and p else None
        if dist is not None and dist / advisor.SPEED_KMH > advisor.MAX_LEG_HOURS:
            continue
        cost = advisor._activity_line(i, trav, None)["sell_usd"]
        score = 1.0 + 3 * advisor._interest_score(i, interests) + (1 if not tier_pref or i["tier"] == tier_pref else 0) \
            - (dist / 100 if dist is not None else 0.5)
        if i["type"] == "guide" and not interests:
            score -= 0.5
        if prefer:
            score += RESPONSIBLE_BOOST * _verified_score(i)
        cands.append((max(score, 0.05), cost, i))
    left = None if budget is None else max(0.0, budget - spent)
    max_guides = max(1, nights // 2)
    picked = _knapsack(cands, slots, left, max_guides)
    greedy = _knapsack(cands, slots, None, max_guides) if left is None else None
    if greedy is None:  # greedy floor under the budget
        g, gs, gu = [], 0.0, 0
        for score, cost, i in sorted(cands, key=lambda x: (-x[0] / max(x[1], 1.0), x[2]["id"])):
            if len(g) >= slots or gs + cost > left:
                continue
            if i["type"] == "guide":
                if gu >= max_guides:
                    continue
                gu += 1
            g.append(i); gs += cost
        value = lambda items: sum(s for s, _, i in cands if i in items)
        if value(g) > value(picked) + 1e-9:
            picked = g

    ordered, cur, rest = [], sp, picked[:]
    while rest:
        nxt = min(rest, key=lambda i: (advisor.haversine_km(cur, advisor._pt(i)) if cur and advisor._pt(i) else 0, i["id"]))
        ordered.append(nxt)
        cur = advisor._pt(nxt) or cur
        rest.remove(nxt)
    per_day = advisor.PER_DAY[pace]
    for n, i in enumerate(ordered):
        lines.append(advisor._activity_line(i, trav, min(nights, n // per_day + 1)))

    net = round(sum(l["net_usd"] for l in lines), 2)
    sell = round(sum(l["sell_usd"] for l in lines), 2)
    margin = round(sell - net, 2)

    by_day = defaultdict(list)
    for l in lines:
        if l["day"]:
            by_day[l["day"]].append(l)
    for d, ls in sorted(by_day.items()):
        pts = [sp] + [(l["lat"], l["lon"]) for l in ls if l["lat"] is not None]
        km = sum(advisor.haversine_km(pts[k], pts[k + 1]) for k in range(len(pts) - 1)) if sp else 0
        if km / advisor.SPEED_KMH > advisor.MAX_LEG_HOURS * 2:
            checks.append({"level": "warn", "message": f"Day {d} has about {km / advisor.SPEED_KMH:.1f}h of driving."})
    min_total = None
    if budget is not None and sell > budget:
        min_total = round(min(stay_cost(i) for i in stays), 2)
        checks.append({"level": "warn", "message": f"Over budget by ${sell - budget:,.0f}: the cheapest valid stay already exceeds the share set aside for it."})
    if interests and not any(advisor._interest_score(i, interests) for i in ordered):
        checks.append({"level": "info", "message": "Nothing in this destination's sample inventory matched your interests closely."})
    if len([l for l in lines if l["day"]]) < slots:
        checks.append({"level": "info", "message": "Fewer activities than the pace allows: that is all that fits the budget and distance limits."})
    if prefer:
        checks.append({"level": "info", "message": "Weighted toward suppliers with verified responsible-travel claims; unverified claims were not counted."})
    checks.append({"level": "info", "message": "Sample data. Prices are generated, not live availability."})

    return {
        "destination": dest, "nights": nights, "travellers": trav, "pace": pace, "tier": tier_pref,
        "interests": interests, "budget_usd": budget, "lines": lines,
        "totals": {"net_usd": net, "sell_usd": sell, "margin_usd": margin,
                   "margin_pct": round(margin / sell * 100, 1) if sell else 0.0,
                   "per_person_usd": round(sell / trav, 2)},
        "within_budget": budget is None or sell <= budget, "checks": checks, "is_sample": True,
        "optimiser": {"method": "knapsack", "excluded_flagged": n_flagged, "responsible_weighted": prefer,
                      "min_total_usd": min_total},
    }
