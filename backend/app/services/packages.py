"""Saved-package store.

With DATABASE_URL set, packages live in the Aiven PostgreSQL tables `package`,
`package_day` and `package_line`, so they survive restarts and redeploys. Without
it they go to a local SQLite file (PACKAGES_DB, default: the OS temp dir, lost on
restart on Render's free plan), which is fine for local development and tests.

Optimistic concurrency: every package carries a `revision` that increments on
each save. A save that references an older revision is rejected with a 409 by the
route, so two agents editing the same package cannot silently overwrite each other.
"""
import json
import secrets
import tempfile
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path

from app import db
from app.services.quote import PackageQuoteError, quote_package

# Keep in sync with the same tables in scripts/schema.sql.
_SCHEMA = """
CREATE TABLE IF NOT EXISTS package (
    package_id VARCHAR(40) PRIMARY KEY,
    title VARCHAR(200),
    destination_slug VARCHAR(64),
    start_date DATE,
    end_date DATE,
    travellers INTEGER,
    revision INTEGER NOT NULL DEFAULT 1,
    payload TEXT,
    quote TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""
_DAYS_SCHEMA = """
CREATE TABLE IF NOT EXISTS package_day (
    package_id VARCHAR(40),
    day_no INTEGER,
    stops_json TEXT,
    PRIMARY KEY (package_id, day_no)
)
"""
_LINES_SCHEMA = """
CREATE TABLE IF NOT EXISTS package_line (
    package_id VARCHAR(40),
    line_no INTEGER,
    day_no INTEGER,
    item_id VARCHAR(16),
    name VARCHAR(220),
    line_type VARCHAR(20),
    section VARCHAR(40),
    service_date DATE,
    unit VARCHAR(30),
    quantity DOUBLE PRECISION,
    unit_net_usd DOUBLE PRECISION,
    net_usd DOUBLE PRECISION,
    sell_usd DOUBLE PRECISION,
    PRIMARY KEY (package_id, line_no)
)
"""
_ALL_SCHEMAS = (_SCHEMA, _DAYS_SCHEMA, _LINES_SCHEMA)

_ready: set[str] = set()

MAX_TITLE = 200


class PackageStoreError(ValueError):
    """Invalid package payload; suitable for an HTTP 400 response."""


class PackageNotFound(Exception):
    """Unknown package id; suitable for an HTTP 404 response."""


class PackageRevisionConflict(Exception):
    """The caller's revision is older than the stored one; suitable for HTTP 409."""

    def __init__(self, package_id: str, stored_revision: int):
        super().__init__(f"Package was modified by someone else (now at revision {stored_revision})")
        self.package_id = package_id
        self.stored_revision = stored_revision


def _path() -> str:
    # Read through the module so tests can monkeypatch the URL.
    return db.db_settings.packages_db or str(Path(tempfile.gettempdir()) / "wayfare_packages.sqlite3")


@contextmanager
def _connect():
    target = db.url() if db.enabled() else "sqlite:///" + _path()
    with db.connect(target) as conn:
        if db.kind(target) == "sqlite" or target not in _ready:  # Postgres: create the tables once per process
            for schema in _ALL_SCHEMAS:
                conn.execute(schema)
            _ready.add(target)
        yield conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return "PKG-" + secrets.token_hex(5).upper()


def _clean_title(payload: dict) -> str:
    title = str(payload.get("title") or "").strip()
    if len(title) > MAX_TITLE:
        raise PackageStoreError(f"Title must be at most {MAX_TITLE} characters")
    return title or "Untitled journey"


