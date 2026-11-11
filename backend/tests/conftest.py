"""Keep the suite offline and deterministic: a developer's real GEMINI_API_KEY in backend/.env
must never cause test runs to call Gemini. Tests that need Gemini opt in with their own mock."""
from dataclasses import replace

import pytest

from app import db
from app.core.config import settings
from app.services import ai_travel_agent, llm, seed, unified_assistant


@pytest.fixture(autouse=True)
def _no_real_gemini(monkeypatch):
    monkeypatch.setattr(llm, "settings", replace(llm.settings, api_key=""))
    monkeypatch.setattr(llm, "_transport", None)
    # AI Operations reads settings.gemini_api_key through the google-genai SDK; keep it offline too.
    offline = replace(settings, gemini_api_key=None)
    monkeypatch.setattr(ai_travel_agent, "settings", offline)
    monkeypatch.setattr(unified_assistant, "settings", offline)
    ai_travel_agent.get_client.cache_clear()
    unified_assistant.get_client.cache_clear()


@pytest.fixture(autouse=True)
def _no_real_database(monkeypatch):
    """Same rule for DATABASE_URL: a developer's real Aiven URL in backend/.env must never be touched by tests.
    Tests that exercise the database opt in with their own throwaway SQLite URL."""
    monkeypatch.setattr(db, "db_settings", replace(db.db_settings, url=""))
    seed.clear_cache()
    yield
    seed.clear_cache()
