"""Inventory store: loads the committed seed into memory and answers queries.

The seed is read once into process memory (from the Aiven database when DATABASE_URL is set,
otherwise from the committed JSON). Rows added through the CSV import are written to the
database first, so they survive restarts; without a database they are held in memory only.
"""
import csv
import io
import math
import threading
from collections import defaultdict
from datetime import date

from app import db
from app.services import db_seed
from app.services.seed import load_json

ITEM_TYPES = ("stay", "guide", "experience", "transport")
TIERS = ("budget", "mid", "luxury")
MAX_PAGE_SIZE = 100
MAX_IMPORT_BYTES = 1_000_000
MAX_IMPORT_ROWS = 5_000
COLUMN_LIMITS = {"supplier": 200, "category": 60, "unit": 30}  # = VARCHAR sizes in scripts/schema.sql

REQUIRED_COLUMNS = ("name", "destination", "type", "tier", "currency", "net_price", "lat", "lon")
OPTIONAL_COLUMNS = ("supplier", "category", "unit", "capacity")
SORTS = ("name", "price_asc", "price_desc")


class InventoryError(ValueError):
    """Raised for a request the caller can fix (maps to HTTP 4xx)."""


_lock = threading.RLock()
_state: dict = {}


def _load() -> dict:
    items = load_json("inventory_items.json")
    suppliers = load_json("inventory_suppliers.json")
    meta = load_json("inventory_meta.json")
    raw = load_json("inventory_rates.json")
    cols = raw["columns"]
    rates: dict[str, list[dict]] = defaultdict(list)
    for row in raw["rows"]:
        r = dict(zip(cols, row))
        rates[r["item_id"]].append(
            {"period": r["period"], "date": r["date"], "net_price": r["net_price"],
             "net_price_usd": r["net_price_usd"]}
        )
    return {
        "items": [dict(i) for i in items],
        "suppliers": [dict(s) for s in suppliers],
        "rates": dict(rates),
        "meta": meta,
        "destinations": {d["slug"] for d in load_json("destinations.json")},
    }


def state() -> dict:
    with _lock:
        if not _state:
            _state.update(_load())
        return _state


def reset() -> None:
    """Drop imported rows and reload the seed (used by tests)."""
    with _lock:
        _state.clear()
    try:
        from app.services import anomalies
        anomalies.reset()
        anomalies.forget_imports()
    except Exception:
        pass


def meta() -> dict:
    s = state()
    by_dest: dict[str, int] = defaultdict(int)
    for i in s["items"]:
        by_dest[i["destination"]] += 1
    return {
        "types": list(ITEM_TYPES), "tiers": list(TIERS), "sorts": list(SORTS),
        "price_bands": s["meta"]["price_bands"],
        "destinations": [{"slug": k, "items": v} for k, v in sorted(by_dest.items())],
        "max_page_size": MAX_PAGE_SIZE,
        "row_counts": {"items": len(s["items"]), "suppliers": len(s["suppliers"]),
                       "rates": sum(len(v) for v in s["rates"].values())},
        "is_sample": True,
    }


def _band_bounds(band: str) -> tuple[float, float | None]:
    for b in state()["meta"]["price_bands"]:
        if b["id"] == band:
            return b["min_usd"], b["max_usd"]
    raise InventoryError(f"Unknown price_band '{band}'")


def _check_choice(name: str, value: str | None, allowed) -> None:
    if value is not None and value not in allowed:
        raise InventoryError(f"Unknown {name} '{value}'. Allowed: {', '.join(allowed)}")


def _paginate(rows: list, page: int, page_size: int) -> dict:
    if page < 1:
        raise InventoryError("page must be 1 or greater")
    if not 1 <= page_size <= MAX_PAGE_SIZE:
        raise InventoryError(f"page_size must be between 1 and {MAX_PAGE_SIZE}")
    total = len(rows)
    start = (page - 1) * page_size
    return {"count": total, "page": page, "page_size": page_size,
            "pages": max(1, math.ceil(total / page_size)), "items": rows[start:start + page_size]}


def _match_text(haystack: str, q: str) -> bool:
    return all(tok in haystack for tok in q.lower().split())


