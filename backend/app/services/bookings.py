"""Booking store.

With DATABASE_URL set, bookings live in the Aiven PostgreSQL table `checkout_booking`, so they survive
restarts and redeploys. Without it they go to a local SQLite file (BOOKINGS_DB, default: the OS temp dir,
lost on restart on Render's free plan), which is fine for local development and tests.
"""
import json
import secrets
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from app import db
from app.core.config import paypal_settings as settings

STATUS_CREATED = "CREATED"
STATUS_PAID = "PAID"

# Keep in sync with the same table in scripts/schema.sql.
_SCHEMA = """
CREATE TABLE IF NOT EXISTS checkout_booking (
    id VARCHAR(24) PRIMARY KEY,
    paypal_order_id VARCHAR(64) UNIQUE NOT NULL,
    status VARCHAR(12) NOT NULL,
    constraints_json TEXT NOT NULL,
    proposal_json TEXT NOT NULL,
    sell_usd DOUBLE PRECISION NOT NULL,
    deposit_usd DOUBLE PRECISION NOT NULL,
    capture_id VARCHAR(64),
    payer_email VARCHAR(200),
    created_at VARCHAR(32) NOT NULL,
    paid_at VARCHAR(32)
)
"""
_ready: set[str] = set()


def _path() -> str:
    return settings.bookings_db or str(Path(tempfile.gettempdir()) / "wayfare_bookings.sqlite3")


@contextmanager
def _connect():
    target = db.url() if db.enabled() else "sqlite:///" + _path()
    with db.connect(target) as conn:
        if db.kind(target) == "sqlite" or target not in _ready:  # Postgres: create the table once per process
            conn.execute(_SCHEMA)
            _ready.add(target)
        yield conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def new_id() -> str:
    return "WF-" + secrets.token_hex(5).upper()


def _row(r: dict | None) -> dict | None:
    if r is None:
        return None
    d = dict(r)
    d["constraints"] = json.loads(d.pop("constraints_json"))
    d["proposal"] = json.loads(d.pop("proposal_json"))
    d["balance_usd"] = round(d["sell_usd"] - d["deposit_usd"], 2)
    return d


def create(booking_id: str, order_id: str, constraints: dict, proposal: dict, sell_usd: float, deposit_usd: float) -> dict:
    with _connect() as conn:
        conn.execute(
            "INSERT INTO checkout_booking (id, paypal_order_id, status, constraints_json, proposal_json, sell_usd, deposit_usd, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (booking_id, order_id, STATUS_CREATED, json.dumps(constraints), json.dumps(proposal),
             sell_usd, deposit_usd, _now()),
        )
    return get(booking_id)


def get(booking_id: str) -> dict | None:
    with _connect() as conn:
        return _row(conn.one("SELECT * FROM checkout_booking WHERE id = ?", (booking_id,)))


def get_by_order(order_id: str) -> dict | None:
    with _connect() as conn:
        return _row(conn.one("SELECT * FROM checkout_booking WHERE paypal_order_id = ?", (order_id,)))


def paid_for_package(package_id: str) -> dict | None:
    """Most recent paid booking made from a saved package, if any."""
    with _connect() as conn:
        rows = conn.all("SELECT * FROM checkout_booking WHERE status = ? ORDER BY paid_at DESC", (STATUS_PAID,))
    for r in rows:
        b = _row(r)
        if b["constraints"].get("package_id") == package_id:
            return b
    return None


def mark_paid(booking_id: str, capture_id: str, payer_email: str | None) -> dict:
    with _connect() as conn:
        conn.execute(
            "UPDATE checkout_booking SET status = ?, capture_id = ?, payer_email = ?, paid_at = ? WHERE id = ?",
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
