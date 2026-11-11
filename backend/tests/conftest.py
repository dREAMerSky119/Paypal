"""Keep the suite offline and deterministic: a developer's real GEMINI_API_KEY in backend/.env
must never cause test runs to call Gemini. Tests that need Gemini opt in with their own mock."""
from dataclasses import replace

import pytest

from app import db
from app.services import llm, seed


@pytest.fixture(autouse=True)
def _no_real_gemini(monkeypatch):
    monkeypatch.setattr(llm, "settings", replace(llm.settings, api_key=""))
    monkeypatch.setattr(llm, "_transport", None)


@pytest.fixture(autouse=True)
def _no_real_database(monkeypatch):
    """Same rule for DATABASE_URL: a developer's real Aiven URL in backend/.env must never be touched by tests.
    Tests that exercise the database opt in with their own throwaway SQLite URL."""
    monkeypatch.setattr(db, "db_settings", replace(db.db_settings, url=""))
    seed.clear_cache()
    yield
    seed.clear_cache()
