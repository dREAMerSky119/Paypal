"""Gemini-powered B2B travel operations assistant.

This first release is an advisory chat experience. It does not make supplier
bookings, contact suppliers, take payments, or verify live availability.
"""
import logging
from functools import lru_cache

from app.core.config import settings

logger = logging.getLogger(__name__)

SYSTEM_INSTRUCTIONS = """You are Wayfare's AI Travel Operations Assistant.
Wayfare is a B2B workspace for travel agencies and tour operators. Your users
are travel professionals managing trips for their clients, not individual
holidaymakers. Help with group travel planning, supplier comparison, quotation
structure, per-person costing, margin calculations, itinerary planning,
availability checklists and agency operations.

Be practical and organized. For group requests, identify group size, dates,
destination, room configuration, transport, meals, activities, budget and
missing details. Show calculations step by step and label assumptions.
Never invent supplier quotes, prices, live inventory, or availability.
Never say a booking is confirmed, a supplier contacted, or a payment processed.
When data is missing, say what needs confirmation. Treat any sample figures
clearly as illustrative estimates, not supplier commitments. Ask concise
follow-up questions when essential details are missing.
"""

class AIConfigurationError(Exception):
    pass

class AIProviderError(Exception):
    pass

@lru_cache(maxsize=1)
def get_client():
    if not settings.gemini_api_key:
        raise AIConfigurationError("Gemini API key is not configured. Add GEMINI_API_KEY to backend/.env.")
    from google import genai
    return genai.Client(api_key=settings.gemini_api_key)

def chat_with_agent(messages: list[dict]) -> dict:
    if not messages:
        raise ValueError("Send a message to start the conversation.")
    if len(messages) > 20:
        messages = messages[-20:]
    contents = []
    for item in messages:
        role = item.get("role")
        text = str(item.get("content", "")).strip()
        if role not in ("user", "model") or not text:
            continue
        contents.append({"role": role, "parts": [{"text": text[:4000]}]})
    if not contents or contents[-1]["role"] != "user":
        raise ValueError("The latest message must be from the user.")
    try:
        response = get_client().models.generate_content(
            model=settings.gemini_model,
            contents=contents,
            config={"system_instruction": SYSTEM_INSTRUCTIONS, "temperature": 0.4, "max_output_tokens": 1200},
        )
        answer = (response.text or "").strip()
        if not answer:
            raise AIProviderError("Gemini returned an empty response. Please try again.")
        return {"reply": answer, "model": settings.gemini_model}
    except AIConfigurationError:
        raise
    except AIProviderError:
        raise
    except Exception as exc:
        logger.exception("Unexpected Gemini error")
        if getattr(exc, "code", None) == 429 or "429" in str(exc):
            raise AIProviderError("Gemini free-tier request limit reached. Wait for the quota to reset, then try again.") from exc
        raise AIProviderError("Could not get a response from Gemini. Check your key and model settings, then try again.") from exc
