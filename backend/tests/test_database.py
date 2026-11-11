"""The Aiven database layer, exercised against a throwaway SQLite file (same SQL, same code paths).

The DB-API wrapper rewrites `?` to `%s` for PostgreSQL, so what these tests prove for SQLite carries
over; the one thing they cannot prove is the live Aiven connection itself (see docs/database-setup.md).
"""
import math
from dataclasses import replace
from pathlib import Path

import pytest

pytest.importorskip("pandas")

from app import db  # noqa: E402
from app.services import bookings, db_seed, inventory, seed  # noqa: E402
from scripts import load_to_sql  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CSV, SCHEMA = ROOT / "scripts/data/wayfare_master.csv", ROOT / "scripts/schema.sql"
QUIET = lambda *_: None  # noqa: E731


def _use(monkeypatch, url):
    monkeypatch.setattr(db, "db_settings", replace(db.db_settings, url=url))
    seed.clear_cache()


def _loaded_database(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'wayfare.db'}"
    _use(monkeypatch, url)
    load_to_sql.run(url, CSV, SCHEMA, reset=True, log=QUIET)
    return url


def _diff(a, b, path=""):
    if isinstance(a, dict) and isinstance(b, dict):
        if a.keys() != b.keys():
            return [f"{path}: keys differ {set(a) ^ set(b)}"]
        return [d for k in a for d in _diff(a[k], b[k], f"{path}.{k}")]
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return [f"{path}: length {len(a)} != {len(b)}"]
        return [d for i, (x, y) in enumerate(zip(a, b)) for d in _diff(x, y, f"{path}[{i}]")][:5]
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return [] if math.isclose(a, b, abs_tol=1e-6) else [f"{path}: {a!r} != {b!r}"]
    return [] if a == b else [f"{path}: {a!r} != {b!r}"]


def test_csv_fits_schema():
    counts = load_to_sql.run(None, CSV, SCHEMA, check_only=True, log=QUIET)
    assert counts["destination"] == 12 and counts["item"] == 171 and counts["rate"] == 6156 and counts["booking"] == 7054


def test_database_serves_exactly_the_committed_seed(tmp_path, monkeypatch):
    _loaded_database(tmp_path, monkeypatch)
    for name in sorted(db_seed.SUPPORTED):
        assert _diff(db_seed.load(name), seed._read_file(name)) == [], name


def test_load_json_reads_from_the_database(tmp_path, monkeypatch):
    url = _loaded_database(tmp_path, monkeypatch)
    with db.connect(url) as c:
        c.execute("UPDATE item SET name = 'Edited in the database' WHERE item_id = 'item_0001'")
    assert seed.load_json("inventory_items.json")[0]["name"] == "Edited in the database"
    assert seed.sources()["inventory_items.json"] == "database"


def test_load_json_falls_back_to_files_when_the_database_is_unreachable(tmp_path, monkeypatch):
    _use(monkeypatch, f"sqlite:///{tmp_path / 'missing-dir' / 'x.db'}")
    assert len(seed.load_json("destinations.json")) == 12
    assert seed.sources()["destinations.json"] == "json"


def test_load_json_falls_back_when_the_database_is_empty(tmp_path, monkeypatch):
    url = f"sqlite:///{tmp_path / 'empty.db'}"
    _use(monkeypatch, url)
    with db.connect(url) as c:
        for stmt in load_to_sql.parse_schema(SCHEMA.read_text())[0]:
            c.execute(stmt)
    assert len(seed.load_json("bookings.json")) == 7054
    assert seed.sources()["bookings.json"] == "json"


def test_second_load_needs_reset_and_reset_keeps_checkout_bookings(tmp_path, monkeypatch):
    url = _loaded_database(tmp_path, monkeypatch)
    bookings.create("WF-KEEPME", "ORDER-1", {"a": 1}, {"b": 2}, 100.0, 30.0)
    with pytest.raises(SystemExit):
        load_to_sql.run(url, CSV, SCHEMA, reset=False, log=QUIET)
    load_to_sql.run(url, CSV, SCHEMA, reset=True, log=QUIET)
    assert bookings.get("WF-KEEPME")["status"] == "CREATED"


def test_bookings_are_stored_in_the_database(tmp_path, monkeypatch):
    url = _loaded_database(tmp_path, monkeypatch)
    b = bookings.create("WF-TEST1", "ORDER-9", {"dest": "kyoto-japan"}, {"total": 1}, 250.0, 75.0)
    assert b["balance_usd"] == 175.0 and b["constraints"] == {"dest": "kyoto-japan"}
    bookings.mark_paid("WF-TEST1", "CAP-1", "buyer@example.com")
    with db.connect(url) as c:  # a fresh connection sees it: it is in the database, not in memory
        row = c.one("SELECT status, capture_id FROM checkout_booking WHERE id = 'WF-TEST1'")
    assert row == {"status": "PAID", "capture_id": "CAP-1"}
    assert bookings.get_by_order("ORDER-9")["id"] == "WF-TEST1"


def _import_csv():
    return (b"name,destination,type,tier,currency,net_price,lat,lon,supplier\n"
            b"Test Riad suite,marrakech-morocco,stay,mid,MAD,900,31.63,-8.0,Riad Test\n")


def test_imported_inventory_survives_a_restart(tmp_path, monkeypatch):
    _loaded_database(tmp_path, monkeypatch)
    inventory.reset()
    result = inventory.import_csv(_import_csv())
    assert result["imported"] == 1, result
    inventory.reset(); seed.clear_cache()  # what a restart does
    names = [i["name"] for i in inventory.state()["items"]]
    assert "Test Riad suite" in names and len(names) == 172
    item = inventory.get_item(result["item_ids"][0])
    assert item is not None and inventory.get_rates(result["item_ids"][0])["rates"]
    inventory.reset()


def test_failed_database_write_leaves_the_inventory_unchanged(tmp_path, monkeypatch):
    _loaded_database(tmp_path, monkeypatch)
    inventory.reset()
    before = len(inventory.state()["items"])
    monkeypatch.setattr(db_seed, "save_imported", lambda *a: (_ for _ in ()).throw(RuntimeError("db down")))
    with pytest.raises(RuntimeError):
        inventory.import_csv(_import_csv())
    assert len(inventory.state()["items"]) == before
    inventory.reset()


def test_postgres_url_normalisation():
    assert db.normalize_postgres_url("postgres://u:p@h.aivencloud.com:123/defaultdb?sslmode=require") == \
        "postgresql://u:p@h.aivencloud.com:123/defaultdb?sslmode=require"
    assert db.normalize_postgres_url("postgresql+psycopg://u:p@h.aivencloud.com:123/d").endswith("/d?sslmode=require")
    assert "sslmode" not in db.normalize_postgres_url("postgresql://u:p@localhost/d")


def test_import_rejects_values_that_would_overflow_database_columns():
    inventory.reset()
    long_cat = b"name,destination,type,tier,currency,net_price,lat,lon,category\nX,marrakech-morocco,stay,mid,MAD,900,31.6,-8.0," + b"c" * 61 + b"\n"
    result = inventory.import_csv(long_cat, dry_run=True)
    assert result["rejected"] == 1 and "category is longer than 60" in result["errors"][0]["message"]
    inventory.reset()
