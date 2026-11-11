"""Saved, shareable simulator scenarios (Phase F).

Only the scenario's inputs are stored (destination, window, sliders, events, overrides), never
results, so a shared link always reruns against the current forecast. Storage follows
services/packages.py: Aiven PostgreSQL when DATABASE_URL is set, otherwise a local SQLite file.
"""
from __future__ import annotations

import json
import secrets
import tempfile
from contextlib import contextmanager
from pathlib import Path

from app import db
from app.services import simulator

# Keep in sync with scripts/schema.sql.
_SCHEMA = """
CREATE TABLE IF NOT EXISTS scenario (
    scenario_id VARCHAR(24) PRIMARY KEY,
    name VARCHAR(100),
    destination_slug VARCHAR(64),
    request TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
"""
ALLOWED_KEYS = ("destination", "start", "months", "adjustments", "events", "overrides")
MAX_NAME = 100
MAX_REQUEST_BYTES = 20_000
_ready: set[str] = set()


class ScenarioError(ValueError):
    """Bad scenario (HTTP 400)."""


def _path() -> str:
    return db.db_settings.packages_db or str(Path(tempfile.gettempdir()) / "wayfare_packages.sqlite3")


@contextmanager
def _connect():
    target = db.url() if db.enabled() else "sqlite:///" + _path()
    with db.connect(target) as conn:
        if db.kind(target) == "sqlite" or target not in _ready:
            conn.execute(_SCHEMA)
            _ready.add(target)
        yield conn


def save(name, request) -> dict:
    if not isinstance(request, dict):
        raise ScenarioError("request must be an object")
    clean = {key: request[key] for key in ALLOWED_KEYS if key in request}
    if len(json.dumps(clean)) > MAX_REQUEST_BYTES:
        raise ScenarioError("Scenario is too large to save.")
    try:
        destination, *_ = simulator.validate_request(clean)  # rejects anything the simulator would reject
    except simulator.SimulationError as error:
        raise ScenarioError(str(error)) from error
    title = (name or "").strip()[:MAX_NAME] if isinstance(name, str) else ""
    title = title or f"{destination['name']} scenario"
    scenario_id = secrets.token_urlsafe(8)
    with _connect() as conn:
        conn.execute(
            "INSERT INTO scenario (scenario_id, name, destination_slug, request) VALUES (?, ?, ?, ?)",
            (scenario_id, title, destination["slug"], json.dumps(clean)),
        )
    return {"scenario_id": scenario_id, "name": title, "destination": destination["slug"],
            "request": clean, "share_path": f"/app/simulator?saved={scenario_id}", "is_sample": True}


def get(scenario_id: str) -> dict | None:
    with _connect() as conn:
        row = conn.one("SELECT * FROM scenario WHERE scenario_id = ?", (scenario_id,))
    if row is None:
        return None
    return {"scenario_id": row["scenario_id"], "name": row["name"], "destination": row["destination_slug"],
            "request": json.loads(row["request"]), "share_path": f"/app/simulator?saved={row['scenario_id']}",
            "is_sample": True}
