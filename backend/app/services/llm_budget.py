"""Monthly Gemini spend cap and per-session request limit (Phase G).

* Spend is an estimate: tokens reported by Gemini (`usageMetadata`) times the per-million
  prices in env. It is stored per calendar month (UTC) in the database when DATABASE_URL is
  set, otherwise a local SQLite file, so a restart does not reset the month.
* When the month's estimate reaches LLM_MONTHLY_CAP, `llm._post` refuses to call Gemini and
  the advisor serves its deterministic rule-based answer with a notice. Nothing is charged.
* The session limiter is in memory: a Render restart resets it, which is acceptable for a
  free-tier abuse guard. It is combined with the per-IP limit in routes/advisor.py, because a
  client can invent session ids but not IP addresses.
"""
from __future__ import annotations

import tempfile
import threading
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from app import db
from app.core import config

_SCHEMA = """
CREATE TABLE IF NOT EXISTS llm_usage (
    month VARCHAR(7) PRIMARY KEY,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    calls INTEGER NOT NULL DEFAULT 0
)
"""
_lock = threading.RLock()
_ready: set[str] = set()
_mem: dict[str, dict] = {}          # also the fallback when the database is unreachable
_sessions: dict[str, deque] = defaultdict(deque)


def _limits() -> config.LLMLimits:
    return config.llm_limits


def _month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _target() -> str:
    path = _limits().usage_db or str(Path(tempfile.gettempdir()) / "wayfare_llm_usage.sqlite3")
    return db.url() if db.enabled() else "sqlite:///" + path


@contextmanager
def _connect():
    target = _target()
    with db.connect(target) as conn:
        if db.kind(target) == "sqlite" or target not in _ready:
            conn.execute(_SCHEMA)
            _ready.add(target)
        yield conn


def usage() -> dict:
    month = _month()
    row = None
    try:
        with _connect() as conn:
            row = conn.one("SELECT input_tokens, output_tokens, calls FROM llm_usage WHERE month = ?", (month,))
    except Exception:
        row = None
    with _lock:
        mem = _mem.get(month, {"input_tokens": 0, "output_tokens": 0, "calls": 0})
    # The database is the record; memory only covers writes it missed while unreachable.
    src = row if row else mem
    lim = _limits()
    cost = (src["input_tokens"] * lim.price_in_per_m_usd + src["output_tokens"] * lim.price_out_per_m_usd) / 1e6
    return {"month": month, "input_tokens": int(src["input_tokens"]), "output_tokens": int(src["output_tokens"]),
            "calls": int(src["calls"]), "estimated_cost_usd": round(cost, 4), "cap_usd": lim.monthly_cap_usd}


def exceeded() -> bool:
    """True when no further Gemini call may be made this month."""
    cap = _limits().monthly_cap_usd
    return cap <= 0 or usage()["estimated_cost_usd"] >= cap


def record(input_tokens: int, output_tokens: int) -> None:
    """Add one call's tokens to this month. Never raises: accounting must not break a reply."""
    month, i, o = _month(), max(0, int(input_tokens or 0)), max(0, int(output_tokens or 0))
    with _lock:
        m = _mem.setdefault(month, {"input_tokens": 0, "output_tokens": 0, "calls": 0})
        m["input_tokens"] += i; m["output_tokens"] += o; m["calls"] += 1
    try:
        with _connect() as conn:
            if conn.one("SELECT month FROM llm_usage WHERE month = ?", (month,)):
                conn.execute("UPDATE llm_usage SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ?, "
                             "calls = calls + 1 WHERE month = ?", (i, o, month))
            else:
                conn.execute("INSERT INTO llm_usage (month, input_tokens, output_tokens, calls) VALUES (?, ?, ?, 1)",
                             (month, i, o))
    except Exception:
        pass


def check_session(session_id: str) -> int | None:
    """Count one request for this session. Returns None if allowed, else seconds until it may retry."""
    lim, now = _limits(), time.monotonic()
    with _lock:
        q = _sessions[session_id]
        while q and now - q[0] > lim.session_window_s:
            q.popleft()
        if len(q) >= lim.session_limit:
            return max(1, int(lim.session_window_s - (now - q[0])))
        q.append(now)
        if len(_sessions) > 5000:  # bound memory: drop sessions with nothing recent
            for k in [k for k, v in _sessions.items() if not v]:
                del _sessions[k]
    return None


def reset() -> None:
    """Test helper."""
    with _lock:
        _mem.clear(); _sessions.clear(); _ready.clear()
