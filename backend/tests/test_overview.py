from dataclasses import replace

import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.services import inventory

client = TestClient(app)


@pytest.fixture(autouse=True)
def _offline(monkeypatch, tmp_path):
    monkeypatch.setattr(db, "db_settings", replace(db.db_settings, url="", packages_db=str(tmp_path / "packages.sqlite3")))
    inventory.reset()


def test_overview_matches_feature_page_contract():
    response = client.get("/api/overview")
    assert response.status_code == 200
    body = response.json()
    assert {"metrics", "journeys", "trend", "responsible_note", "is_sample"} <= body.keys()
    assert {"labels", "values", "summary_value", "summary_text", "footnote"} <= body["trend"].keys()
    assert all({"key", "label", "value", "change", "detail"} <= metric.keys() for metric in body["metrics"])
    for journey in body["journeys"]:
        assert {"id", "package_id", "destination", "start_date", "end_date", "travellers", "status", "tone"} <= journey.keys()
