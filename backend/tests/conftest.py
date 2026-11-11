"""Keep the suite offline and deterministic: a developer's real GEMINI_API_KEY in backend/.env
must never cause test runs to call Gemini. Tests that need Gemini opt in with their own mock."""
from dataclasses import replace

import pytest

from app.services import llm


@pytest.fixture(autouse=True)
def _no_real_gemini(monkeypatch):
    monkeypatch.setattr(llm, "settings", replace(llm.settings, api_key=""))
    monkeypatch.setattr(llm, "_transport", None)