def _clean(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise PackageStoreError("Package must be an object")
    destination = str(payload.get("destination") or "").strip()
    if not destination:
        raise PackageStoreError("destination is required")
    start = str(payload.get("start_date") or "").strip()
    try:
        start_date = date.fromisoformat(start)
    except ValueError:
        raise PackageStoreError("start_date must use YYYY-MM-DD") from None
    try:
        nights, travellers = int(payload.get("nights", 0)), int(payload.get("travellers", 0))
    except (TypeError, ValueError):
        raise PackageStoreError("nights and travellers must be whole numbers") from None
    stays = payload.get("stays") or []
    days = payload.get("days") or []
    transfers = payload.get("transfers") or {}
    if not isinstance(stays, list) or not isinstance(days, list) or not isinstance(transfers, dict):
        raise PackageStoreError("stays and days must be lists and transfers an object")
    return {
        "title": _clean_title(payload),
        "destination": destination,
        "start_date": start,
        "nights": nights,
        "travellers": travellers,
        "stays": stays,
        "days": days,
        "transfers": transfers,
        "end_date": date.fromordinal(start_date.toordinal() + nights).isoformat(),
    }


def save(payload: dict, package_id: str | None = None, expected_revision: int | None = None) -> dict:
    """Validate, price and persist a package. Returns the stored record."""
    clean = _clean(payload)
    quote = quote_package(clean)
    pid = package_id or new_id()
    now = _now()
    with _connect() as conn:
        if package_id:
            row = conn.one("SELECT revision FROM package WHERE package_id = ?", (package_id,))
            if row is None:
                raise PackageNotFound(f"Package '{package_id}' not found")
            stored_revision = int(row["revision"])
            if expected_revision is not None and expected_revision != stored_revision:
                raise PackageRevisionConflict(package_id, stored_revision)
            revision = stored_revision + 1
            conn.execute(
                "UPDATE package SET title = ?, destination_slug = ?, start_date = ?, end_date = ?, travellers = ?, "
                "revision = ?, payload = ?, quote = ?, updated_at = ? WHERE package_id = ?",
                (clean["title"], clean["destination"], clean["start_date"], clean["end_date"], clean["travellers"],
                 revision, json.dumps(clean), json.dumps(quote), now, package_id),
            )
            conn.execute("DELETE FROM package_day WHERE package_id = ?", (package_id,))
            conn.execute("DELETE FROM package_line WHERE package_id = ?", (package_id,))
        else:
            revision = 1
            conn.execute(
                "INSERT INTO package (package_id, title, destination_slug, start_date, end_date, travellers, "
                "revision, payload, quote, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (pid, clean["title"], clean["destination"], clean["start_date"], clean["end_date"], clean["travellers"],
                 revision, json.dumps(clean), json.dumps(quote), now, now),
            )
        for day in clean["days"]:
            day_no = day.get("day")
            conn.execute("INSERT INTO package_day (package_id, day_no, stops_json) VALUES (?, ?, ?)",
                         (pid, day_no, json.dumps(day.get("stops") or [])))
        for line_no, line in enumerate(quote["line_items"], start=1):
            conn.execute(
                "INSERT INTO package_line (package_id, line_no, day_no, item_id, name, line_type, section, "
                "service_date, unit, quantity, unit_net_usd, net_usd, sell_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (pid, line_no, int(str(line["section"]).split(":")[0].replace("day_", "")) if str(line["section"]).startswith("day_") else None,
                 line["item_id"], line["name"], line["type"], line["section"], line["date"], line["unit"],
                 line["quantity"], line["unit_net_usd"], line["net_usd"], line["sell_usd"]),
            )
    return {"package_id": pid, "revision": revision, **clean, "quote": quote, "created_at": now, "updated_at": now}


def list_packages(destination: str | None = None, q: str | None = None) -> dict:
    """Saved packages, newest first. Quote totals are included; payloads are not."""
    with _connect() as conn:
        rows = conn.all("SELECT package_id, title, destination_slug, start_date, end_date, travellers, revision, quote, created_at, updated_at FROM package ORDER BY updated_at DESC")
    items = []
    for row in rows:
        if destination and row["destination_slug"] != destination:
            continue
        if q and q.lower() not in f"{row['title']} {row['destination_slug']}".lower():
            continue
        quote = json.loads(row.pop("quote") or "null") or {}
        totals = quote.get("totals", {})
        items.append({
            **row,
            "sell_usd": totals.get("sell_usd"),
            "margin_pct": totals.get("margin_pct"),
            "is_sample": True,
        })
    return {"count": len(items), "items": items, "is_sample": True}


def get(package_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.one("SELECT * FROM package WHERE package_id = ?", (package_id,))
    if row is None:
        return None
    row["payload"] = json.loads(row.pop("payload") or "null")
    row["quote"] = json.loads(row.pop("quote") or "null")
    with _connect() as conn:
        days = conn.all("SELECT day_no, stops_json FROM package_day WHERE package_id = ? ORDER BY day_no", (package_id,))
        lines = conn.all("SELECT * FROM package_line WHERE package_id = ? ORDER BY line_no", (package_id,))
    day_map = {d["day_no"]: json.loads(d["stops_json"] or "[]") for d in days}
    if row["payload"]:
        row["payload"]["days"] = [{"day": day_no, "stops": stops} for day_no, stops in sorted(day_map.items())]
    row["is_sample"] = True
    row["stored_lines"] = [
        {k: line[k] for k in ("line_no", "day_no", "item_id", "name", "line_type", "section", "service_date", "unit", "quantity", "net_usd", "sell_usd")}
        for line in lines
    ]
    return row


def delete(package_id: str) -> bool:
    with _connect() as conn:
        row = conn.one("SELECT package_id FROM package WHERE package_id = ?", (package_id,))
        if row is None:
            return False
        conn.execute("DELETE FROM package WHERE package_id = ?", (package_id,))
        conn.execute("DELETE FROM package_day WHERE package_id = ?", (package_id,))
        conn.execute("DELETE FROM package_line WHERE package_id = ?", (package_id,))
    return True


__all__ = [
    "PackageStoreError", "PackageNotFound", "PackageRevisionConflict", "save", "list_packages",
    "get", "delete", "new_id", "quote_package", "PackageQuoteError",
]
