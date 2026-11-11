"""Related spots (feature #7): rank attractions near, like, or paired with an anchor.

Three modes, per the plan:

  near     – haversine distance from the anchor spot (same area only, by construction)
  similar  – hand-rolled TF-IDF over spot names, categories and the Wikimedia
             extracts fetched by scripts/fetch_wiki.py (cross-destination on purpose:
             text decides, so the Dolomites never surfaces Kyoto temples)
  day      – same-destination spots within a travel-time limit whose categories
             pair well for one sightseeing day (two half-day hikes never share a day)

A small log-scaled Wikipedia pageview boost breaks ties toward the better-known
place; the responsible-score boost arrives with Phase F. Every result carries a
plain-language reason string and, where Wikimedia text exists, its attribution
(source, licence, url) so any surface showing a result can show the credit.

Data comes from the seed loader (committed JSON today, the same path the Aiven
database uses for its supported files). Spots without coordinates or text
degrade: they are simply absent from the modes that need them, never an error.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict

from app.services.seed import load_json

MODES = ("near", "similar", "day")
DEFAULT_LIMIT = 6
DEFAULT_MAX_TRAVEL_MIN = 45
# Below this cosine the only shared words are corpus noise ("attraction",
# "located", …), which is how Kyoto temples would sneak next to the Dolomites.
MIN_COSINE = 0.08
# Local road speed used by the quote engine (quote.py) for non-transport legs.
ROAD_KMH = 35
# Log pageviews normalised to [0, 1], worth up to a 25% score bump.
POPULARITY_WEIGHT = 0.25

# Category compatibility for day plans: a category is "heavy" when its spot is
# typically a half-day or longer commitment. Two heavy spots never share a day.
HEAVY_HINTS = ("4", "half", "full", "day")
LIGHT_DURATION_DEFAULT = "1–2 hours"


class SpotError(ValueError):
    """Raised for a request the caller can fix (maps to HTTP 4xx)."""


_lock_note = "Data is served from the committed sample seed."


def _spots() -> list[dict]:
    return load_json("spots.json")


def _knowledge() -> dict:
    return load_json("spot_knowledge.json")


def _by_id(spots: list[dict]) -> dict[str, dict]:
    return {s["id"]: s for s in spots}


def _haversine_km(a: dict, b: dict) -> float | None:
    if a.get("lat") is None or a.get("lon") is None or b.get("lat") is None or b.get("lon") is None:
        return None
    lat1, lon1, lat2, lon2 = map(math.radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def _travel_min(km: float) -> int:
    return max(5, round(km / ROAD_KMH * 60))


_WORD_RE = re.compile(r"[a-zà-ÿ’']+")
_STOPWORDS = {
    "the", "and", "of", "a", "an", "in", "on", "at", "to", "is", "it", "its", "with",
    "for", "as", "by", "from", "that", "this", "are", "was", "were", "be", "been",
    "or", "de", "di", "la", "le", "el", "da", "des", "du", "one", "also",
}


def _tokens(text: str) -> list[str]:
    return [w for w in _WORD_RE.findall(text.lower()) if len(w) > 2 and w not in _STOPWORDS]


def _doc_text(spot: dict, know: dict) -> str:
    bits = [spot["name"], spot.get("category") or "", spot.get("subtype") or "",
            spot.get("location_label") or ""]
    for source in ("wikipedia", "wikivoyage"):
        extract = (know.get(source) or {}).get("extract")
        if extract:
            bits.append(extract)
    return " ".join(bits)


class _Tfidf:
    """Tiny TF-IDF + cosine, enough for a 38-document corpus and no new dependency."""

    def __init__(self, docs: list[list[str]]):
        self._idf: dict[str, float] = {}
        for term, count in Counter(t for doc in docs for t in set(doc)).items():
            self._idf[term] = math.log((1 + len(docs)) / (1 + count)) + 1
        self._vectors = [self._vector(doc) for doc in docs]

    def _vector(self, doc: list[str]) -> dict[str, float]:
        weights = {t: self._idf.get(t, 1.0) * n for t, n in Counter(doc).items()}
        norm = math.sqrt(sum(w * w for w in weights.values())) or 1.0
        return {t: w / norm for t, w in weights.items()}

    def cosine(self, a_index: int, b_index: int) -> float:
        va, vb = self._vectors[a_index], self._vectors[b_index]
        if len(vb) < len(va):
            va, vb = vb, va
        return sum(w * vb.get(t, 0.0) for t, w in va.items())

    def shared_terms(self, a_index: int, b_index: int, k: int = 3) -> list[str]:
        va, vb = self._vectors[a_index], self._vectors[b_index]
        shared = set(va) & set(vb)
        return sorted(shared, key=lambda t: -(va[t] * vb[t]))[:k]


def _popularity(know: dict) -> dict[str, float]:
    views = {sid: (entry or {}).get("pageviews_12m") for sid, entry in know.items()}
    logs = {sid: math.log10(1 + v) for sid, v in views.items() if v}
    top = max(logs.values(), default=0.0) or 1.0
    return {sid: logs[sid] / top for sid in logs}


def _is_heavy(spot: dict) -> bool:
    duration = (spot.get("typical_duration") or LIGHT_DURATION_DEFAULT).lower()
    return any(h in duration for h in HEAVY_HINTS)


def _attribution(know_entry: dict | None) -> list[dict]:
    if not know_entry:
        return []
    out = []
    for source, label in (("wikipedia", "Wikipedia"), ("wikivoyage", "Wikivoyage")):
        entry = know_entry.get(source)
        if entry:
            out.append({"source": label, "title": entry.get("title"), "licence": entry["licence"],
                        "url": entry["url"], "credit": entry["credit"]})
    return out


def _card(spot: dict, *, km: float | None = None, travel_min: int | None = None,
          score: float = 0.0, reason: str = "", know: dict | None = None) -> dict:
    return {
        "spot_id": spot["id"], "name": spot["name"], "destination": spot["destination"],
        "category": spot.get("category"), "location_label": spot.get("location_label"),
        "typical_duration": spot.get("typical_duration"), "lat": spot.get("lat"), "lon": spot.get("lon"),
        "image_id": spot.get("image_id"), "distance_km": round(km, 1) if km is not None else None,
        "travel_min": travel_min, "score": round(score, 4), "reason": reason,
        "attribution": _attribution(know), "is_sample": True,
    }


def _anchor(spots: list[dict], know: dict, destination: str, item: str | None) -> dict:
    by_id = _by_id(spots)
    if item:
        anchor = by_id.get(item) or next((s for s in spots if s["name"].lower() == item.lower()), None)
        if anchor is None:
            raise SpotError(f"Unknown spot '{item}'. Pass a spot id (e.g. spot_001) or a spot name.")
        if anchor["destination"] != destination:
            raise SpotError(f"Spot '{anchor['name']}' belongs to {anchor['destination']}, not {destination}.")
        return anchor
    pool = [s for s in spots if s["destination"] == destination]
    if not pool:
        raise SpotError(f"Unknown destination '{destination}'.")
    pop = _popularity(know)
    return max(pool, key=lambda s: pop.get(s["id"], 0.0))  # the destination's best-known spot


def related(destination: str, item: str | None = None, mode: str = "near",
            limit: int = DEFAULT_LIMIT, max_travel_min: int = DEFAULT_MAX_TRAVEL_MIN) -> dict:
    if mode not in MODES:
        raise SpotError(f"Unknown mode '{mode}'. Use one of: {', '.join(MODES)}.")
    spots = _spots()
    know = _knowledge()
    anchor = _anchor(spots, know, destination, item)
    pop = _popularity(know)

    if mode == "near":
        results = _near(spots, know, anchor, pop, limit)
    elif mode == "similar":
        results = _similar(spots, know, anchor, pop, limit)
    else:
        results = _day(spots, know, anchor, pop, limit, max_travel_min)

    return {
        "destination": destination, "mode": mode,
        "anchor": {"spot_id": anchor["id"], "name": anchor["name"], "destination": anchor["destination"]},
        "count": len(results), "results": results, "is_sample": True, "note": _lock_note,
    }


def _boost(score: float, spot_id: str, pop: dict[str, float]) -> float:
    return score * (1 + POPULARITY_WEIGHT * pop.get(spot_id, 0.0))


def _near(spots: list[dict], know: dict, anchor: dict, pop: dict, limit: int) -> list[dict]:
    scored = []
    for s in spots:
        if s["id"] == anchor["id"] or s["destination"] != anchor["destination"]:
            continue
        km = _haversine_km(anchor, s)
        if km is None:
            continue  # no coordinates: simply not a "near" candidate
        score = _boost(1 / (1 + km), s["id"], pop)
        minutes = _travel_min(km)
        reason = f"{km:.1f} km away · about {minutes} min by road"
        scored.append((score, _card(s, km=km, travel_min=minutes, score=score, reason=reason,
                                    know=know.get(s["id"]))))
    scored.sort(key=lambda pair: -pair[0])
    return [card for _, card in scored[:limit]]


def _similar(spots: list[dict], know: dict, anchor: dict, pop: dict, limit: int) -> list[dict]:
    corpus = [_tokens(_doc_text(s, know.get(s["id"]) or {})) for s in spots]
    tfidf = _Tfidf(corpus)
    a_index = next(i for i, s in enumerate(spots) if s["id"] == anchor["id"])
    scored = []
    for i, s in enumerate(spots):
        if s["id"] == anchor["id"]:
            continue
        cosine = tfidf.cosine(a_index, i)
        shared = tfidf.shared_terms(a_index, i)
        if cosine < MIN_COSINE or not shared:
            continue  # noise-level overlap: not a real "similar" match
        score = _boost(cosine, s["id"], pop)
        reason = "Shares themes: " + ", ".join(shared)
        scored.append((score, _card(s, score=score, reason=reason, know=know.get(s["id"]))))
    scored.sort(key=lambda pair: -pair[0])
    return [card for _, card in scored[:limit]]


def _day(spots: list[dict], know: dict, anchor: dict, pop: dict, limit: int,
         max_travel_min: int) -> list[dict]:
    anchor_heavy = _is_heavy(anchor)
    scored = []
    for s in spots:
        if s["id"] == anchor["id"] or s["destination"] != anchor["destination"]:
            continue
        km = _haversine_km(anchor, s)
        if km is None:
            continue
        minutes = _travel_min(km)
        if minutes > max_travel_min:
            continue
        if anchor_heavy and _is_heavy(s):
            continue  # two half-day commitments do not share a day
        score = _boost(1 / (1 + minutes / 60), s["id"], pop)
        pairing = "A big day out — keep it the focus" if anchor_heavy or _is_heavy(s) else "Pairs well in one day"
        reason = f"About {minutes} min away · {pairing.lower()}"
        scored.append((score, _card(s, km=km, travel_min=minutes, score=score, reason=reason,
                                    know=know.get(s["id"]))))
    scored.sort(key=lambda pair: -pair[0])
    return [card for _, card in scored[:limit]]


def reset() -> None:
    """No module state to clear (the seed loader owns its cache); kept for symmetry."""
    return None
