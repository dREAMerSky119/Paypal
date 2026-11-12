"""Anomaly detection service (feature #9): the feed, resolutions and scans.

Three layers feed the same findings format (`services/anomaly_rules.finding`):

* rule   — zero/negative price, 10x and 100x ratio to peers, currency slips,
           missing fields (`services/anomaly_rules.py`)
* text   — rapidfuzz against the place/supplier vocabulary, near-duplicate
           suppliers and split words (`services/anomaly_rules.py`)
* stats  — MAD z-score against peers and against the item's own history, with
           the Isolation Forest kept as a third, corroborating signal
           (`services/anomaly_stats.py`)

Resolutions (accept / dismiss / fix) are stored in the database — Aiven when
DATABASE_URL is set, otherwise a local SQLite file — so they survive a restart.
The feed itself is recomputed from the seeded rates and the import store, so a
resolution is the only state that needs persisting.
"""
from __future__ import annotations

import json
import os
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd

from app import db
from app.services import anomaly_rules as rules
from app.services import anomaly_stats as stats

DATA_DIR = Path(__file__).resolve().parents[1] / "data"

STATUSES = ("open", "accepted", "dismissed", "fixed")
RESOLVE_ACTIONS = {"accept": "accepted", "dismiss": "dismissed", "fix": "fixed"}

# The Isolation Forest is a corroborating signal: on its own it only raises a
# flag when the price is also visibly off its peers, otherwise a deliberately
# narrow peer spread would flag most of the catalogue.
ML_ALONE_RATIO = 1.5

# A z-score only means something when the price is materially away from its
# comparison. The seeded rates are near-identical within a group, so their MAD is
# tiny and a 7% difference scores z = 4. Reporting that would bury the real errors,
# so a statistical finding needs the ratio to leave this band first.
Z_RATIO_HIGH, Z_RATIO_LOW = 1.8, 0.34

