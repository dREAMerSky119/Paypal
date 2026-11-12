"""Enrich every spot in app/data/spots.json with Wikimedia text and pageviews.

For each attraction this script looks up:
  1. an English Wikipedia page (search -> REST summary)            CC BY-SA 4.0
  2. an English Wikivoyage page (search -> intro extract)          CC BY-SA 3.0
  3. 12 months of Wikipedia pageviews (popularity signal)

Everything is written to app/data/spot_knowledge.json keyed by spot id, each
text stored with its licence and source URL so every surface that shows a
result can render a live attribution line.

Offline-safe by design: the related-spots service degrades gracefully when
this file is missing or a spot has no entry, so re-running is optional.
Only stdlib is used; nothing here runs in the deployed app.

Usage:  python scripts/fetch_wiki.py            (from backend/)
        python scripts/fetch_wiki.py --dry-run  (shows lookups, writes nothing)
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "app" / "data"
SPOTS_FILE = DATA_DIR / "spots.json"
OUT_FILE = DATA_DIR / "spot_knowledge.json"

# Wikimedia asks for a descriptive User-Agent on the API surfaces we use.
UA = {"User-Agent": "Wayfare-demo/1.0 (sample-data enrichment; offline seed builder)"}
SLEEP_S = 0.4  # be polite: well under the API limits, 5 requests per spot
LOOKAHEAD_MONTHS = 12


def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


STOPWORDS = {"di", "de", "the", "la", "el", "of"}

# A few spot names under which Wikimedia indexes the place under another title
# (local/alternative names), where free-text search returns an unrelated hit.
WIKI_ALIASES = {
    "Lago di Braies": "Pragser Wildsee",
    "Alpe di Siusi": "Seiser Alm",
    "Path of the Gods": "Sentiero degli Dei",
}
WIKIVOYAGE_ALIASES = {
    "Path of the Gods": "Amalfi Coast",
}


def _plausible(hit_title: str, name: str) -> bool:
    """Search engines sometimes return a related page (e.g. a hiking route that
    merely passes the lake). Require at least one meaningful shared word."""
    words = {w for w in name.lower().split() if len(w) > 2 and w not in STOPWORDS}
    return bool(words & set(hit_title.lower().replace("_", " ").split()))


def _search(api_host: str, name: str, extra: str) -> str | None:
    for q in (f"{name} {extra}".strip(), name):
        data = _get_json(
            f"https://{api_host}/w/api.php?action=query&list=search"
            f"&srsearch={urllib.parse.quote(q)}&srlimit=1&format=json"
        )
        hits = data.get("query", {}).get("search", [])
        if hits and _plausible(hits[0]["title"], name):
            return hits[0]["title"]
        time.sleep(SLEEP_S)
    return None


def _wiki_search(name: str, extra: str) -> str | None:
    return _search("en.wikipedia.org", name, extra)


def _wiki_summary(title: str) -> dict | None:
    path = urllib.parse.quote(title.replace(" ", "_"))
    data = _get_json(f"https://en.wikipedia.org/api/rest_v1/page/summary/{path}")
    if data.get("type") != "standard" or not data.get("extract"):
        return None
    return {
        "title": data["titles"]["normalized"],
        "url": data["content_urls"]["desktop"]["page"],
        "extract": data["extract"].strip(),
        "licence": "CC BY-SA 4.0",
        "credit": "Wikipedia contributors",
    }


def _wikivoyage_search(title: str, extra: str) -> str | None:
    return _search("en.wikivoyage.org", title, extra)


def _wikivoyage_extract(title: str) -> dict | None:
    q = urllib.parse.quote(title)
    data = _get_json(
        "https://en.wikivoyage.org/w/api.php?action=query&prop=extracts"
        f"&explaintext=1&exintro=1&format=json&redirects=1&titles={q}"
    )
    page = next(iter(data.get("query", {}).get("pages", {}).values()), {})
    extract = (page.get("extract") or "").strip()
    if not extract:
        return None
    return {
        "title": title,
        "url": f"https://en.wikivoyage.org/wiki/{urllib.parse.quote(title.replace(' ', '_'))}",
        "extract": " ".join(extract.split())[:900],
        "licence": "CC BY-SA 3.0",
        "credit": "Wikivoyage contributors",
    }


def _pageviews_12m(title: str) -> int | None:
    end = date.today().replace(day=1) - timedelta(days=1)
    start = end.replace(day=1) - timedelta(days=365)
    q = urllib.parse.quote(title.replace(" ", "_"))
    url = (
        "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article"
        f"/en.wikipedia/all-access/user/{q}/monthly/"
        f"{start.strftime('%Y%m%d')}/{end.strftime('%Y%m%d')}"
    )
    try:
        data = _get_json(url)
    except Exception:
        return None
    return sum(int(item.get("views", 0)) for item in data.get("items", [])) or None


def enrich_spot(spot: dict, entry: dict | None = None) -> dict:
    """One spot -> its knowledge entry. Missing pieces stay None/absent.
    When an entry already exists, only the missing pieces are fetched."""
    name, place = spot["name"], spot.get("location_label") or ""
    extra = place if place and place.lower() not in name.lower() else ""
    entry = dict(entry or {"spot_id": spot["id"], "name": name})

    if "wikipedia" not in entry:
        try:
            title = WIKI_ALIASES.get(name) or _wiki_search(name, extra)
            time.sleep(SLEEP_S)
            summary = _wiki_summary(title) if title else None
            time.sleep(SLEEP_S)
            if summary:
                entry["wikipedia"] = summary
        except Exception as exc:
            print(f"    wikipedia failed: {exc}")

    if "wikivoyage" not in entry:
        try:
            vtitle = WIKIVOYAGE_ALIASES.get(name) or _wikivoyage_search(name, extra)
            time.sleep(SLEEP_S)
            guide = _wikivoyage_extract(vtitle) if vtitle else None
            time.sleep(SLEEP_S)
            if guide:
                entry["wikivoyage"] = guide
        except Exception as exc:
            print(f"    wikivoyage failed: {exc}")

    wiki_title = (entry.get("wikipedia") or {}).get("title")
    if wiki_title and "pageviews_12m" not in entry:
        try:
            views = _pageviews_12m(wiki_title)
            time.sleep(SLEEP_S)
            if views:
                entry["pageviews_12m"] = views
        except Exception as exc:
            print(f"    pageviews failed: {exc}")

    entry["fetched_at"] = date.today().isoformat()
    return entry


def main() -> int:
    dry_run = "--dry-run" in sys.argv
    spots = json.loads(SPOTS_FILE.read_text(encoding="utf-8"))
    existing = {}
    if OUT_FILE.exists():
        existing = json.loads(OUT_FILE.read_text(encoding="utf-8"))

    print(f"Enriching {len(spots)} spots{' (dry run)' if dry_run else ''}")
    out: dict = {}
    for i, spot in enumerate(spots, 1):
        key = spot["id"]
        prior = existing.get(key)
        # Fill only what is missing, so re-runs heal gaps without re-fetching everything.
        entry = enrich_spot(spot, prior)
        out[key] = entry
        if prior:
            gained = {k for k in ("wikipedia", "wikivoyage", "pageviews_12m") if entry.get(k) and not prior.get(k)}
            print(f"[{i:>2}/{len(spots)}] {spot['name']}: " + ("filled " + ", ".join(sorted(gained)) if gained else "already complete"))
        else:
            bits = [k for k in ("wikipedia", "wikivoyage", "pageviews_12m") if entry.get(k)]
            print(f"[{i:>2}/{len(spots)}] {spot['name']}: " + ("ok: " + ", ".join(bits) if bits else "NO LOOKUPS SUCCEEDED"))

    if not dry_run:
        OUT_FILE.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Wrote {OUT_FILE} ({len(out)} entries)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