def _filtered(destination, type, tier, price_band, q) -> list[dict]:
    """Shared by the list and map endpoints so both always agree on what matches."""
    s = state()
    if destination is not None and destination not in s["destinations"]:
        raise InventoryError(f"Unknown destination '{destination}'")
    _check_choice("type", type, ITEM_TYPES)
    _check_choice("tier", tier, TIERS)
    lo, hi = _band_bounds(price_band) if price_band else (None, None)
    sup = {x["id"]: x for x in s["suppliers"]}

    out = []
    for i in s["items"]:
        if destination and i["destination"] != destination:
            continue
        if type and i["type"] != type:
            continue
        if tier and i["tier"] != tier:
            continue
        if price_band:
            p = i["base_net_price_usd"]
            if p < lo or (hi is not None and p >= hi):
                continue
        if q and q.strip():
            sp = sup.get(i["supplier_id"], {})
            hay = " ".join(str(x or "") for x in (i["name"], i["category"], sp.get("name"), sp.get("locality"))).lower()
            if not _match_text(hay, q):
                continue
        out.append(i)
    return out


def search_items(destination=None, type=None, tier=None, price_band=None, q=None,
                 sort="name", page=1, page_size=25) -> dict:
    _check_choice("sort", sort, SORTS)
    out = _filtered(destination, type, tier, price_band, q)
    sup = {x["id"]: x for x in state()["suppliers"]}
    if sort == "price_asc":
        out.sort(key=lambda i: (i["base_net_price_usd"], i["name"]))
    elif sort == "price_desc":
        out.sort(key=lambda i: (-i["base_net_price_usd"], i["name"]))
    else:
        out.sort(key=lambda i: (i["name"].lower(), i["id"]))
    page_data = _paginate(out, page, page_size)
    page_data["items"] = [_public_item(i, sup, detail=False) for i in page_data["items"]]
    page_data["is_sample"] = True
    return page_data


MAX_POINTS = 2_000


def map_points(destination=None, type=None, tier=None, price_band=None, q=None) -> dict:
    """Every match as a minimal marker (no pagination), for the map view."""
    out = _filtered(destination, type, tier, price_band, q)
    pts = [{"id": i["id"], "name": i["name"], "type": i["type"], "tier": i["tier"],
            "destination": i["destination"], "lat": i["lat"], "lon": i["lon"]}
           for i in out if i["lat"] is not None and i["lon"] is not None][:MAX_POINTS]
    return {"count": len(pts), "points": pts, "is_sample": True}


def _public_item(i: dict, sup: dict, detail: bool = True) -> dict:
    sp = sup.get(i["supplier_id"], {})
    summary = _responsible_summary(i["supplier_id"])
    return {**i, "supplier_name": sp.get("name"),
            # null means "nothing to report", not "verified clean".
            "margin": None, "anomaly_flag": _anomaly_flag(i["id"]),
            # Verified-only badge, same logic as the responsible page and package quotes.
            "responsible_badge": summary["badge"] if summary else None,
            # Detail-only: score and labelled self-reported lines. Never used for a badge.
            **({"responsible_detail": summary} if detail else {})}


def _responsible_summary(supplier_id):
    try:
        from app.services import responsible
        return responsible.supplier_summary(supplier_id)
    except Exception:
        return None


def _anomaly_flag(item_id: str):
    """Open anomaly flags for one item (feature #9). The import is local so the
    anomaly service stays free to read the inventory store itself."""
    try:
        from app.services import anomalies
        return anomalies.item_flag(item_id)
    except Exception:
        return None


def get_item(item_id: str) -> dict | None:
    s = state()
    sup = {x["id"]: x for x in s["suppliers"]}
    for i in s["items"]:
        if i["id"] == item_id:
            return _public_item(i, sup)
    return None


def get_rates(item_id: str) -> dict | None:
    s = state()
    item = next((i for i in s["items"] if i["id"] == item_id), None)
    if item is None:
        return None
    rows = sorted(s["rates"].get(item_id, []), key=lambda r: r["period"])
    return {"item_id": item_id, "currency": item["currency"], "unit": item["unit"],
            "count": len(rows), "rates": rows, "is_sample": True}


