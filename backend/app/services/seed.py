"""Loads the seed data once and caches it.

With DATABASE_URL set, the data comes from the Aiven database (see services/db_seed.py). If the
database is unreachable or has not been loaded yet, the committed JSON in app/data/ is served
instead so the site stays up (Aiven's free plan powers off when idle); the failure is logged and
retried after a short pause. Without DATABASE_URL the JSON files are used, as before.
"""
import json
import logging
import time
from functools import lru_cache
from pathlib import Path

from app import db

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RETRY_AFTER_S = 60

log = logging.getLogger("wayfare.seed")
_cache: dict[str, object] = {}
_sources: dict[str, str] = {}
_retry_at = 0.0


@lru_cache(maxsize=None)
def _read_file(name: str):
    with (DATA_DIR / name).open(encoding="utf-8") as fh:
        return json.load(fh)


def load_json(name: str):
    global _retry_at
    if name in _cache:
        return _cache[name]
    from app.services import db_seed
    if db.enabled() and name in db_seed.SUPPORTED and time.monotonic() >= _retry_at:
        try:
            data = db_seed.load(name)
            if data is not None:
                _cache[name], _sources[name] = data, "database"
                return data
            log.warning("database has no data for %s (run scripts/load_to_sql.py); serving the committed JSON", name)
        except Exception as exc:  # unreachable, asleep, or tables missing: keep the site up
            _retry_at = time.monotonic() + RETRY_AFTER_S
            log.warning("database read of %s failed (%s: %s); serving the committed JSON for %ds",
                        name, type(exc).__name__, exc, RETRY_AFTER_S)
    _sources[name] = "json"
    return _read_file(name)


def sources() -> dict[str, str]:
    """Where each seed file was last served from: 'database' or 'json'."""
    return dict(_sources)


def clear_cache() -> None:
    global _retry_at
    _cache.clear(); _sources.clear(); _retry_at = 0.0
