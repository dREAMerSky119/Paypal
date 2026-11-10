"""Booking store (SQLite).

Render's free plan has no persistent disk, so by default the file lives in the OS
temp dir and is lost on restart. That is fine for a sandbox demo; set BOOKINGS_DB
to a durable path (or swap this module for the Aiven SQL database) later.
"""
import json
import secrets
import sqlite3
import tempfile
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import paypal_settings as settings

STATUS_CREATED = "CREATED"
STATUS_PAID = "PAID"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    paypal_order_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL,
    constraints_json TEXT NOT NULL,
    proposal_json TEXT NOT NULL,
    sell_usd REAL NOT NULL,
    deposit_usd REAL NOT NULL,
    capture_id TEXT,
    payer_email TEXT,
    created_at TEXT NOT NULL,
    paid_at TEXT
)
"""


def _path() -> str:
    return settings.bookings_db or str(Path(tempfile.gettempdir()) / "wayfare_bookings.sqlite3")


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_path())
    conn.row_factory = sqlite3.Row
    conn.execute(_SCHEMA)
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return "WF-" + secrets.token_hex(5).upper()


def _row(r: sqlite3.Row | None) -> dict | None:
    if r is None:
        return None
    d = dict(r)
    d["constraints"] = json.loads(d.pop("constraints_json"))
    d["proposal"] = json.loads(d.pop("proposal_json"))
    d["balance_usd"] = round(d["sell_usd"] - d["deposit_usd"], 2)
    return d


def create(booking_id: str, order_id: str, constraints: dict, proposal: dict, sell_usd: float, deposit_usd: float) -> dict:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT INTO bookings (id, paypal_order_id, status, constraints_json, proposal_json, sell_usd, deposit_usd, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (booking_id, order_id, STATUS_CREATED, json.dumps(constraints), json.dumps(proposal),
             sell_usd, deposit_usd, _now()),
        )
    return get(booking_id)


def get(booking_id: str) -> dict | None:
    with closing(_connect()) as conn:
        return _row(conn.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,)).fetchone())


def get_by_order(order_id: str) -> dict | None:
    with closing(_connect()) as conn:
        return _row(conn.execute("SELECT * FROM bookings WHERE paypal_order_id = ?", (order_id,)).fetchone())


def mark_paid(booking_id: str, capture_id: str, payer_email: str | None) -> dict:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "UPDATE bookings SET status = ?, capture_id = ?, payer_email = ?, paid_at = ? WHERE id = ?",
            (STATUS_PAID, capture_id, payer_email, _now(), booking_id),
        )
    return get(booking_id)


def public_view(b: dict) -> dict:
    """What the browser may see: no payer email, no PayPal internals beyond the ids it already has."""
    return {
        "booking_id": b["id"], "status": b["status"], "order_id": b["paypal_order_id"],
        "sell_usd": b["sell_usd"], "deposit_usd": b["deposit_usd"], "balance_usd": b["balance_usd"],
        "capture_id": b["capture_id"], "created_at": b["created_at"], "paid_at": b["paid_at"],
        "constraints": b["constraints"], "proposal": b["proposal"],
    }