_SCHEMA = """
CREATE TABLE IF NOT EXISTS anomaly_resolution (
    anomaly_key VARCHAR(120) PRIMARY KEY,
    status VARCHAR(12) NOT NULL,
    note TEXT,
    resolved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""

_ready: set[str] = set()
_lock = threading.RLock()
_bundle = None
_frame = None
_frame_signature = None
_import_flags: dict[str, list[dict]] = {}
_resolution_cache: dict[str, dict] | None = None
_flags_cache: dict[str, dict] | None = None
_flags_key = None


# --------------------------------------------------------------- persistence

def _path() -> str:
    return os.getenv("ANOMALY_DB", "").strip() or str(
        Path(tempfile.gettempdir()) / "wayfare_anomalies.sqlite3"
    )


def _target() -> str:
    return db.url() if db.enabled() else "sqlite:///" + _path()


@contextmanager
def _connect():
    target = _target()
    with db.connect(target) as conn:
        if db.kind(target) == "sqlite" or target not in _ready:
            conn.execute(_SCHEMA)
            _ready.add(target)
        yield conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _read_resolutions() -> dict[str, dict]:
    try:
        with _connect() as conn:
            rows = conn.all("SELECT anomaly_key, status, note, resolved_at FROM anomaly_resolution")
    except Exception:
        # A sleeping or unreachable database must not take the feed down; the
        # page shows the anomalies and the banner says resolutions are offline.
        return {}
    out = {}
    for row in rows:
        resolved_at = row.get("resolved_at")
        if hasattr(resolved_at, "isoformat"):
            resolved_at = resolved_at.isoformat(timespec="seconds")
        out[row["anomaly_key"]] = {"status": row["status"], "note": row.get("note"),
                                   "resolved_at": resolved_at}
    return out


def resolutions() -> dict[str, dict]:
    """Every stored resolution, keyed by anomaly key.

    Read once per process and kept in memory: the feed resolves dozens of rows per
    request and a database round trip for each would be wasteful. Every write
    clears the cache, so a decision is visible immediately.
    """
    global _resolution_cache
    with _lock:
        if _resolution_cache is None:
            _resolution_cache = _read_resolutions()
        return _resolution_cache


def resolve(anomaly_key: str, action: str, note: str | None = None) -> dict:
    """Record a decision. Raises ValueError for an unknown action or empty note on 'fix'."""
    if action not in RESOLVE_ACTIONS:
        raise ValueError(f"action must be one of {', '.join(RESOLVE_ACTIONS)}")
    note = (note or "").strip()[:500] or None
    if action == "fix" and not note:
        raise ValueError("Describe the fix so the next person knows what changed")
    if not anomaly_key.strip():
        raise ValueError("anomaly id is required")
    global _resolution_cache, _flags_cache, _flags_key
    status = RESOLVE_ACTIONS[action]
    with _connect() as conn:
        existing = conn.one("SELECT anomaly_key FROM anomaly_resolution WHERE anomaly_key = ?",
                            (anomaly_key,))
        if existing:
            conn.execute("UPDATE anomaly_resolution SET status = ?, note = ?, resolved_at = ? "
                         "WHERE anomaly_key = ?", (status, note, _now(), anomaly_key))
        else:
            conn.execute("INSERT INTO anomaly_resolution (anomaly_key, status, note, resolved_at) "
                         "VALUES (?, ?, ?, ?)", (anomaly_key, status, note, _now()))
    with _lock:
        _resolution_cache, _flags_cache, _flags_key = None, None, None
    return {"key": anomaly_key, "status": status, "note": note}


def reopen(anomaly_key: str) -> dict:
    global _resolution_cache, _flags_cache, _flags_key
    with _connect() as conn:
        conn.execute("DELETE FROM anomaly_resolution WHERE anomaly_key = ?", (anomaly_key,))
    with _lock:
        _resolution_cache, _flags_cache, _flags_key = None, None, None
    return {"key": anomaly_key, "status": "open", "note": None}


# ------------------------------------------------------------------- data in

def _load_bundle():
    global _bundle
    if _bundle is None:
        _bundle = joblib.load(DATA_DIR / "anomaly_model.joblib")
    return _bundle


def _rate_frame() -> pd.DataFrame:
    """Every item rate as a flat frame: item, destination, tier, category, period, price."""
    global _frame, _frame_signature
    from app.services import inventory

    state = inventory.state()
    signature = (len(state["items"]), sum(len(v) for v in state["rates"].values()))
    with _lock:
        if _frame is not None and _frame_signature == signature:
            return _frame
    items = {i["id"]: i for i in state["items"]}
    rows = []
    for item_id, rates in state["rates"].items():
        item = items.get(item_id)
        if item is None:
            continue
        for rate in rates:
            rows.append({
                "item_id": item_id, "item_name": item["name"], "destination": item["destination"],
                "tier": item["tier"], "category": item.get("category"), "unit": item.get("unit"),
                "period": rate["period"], "price_usd": float(rate.get("net_price_usd") or 0),
                "currency": item.get("currency"),
            })
    frame = pd.DataFrame(rows)
    if frame.empty:
        frame = pd.DataFrame(columns=["item_id", "item_name", "destination", "tier", "category",
                                      "unit", "period", "price_usd", "currency"])
    frame = frame.sort_values(["item_id", "period"]).reset_index(drop=True)
    with _lock:
        _frame, _frame_signature = frame, signature
    return frame


def reset() -> None:
    """Drop the derived caches (tests, and after an import changes the store).

    Import flags are deliberately kept: they are findings about rows that are now
    part of the inventory, so a later scan must not make them disappear.
    """
    global _frame, _frame_signature, _flags_cache, _flags_key, _resolution_cache
    with _lock:
        _frame = None
        _frame_signature = None
        _flags_cache = None
        _flags_key = None
        _resolution_cache = None


def forget_imports() -> None:
    """Drop flags raised by earlier imports (used by tests and by inventory.reset)."""
    with _lock:
        _import_flags.clear()


def fx_factors() -> tuple[float, ...]:
    """The reference FX rates, so a price converted with one of them reads as a slip."""
    from app.services.seed import load_json
    try:
        table = load_json("inventory_meta.json").get("fx_per_usd", {})
    except Exception:
        return ()
    out = []
    for value in table.values():
        try:
            value = float(value)
        except (TypeError, ValueError):
            continue
        if value <= 0:
            continue
        out.extend((value, 1 / value))
    return tuple(out)


def _vocabulary() -> set[str]:
    """Destination, attraction and supplier names, for the text layer."""
    from app.services import inventory
    from app.services.seed import load_json

    entries: list[str] = []
    try:
        entries += [d.get("name", "") for d in load_json("destinations.json")]
        entries += [s.get("name", "") for s in load_json("spots.json")]
    except Exception:
        pass
    try:
        entries += [s.get("name", "") for s in inventory.state()["suppliers"]]
    except Exception:
        pass
    return rules.vocabulary_words(entries)


# ------------------------------------------------------------------ detection

def _findings_for_row(row: dict, currency: str) -> list[dict]:
    """All findings for one rate row, with the severity the feed will show."""
    found: list[dict] = []
    found += rules.missing_fields(row, ("price_usd", "item_id", "period"))
    found += rules.price_value(row.get("price_usd"), currency)

    peer_median = row.get("median")
    own_median = row.get("own_median")
    expected = peer_median if peer_median and peer_median > 0 else own_median

    found += rules.currency_slip(row.get("price_usd"), expected, fx_factors())
    found += rules.peer_ratio(row.get("price_usd"), expected)

    peer_z, own_z = row.get("peer_z"), row.get("own_z")
    peer_ratio, own_ratio = row.get("peer_ratio"), row.get("own_ratio")
    if peer_z is not None and pd.notna(peer_z) and abs(peer_z) >= stats.PEER_Z \
            and _material(peer_ratio):
        high = abs(peer_z) >= stats.PEER_Z_HIGH
        side = "above" if peer_z > 0 else "below"
        found.append(rules.finding(
            "peer_z_outlier", "high" if high else "medium",
            f"It sits {abs(float(peer_z)):.1f} robust deviations {side} the median of comparable "
            f"rates for this destination, tier and month.", layer="statistical"))
    if own_z is not None and pd.notna(own_z) and abs(own_z) >= stats.HISTORY_Z \
            and _material(own_ratio):
        high = abs(own_z) >= stats.HISTORY_Z_HIGH
        side = "above" if own_z > 0 else "below"
        found.append(rules.finding(
            "history_z_outlier", "high" if high else "medium",
            f"It is {abs(float(own_z)):.1f} robust deviations {side} this item's own usual price.",
            layer="statistical"))
    return found


def _material(ratio) -> bool:
    """True when a ratio is far enough from 1 for a z-score to be worth showing."""
    if ratio is None or not pd.notna(ratio):
        return False
    return float(ratio) >= Z_RATIO_HIGH or float(ratio) <= Z_RATIO_LOW


def _ml_signal(row: dict) -> dict | None:
    if not row.get("ml_flag"):
        return None
    ratio = row.get("peer_ratio")
    deviation = abs(float(ratio) - 1) if ratio is not None and pd.notna(ratio) else 0.0
    if deviation < ML_ALONE_RATIO - 1:
        return None
    return rules.finding("ml_outlier", "low",
                         "The Isolation Forest model also scores this rate as unusual for the "
                         "shape of its price history.", layer="ml")


def _explain(row: dict, findings: list[dict]) -> str:
    ordered = sorted(findings, key=lambda f: -rules.SEVERITY_RANK.get(f["severity"], 0))
    head = " ".join(f["detail"] for f in ordered[:2])
    expected = row.get("median") if row.get("median") and row.get("median") > 0 else row.get("own_median")
    context = ""
    if expected and expected > 0:
        context = (f"Comparable rates put the expected price near ${float(expected):,.2f} "
                   f"for {row.get('item_name')} in {row.get('period')}.")
    tail = "" if any(f["code"] in {"zero_price", "negative_price", "not_a_number"} for f in findings) \
        else " This is a signal to check the entry, not proof of a wrong rate."
    return " ".join(x for x in (head, context) if x) + tail


def detect_rates(frame: pd.DataFrame | None = None) -> list[dict]:
    """Every seeded/imported rate that any layer flags, with its findings attached."""
    frame = _rate_frame() if frame is None else frame
    if frame.empty:
        return []
    enriched = stats.enrich(frame, _load_bundle())
    out: list[dict] = []
    for row in enriched.to_dict("records"):
        findings = _findings_for_row(row, str(row.get("currency") or "USD"))
        ml = _ml_signal(row)
        if ml:
            findings.append(ml)
        if not findings:
            continue
        expected = row.get("median") if row.get("median") and row.get("median") > 0 else row.get("own_median")
        ratio = None
        if expected and expected > 0 and pd.notna(row.get("price_usd")):
            ratio = round(float(row["price_usd"]) / float(expected), 4)
        out.append({
            "key": f"rate:{row['item_id']}:{row['period']}",
            "kind": "rate",
            "severity": rules.severity_of(findings),
            "item_id": row["item_id"],
            "item_name": row.get("item_name"),
            "destination": row.get("destination"),
            "tier": row.get("tier"),
            "category": row.get("category"),
            "period": row.get("period"),
            "price_usd": None if pd.isna(row.get("price_usd")) else round(float(row["price_usd"]), 2),
            "expected_usd": None if expected is None or pd.isna(expected) else round(float(expected), 2),
            "ratio": ratio,
            "layers": sorted({f["layer"] for f in findings}),
            "codes": [f["code"] for f in findings],
            "explanation": _explain(row, findings),
            "findings": findings,
        })
    return out


def text_anomalies() -> list[dict]:
    """Typos, split words and duplicate suppliers in the live catalogue."""
    from app.services import inventory
    from app.services.seed import load_json

    vocab = _vocabulary()
    out: list[dict] = []
    try:
        for supplier in inventory.state()["suppliers"]:
            findings = rules.text_typo(supplier.get("name"), vocab)
            findings += rules.split_word(supplier.get("name"), vocab)
            if findings:
                out.append({
                    "key": f"text:supplier:{supplier['id']}",
                    "kind": "text", "severity": rules.severity_of(findings),
                    "item_id": None, "item_name": supplier.get("name"),
                    "destination": supplier.get("destination"), "period": None,
                    "price_usd": None, "expected_usd": None, "ratio": None,
                    "layers": ["text"], "codes": [f["code"] for f in findings],
                    "explanation": " ".join(f["detail"] for f in findings), "findings": findings,
                })
    except Exception:
        pass
    try:
        for spot in load_json("spots.json"):
            findings = rules.text_typo(spot.get("name"), vocab)
            findings += rules.split_word(spot.get("name"), vocab)
            if findings:
                out.append({
                    "key": f"text:spot:{spot['id']}",
                    "kind": "text", "severity": rules.severity_of(findings),
                    "item_id": None, "item_name": spot.get("name"),
                    "destination": spot.get("destination"), "period": None,
                    "price_usd": None, "expected_usd": None, "ratio": None,
                    "layers": ["text"], "codes": [f["code"] for f in findings],
                    "explanation": " ".join(f["detail"] for f in findings), "findings": findings,
                })
    except Exception:
        pass
    return out


def supplier_duplicates() -> list[dict]:
    """Near-duplicate supplier records, each pair reported once."""
    from app.services import inventory

    try:
        suppliers = inventory.state()["suppliers"]
    except Exception:
        return []
    out = []
    for id_a, id_b, name_a, name_b, item in rules.duplicate_suppliers(
            [{"id": s["id"], "name": s.get("name"), "destination": s.get("destination")}
             for s in suppliers]):
        out.append({
            # Stable across processes and restarts, so a resolution sticks to its pair.
            "key": f"supplier:{id_a}:{id_b}", "kind": "supplier",
            "severity": rules.severity_of([item]),
            "item_id": None, "item_name": name_a, "supplier_id": id_a, "compare_to": id_b,
            "destination": None, "period": None, "price_usd": None, "expected_usd": None,
            "ratio": None, "layers": ["text"], "codes": [item["code"]],
            "explanation": item["detail"], "findings": [item],
        })
    return out


def anomalies(include_resolved: bool = True) -> list[dict]:
    """Every anomaly currently detectable, with its resolution state attached."""
    found = detect_rates() + text_anomalies() + supplier_duplicates()
    for item_id, flags in _import_flags.items():
        for entry in flags:
            found.append(entry)
    resolved = resolutions()
    for entry in found:
        record = resolved.get(entry["key"])
        entry["resolved"] = bool(record and record["status"] != "open")
        entry["resolution"] = record if record else None
    found.sort(key=lambda e: (-rules.SEVERITY_RANK.get(e["severity"], 0),
                              e["kind"], str(e.get("destination") or ""), str(e.get("item_name") or "")))
    return found


def feed(severity: str | None = None, kind: str | None = None, destination: str | None = None,
         status: str = "open", q: str | None = None, page: int = 1, page_size: int = 25) -> dict:
    """The `/api/anomalies` payload: severity-sorted, filterable, paginated."""
    severity = (severity or "").strip().lower() or None
    kind = (kind or "").strip().lower() or None
    status = (status or "open").strip().lower()
    if severity and severity not in rules.SEVERITY_RANK:
        raise ValueError(f"severity must be one of {', '.join(rules.SEVERITY_RANK)}")
    if kind and kind not in {"rate", "text", "supplier"}:
        raise ValueError("kind must be one of rate, text, supplier")
    if status not in {"open", "resolved", "all"}:
        raise ValueError("status must be one of open, resolved, all")
    if not 1 <= page_size <= 100:
        raise ValueError("page_size must be between 1 and 100")
    if page < 1:
        raise ValueError("page must be 1 or greater")

    everything = anomalies()
    rows = everything
    if severity:
        rows = [e for e in rows if e["severity"] == severity]
    if kind:
        rows = [e for e in rows if e["kind"] == kind]
    if destination:
        rows = [e for e in rows if e.get("destination") == destination]
    if status == "open":
        rows = [e for e in rows if not e["resolved"]]
    elif status == "resolved":
        rows = [e for e in rows if e["resolved"]]
    if q and q.strip():
        needle = q.strip().lower()
        rows = [e for e in rows if needle in " ".join(
            str(e.get(k) or "") for k in ("item_name", "item_id", "period", "explanation", "destination")
        ).lower()]

    total = len(rows)
    start = (page - 1) * page_size
    counts = {sev: 0 for sev in rules.SEVERITY_RANK}
    by_kind: dict[str, int] = {}
    for entry in everything:
        if entry["resolved"]:
            continue
        counts[entry["severity"]] = counts.get(entry["severity"], 0) + 1
        by_kind[entry["kind"]] = by_kind.get(entry["kind"], 0) + 1
    return {
        "count": total,
        "open_count": sum(counts.values()),
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "severities": counts,
        "by_kind": by_kind,
        "items": rows[start:start + page_size],
        "is_sample": True,
    }


def summary() -> dict:
    """Bell count and the numbers the inventory and package flag use."""
    everything = anomalies()
    open_items = [e for e in everything if not e["resolved"]]
    return {
        "open": len(open_items),
        "resolved": len(everything) - len(open_items),
        "high": sum(1 for e in open_items if e["severity"] == "high"),
        "medium": sum(1 for e in open_items if e["severity"] == "medium"),
        "low": sum(1 for e in open_items if e["severity"] == "low"),
        "by_kind": {k: sum(1 for e in open_items if e["kind"] == k) for k in ("rate", "text", "supplier")},
        "is_sample": True,
    }


def _state_key():
    """Changes whenever anything the flags depend on changes."""
    from app.services import inventory
    try:
        state = inventory.state()
        sizes = (len(state["items"]), sum(len(v) for v in state["rates"].values()))
    except Exception:
        sizes = (0, 0)
    resolved = resolutions()
    return (sizes, len(_import_flags),
            tuple(sorted((k, v["status"]) for k, v in resolved.items())))


def flags_by_item() -> dict[str, dict]:
    """item_id -> {count, severity, codes} for open anomalies.

    Cached: an inventory page asks for this once per row, and recomputing the whole
    feed each time would turn one page load into thirty full detections.
    """
    global _flags_cache, _flags_key
    key = _state_key()
    with _lock:
        if _flags_cache is not None and _flags_key == key:
            return _flags_cache
    out: dict[str, dict] = {}
    for entry in anomalies():
        if entry["resolved"] or not entry.get("item_id"):
            continue
        current = out.get(entry["item_id"])
        worse = current is None or rules.SEVERITY_RANK.get(entry["severity"], 0) > \
            rules.SEVERITY_RANK.get(current["severity"], 0)
        codes = sorted(set((current or {}).get("codes", [])) | set(entry["codes"]))
        out[entry["item_id"]] = {
            "count": (current["count"] if current else 0) + 1,
            "severity": entry["severity"] if worse else current["severity"],
            "codes": codes,
            "item_name": entry.get("item_name"),
        }
    with _lock:
        _flags_cache, _flags_key = out, key
    return out


def item_flag(item_id: str) -> dict | None:
    """The flag an inventory row or package line shows, or None when nothing is open."""
    try:
        return flags_by_item().get(item_id)
    except Exception:
        return None


def flags_for_lines(lines) -> list[dict]:
    """Anomaly flags for the package-quote lines (`checks.anomaly_flags`)."""
    flags = flags_by_item()
    out = []
    for line in lines:
        flag = flags.get(line.get("item_id"))
        if not flag:
            continue
        out.append({"item_id": line["item_id"], "name": line.get("name"), "date": line.get("date"),
                    "severity": flag["severity"], "count": flag["count"], "codes": flag["codes"],
                    "detail": f"{flag['count']} open anomaly flag(s) on this rate: "
                              f"{', '.join(flag['codes'])}."})
    return out


# ---------------------------------------------------------------------- scans

def scan() -> dict:
    """Re-run every layer. Used by the API and automatically after a CSV import."""
    reset()
    _bundle_and_frame_warm()
    everything = anomalies()
    return {
        "scanned_at": _now(),
        "findings": len(everything),
        "open": sum(1 for e in everything if not e["resolved"]),
        "by_severity": {sev: sum(1 for e in everything if e["severity"] == sev)
                        for sev in rules.SEVERITY_RANK},
        "rates_checked": int(len(_rate_frame())),
        "is_sample": True,
    }


def _bundle_and_frame_warm() -> None:
    """Touch the model and the rate frame so a scan reports real columns, and a
    broken data file fails here rather than inside a page render."""
    _load_bundle()
    _rate_frame()


def flag_imported(items: list[dict], rates: dict[str, list[dict]]) -> list[dict]:
    """Run the rules over freshly imported rows and remember their flags.

    Import rows carry one rate for the current month, so there is no history and
    often too few peers: the field rules (zero/negative, currency slip against the
    FX table, 10x/100x against existing peers) are what catch a bad import.
    """
    flags = fx_factors()
    out = []
    for item in items:
        rows = rates.get(item["id"]) or []
        price = item.get("base_net_price_usd")
        findings: list[dict] = []
        findings += rules.price_value(price, item.get("currency") or "USD")
        from app.services import inventory
        catalogue = inventory.state()["items"]
        peers = [i["base_net_price_usd"] for i in catalogue
                 if i["destination"] == item["destination"] and i["type"] == item["type"]
                 and i["category"] == item.get("category") and i["id"] != item["id"]]
        if len(peers) < stats.MIN_PEERS:
            # An imported row rarely shares a category with the seed, so widen to
            # every item of the same type in the destination before giving up.
            peers = [i["base_net_price_usd"] for i in catalogue
                     if i["destination"] == item["destination"] and i["type"] == item["type"]
                     and i["id"] != item["id"]]
        peer_median = float(pd.Series(peers).median()) if len(peers) >= stats.MIN_PEERS else None
        findings += rules.currency_slip(price, peer_median, flags)
        findings += rules.peer_ratio(price, peer_median)
        vocabulary = _vocabulary()
        findings += rules.text_typo(item.get("name"), vocabulary)
        findings += rules.split_word(item.get("name"), vocabulary)
        if not findings:
            continue
        entry = {
            "key": f"rate:{item['id']}:{(rows[0]['period'] if rows else '')}",
            "kind": "rate",
            "severity": rules.severity_of(findings),
            "item_id": item["id"],
            "item_name": item.get("name"),
            "destination": item.get("destination"),
            "tier": item.get("tier"),
            "category": item.get("category"),
            "period": rows[0]["period"] if rows else None,
            "price_usd": None if price is None else round(float(price), 2),
            "expected_usd": None if peer_median is None else round(peer_median, 2),
            "ratio": (round(float(price) / peer_median, 4) if price and peer_median else None),
            "layers": sorted({f["layer"] for f in findings}),
            "codes": [f["code"] for f in findings],
            "explanation": " ".join(f["detail"] for f in findings),
            "findings": findings,
        }
        _import_flags[item["id"]] = [entry]
        out.append(entry)
    return out