def search_suppliers(destination=None, tier=None, q=None, page=1, page_size=25) -> dict:
    s = state()
    if destination is not None and destination not in s["destinations"]:
        raise InventoryError(f"Unknown destination '{destination}'")
    _check_choice("tier", tier, TIERS)
    counts: dict[str, int] = defaultdict(int)
    for i in s["items"]:
        counts[i["supplier_id"]] += 1
    out = []
    for sp in s["suppliers"]:
        if destination and sp["destination"] != destination:
            continue
        if tier and sp["tier"] != tier:
            continue
        if q and q.strip() and not _match_text(f"{sp['name']} {sp['locality'] or ''} {sp['kind']}".lower(), q):
            continue
        out.append({**sp, "item_count": counts.get(sp["id"], 0)})
    out.sort(key=lambda x: (x["name"].lower(), x["id"]))
    page_data = _paginate(out, page, page_size)
    page_data["is_sample"] = True
    return page_data


# ---------------------------------------------------------------- CSV import


def _to_float(raw: str, field: str, lo: float, hi: float) -> float:
    try:
        v = float(raw.replace(",", "") if raw else "")
    except ValueError:
        raise ValueError(f"{field} must be a number, got '{raw}'") from None
    if math.isnan(v) or math.isinf(v):
        raise ValueError(f"{field} must be a finite number")
    if not lo <= v <= hi:
        raise ValueError(f"{field} {v:g} is outside {lo:g} to {hi:g}")
    return v


def _validate_row(row: dict, fx: dict, destinations: set) -> dict:
    """Return a clean item dict or raise ValueError (single message per row)."""
    problems = [f"{c} is required" for c in REQUIRED_COLUMNS if not (row.get(c) or "").strip()]
    if problems:
        raise ValueError("; ".join(problems))
    dest = row["destination"].strip()
    if dest not in destinations:
        raise ValueError(f"unknown destination '{dest}'")
    typ, tier = row["type"].strip().lower(), row["tier"].strip().lower()
    if typ not in ITEM_TYPES:
        raise ValueError(f"type '{typ}' must be one of {', '.join(ITEM_TYPES)}")
    if tier not in TIERS:
        raise ValueError(f"tier '{tier}' must be one of {', '.join(TIERS)}")
    cur = row["currency"].strip().upper()
    if cur not in fx:
        raise ValueError(f"unsupported currency '{cur}'")
    # Zero/negative/absurd prices are rejected here as plain format errors; the
    # statistical "extra zero" checks belong to the anomaly detector (#9).
    price = _to_float(row["net_price"].strip(), "net_price", 0.01, 1e9)
    lat = _to_float(row["lat"].strip(), "lat", -90, 90)
    lon = _to_float(row["lon"].strip(), "lon", -180, 180)
    cap_raw = (row.get("capacity") or "").strip()
    capacity = int(_to_float(cap_raw, "capacity", 1, 10_000)) if cap_raw else 1
    name = row["name"].strip()
    if len(name) > 200:
        raise ValueError("name is longer than 200 characters")
    out = {
        "destination": dest, "name": name, "type": typ, "tier": tier, "currency": cur,
        "base_net_price": price, "base_net_price_usd": round(price / fx[cur], 2),
        "lat": lat, "lon": lon, "capacity": capacity,
        "category": (row.get("category") or "").strip() or typ,
        "unit": (row.get("unit") or "").strip() or None,
        "supplier": (row.get("supplier") or "").strip() or name,
    }
    for field, limit in COLUMN_LIMITS.items():  # the database columns are VARCHAR(n)
        if len(out[field] or "") > limit:
            raise ValueError(f"{field} is longer than {limit} characters")
    return out


def import_csv(raw: bytes, dry_run: bool = False) -> dict:
    """Validate a CSV and add the valid rows. Never raises for bad rows, only for
    an unusable file (too big, not UTF-8, missing columns)."""
    if len(raw) > MAX_IMPORT_BYTES:
        raise InventoryError(f"File is larger than {MAX_IMPORT_BYTES // 1000} KB")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise InventoryError("File must be UTF-8 encoded") from None
    reader = csv.DictReader(io.StringIO(text))
    headers = [h.strip().lower() for h in (reader.fieldnames or [])]
    if not headers:
        raise InventoryError("CSV is empty")
    missing = [c for c in REQUIRED_COLUMNS if c not in headers]
    if missing:
        raise InventoryError(f"Missing required column(s): {', '.join(missing)}")
    reader.fieldnames = headers

    s = state()
    errors, clean, seen = [], [], set()
    for n, row in enumerate(reader, start=2):  # row 1 is the header
        if n - 1 > MAX_IMPORT_ROWS:
            raise InventoryError(f"File has more than {MAX_IMPORT_ROWS} rows")
        if None in row:  # more cells than headers
            errors.append({"row": n, "message": "row has more values than the header has columns"})
            continue
        if not any((v or "").strip() for v in row.values()):
            continue  # blank line
        try:
            item = _validate_row(row, s["meta"]["fx_per_usd"], s["destinations"])
        except ValueError as e:
            errors.append({"row": n, "message": str(e)})
            continue
        key = (item["destination"], item["name"].lower(), item["type"])
        if key in seen:
            errors.append({"row": n, "message": f"duplicate of an earlier row ('{item['name']}')"})
            continue
        seen.add(key)
        clean.append(item)

    imported, flags = [], []
    if clean and not dry_run:
        with _lock:
            imported = _commit(clean)
        flags = _scan_import(imported)
    return {"dry_run": dry_run, "rows_read": len(clean) + len(errors),
            "valid": len(clean), "imported": len(imported), "rejected": len(errors),
            "errors": errors, "item_ids": [i["id"] for i in imported],
            # A bad CSV raises flags on the spot, so the importer sees them in the result.
            "anomaly_flags": [{"item_id": f["item_id"], "name": f["item_name"],
                               "severity": f["severity"], "codes": f["codes"]} for f in flags]}


def _scan_import(imported: list[dict]) -> list[dict]:
    """Run the anomaly detector over rows just imported (feature #9).

    A failure here must never lose the import: the rows are already committed, so
    the scan is best-effort and its outcome is reported separately.
    """
    if not imported:
        return []
    try:
        from app.services import anomalies
        anomalies.reset()
        return anomalies.flag_imported(imported, {i["id"]: state()["rates"].get(i["id"], [])
                                                  for i in imported})
    except Exception:
        import logging
        logging.exception("Anomaly scan after import failed; the imported rows were kept")
        return []


def _commit(clean: list[dict]) -> list[dict]:
    s = state()
    n_item = sum(1 for i in s["items"] if i["id"].startswith("imp_"))
    n_sup = sum(1 for x in s["suppliers"] if x["id"].startswith("imp_sup_"))
    sup_by_name = {(x["destination"], x["name"].lower()): x for x in s["suppliers"]}
    today = date.today()
    period, first = today.strftime("%Y-%m"), today.replace(day=1).isoformat()
    added, new_sups, new_rates = [], [], {}
    for c in clean:
        sp = sup_by_name.get((c["destination"], c["supplier"].lower()))
        if sp is None:
            n_sup += 1
            sp = {"id": f"imp_sup_{n_sup:04d}", "destination": c["destination"], "name": c["supplier"],
                  "kind": c["type"], "tier": c["tier"], "lat": c["lat"], "lon": c["lon"],
                  "currency": c["currency"], "locality": None, "ownership": None, "chain_brand": None,
                  "overture_id": None, "data_origin": "imported"}
            new_sups.append(sp)
            sup_by_name[(c["destination"], c["supplier"].lower())] = sp
        n_item += 1
        item = {
            "id": f"imp_{n_item:04d}", "supplier_id": sp["id"], "destination": c["destination"],
            "name": c["name"], "category": c["category"], "type": c["type"], "tier": c["tier"],
            "lat": c["lat"], "lon": c["lon"], "currency": c["currency"],
            "base_net_price": c["base_net_price"], "base_net_price_usd": c["base_net_price_usd"],
            "capacity": c["capacity"], "unit": c["unit"], "markup_pct": None,
            "responsible": {"ownership": None, "chain_brand": None, "locality": None},
            "data_origin": "imported",
        }
        new_rates[item["id"]] = [{"period": period, "date": first, "net_price": c["base_net_price"],
                                  "net_price_usd": c["base_net_price_usd"]}]
        added.append(item)
    if db.enabled():  # database first: if this fails nothing in memory has changed and the import errors out
        db_seed.save_imported(new_sups, added, new_rates)
    s["suppliers"].extend(new_sups)
    s["items"].extend(added)
    s["rates"].update(new_rates)
    return added
