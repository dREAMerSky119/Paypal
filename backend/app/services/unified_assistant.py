"""Unified Gemini assistant for Wayfare.

Gemini handles conversation and intent-aware wording. All itinerary figures and
inventory facts are retrieved from existing deterministic Wayfare services.
The committed inventory is sample data, not live supplier availability.
"""
import logging
import re
from functools import lru_cache

from app.core.config import settings
from app.services import advisor, inventory
<<<<<<< HEAD
=======
from app.services.seed import load_json
>>>>>>> fe70b5b (Add updated project files final one)

logger = logging.getLogger(__name__)

def _format_inr(amount):
    value = int(round(amount))
    raw = str(abs(value))
    if len(raw) > 3:
        raw = raw[:-3]
        groups = []
        while raw:
            groups.insert(0, raw[-2:])
            raw = raw[:-2]
        formatted = ",".join(groups + [str(abs(value))[-3:]])
    else:
        formatted = raw
    return ("-" if value < 0 else "") + formatted

SYSTEM_INSTRUCTIONS = """You are Wayfare, one unified travel and agency operations assistant.
Be warm, concise and conversational. Handle greetings and general travel questions
without forcing an itinerary. Ask one useful follow-up at a time when planning details
are missing. Remember the conversation. Help with trip planning, inventory, supplier
information, prices and operations.

TRUTH RULES:
- Only quote prices, inventory, or availability present in the supplied Wayfare data.
- Wayfare's committed inventory is SAMPLE data. Never call it live availability or
  a confirmed supplier quote. Say it is sample inventory whenever relevant.
- Never claim to book, contact suppliers, take payment, or confirm a reservation.
- Do not invent prices, exchange rates, booking IDs, hotels, or availability.
- If a requested destination is not in the supplied inventory, say it is not currently
  represented in this sample inventory; you may still discuss it generally.
- Distinguish an indicative proposal from a booking or confirmed quote.
- Default displayed currency is INR only when a reliable INR conversion is supplied.
  Otherwise retain the source currency and explain that conversion is unavailable.
- Use only the supplied operational context; if it is empty, say you cannot verify it.
"""

@lru_cache(maxsize=1)
def get_client():
    if not settings.gemini_api_key:
        raise AIConfigurationError("Gemini API key is not configured. Add GEMINI_API_KEY to backend/.env.")
    from google import genai
    return genai.Client(api_key=settings.gemini_api_key, http_options={"timeout": 120000})

class AIConfigurationError(Exception): pass
class AIProviderError(Exception): pass

def _history(messages):
    out = []
    for m in messages[-24:]:
        role = m.get("role")
        content = str(m.get("content", "")).strip()
        if role in ("user", "model") and content:
            out.append({"role": role, "parts": [{"text": content[:4000]}]})
    if not out or out[-1]["role"] != "user":
        raise ValueError("The latest message must be from the user.")
    return out


def _is_plan_request(message, constraints, messages=None):
    low = message.lower().strip()

    # A new trip-planning request.
    new_plan = re.search(
        r"\b(plan|create|build|prepare|generate|design)\b.*"
        r"\b(trip|itinerary|holiday|vacation|tour|package)\b"
<<<<<<< HEAD
        r"|\b(trip|itinerary|holiday|vacation)\s+plan\b",
=======
        r"|\b(trip|itinerary|holiday|vacation)\s+plan\b|\bplan\b.*\b(?:nights?|days?)\b",
>>>>>>> fe70b5b (Add updated project files final one)
        low,
    )

    # Explicit changes to an existing proposal.
    modify_plan = re.search(
        r"\b(make it cheaper|reduce (?:the )?(?:cost|budget|price)|"
        r"increase (?:the )?budget|change destination|"
        r"change (?:the )?(?:hotel|stay|dates|travellers|nights)|"
        r"add (?:one|another|\d+) (?:day|night|activity)|"
        r"remove (?:an? )?(?:activity|hotel|stay)|"
        r"update (?:the )?(?:trip|itinerary|proposal)|"
        r"make it (?:more relaxed|more budget friendly))\b",
        low,
    )

    return bool(new_plan or modify_plan)

<<<<<<< HEAD
def _inventory_context(message):
    low = message.lower()
    if not re.search(r"\b(inventory|available|availability|hotels?|stays?|suppliers?|transport|transfers?|prices?|rates?|costs?|experiences?|guides?)\b", low):
        return None
    destination = advisor.find_destination(message)
=======
def _inventory_context(message, destination_hint=None):
    low = message.lower()
    if not re.search(r"\b(inventory|available|availability|hotels?|stays?|suppliers?|transport|transfers?|prices?|rates?|costs?|experiences?|guides?|recommend(?:ations?)?|places|things to do)\b", low):
        return None
    destination = advisor.find_destination(message) or destination_hint
>>>>>>> fe70b5b (Add updated project files final one)
    requested_place = None
    if destination is None:
        place_match = re.search(r"\b(?:in|at|around)\s+([A-Za-z][A-Za-z -]{1,30}?)(?=\s+(?:for|with|during|from)\b|[?.!,]|$)", message, re.I)
        if place_match:
            requested_place = place_match.group(1).strip()
    kind = None
    if re.search(r"\b(hotels?|stays?|accommodations?)\b", low): kind = "stay"
    elif re.search(r"\b(transport|transfers?|vehicles?)\b", low): kind = "transport"
    elif re.search(r"\b(guides?)\b", low): kind = "guide"
    elif re.search(r"\b(activities|experiences?)\b", low): kind = "experience"
    if requested_place and requested_place.lower() not in {"india", "asia", "europe", "the world"}:
        return {
            "source": "Wayfare committed sample inventory",
            "requested_destination": requested_place,
            "is_sample": True,
            "count": 0,
            "items": [],
            "suppliers": [],
            "note": "No inventory destination match is available for this place in the current Wayfare sample dataset. Do not substitute results from another destination."
        }
    result = inventory.search_items(destination=destination, type=kind, page=1, page_size=20, sort="price_asc")
    supplier_data = None
    if re.search(r"\\b(supplier|partner|vendor)\\b", low):
        suppliers = inventory.search_suppliers(destination=destination, page=1, page_size=20)
        supplier_data = suppliers["items"]
    return {
        "source": "Wayfare committed sample inventory",
        "destination_filter": destination,
        "currency_note": "Each row's price is in its own currency; do not combine unlike currencies.",
        "is_sample": True,
        "count": result["count"],
        "suppliers": supplier_data,
        "items": [{
            "id": x["id"], "name": x["name"], "destination": x["destination"],
            "type": x["type"], "tier": x["tier"], "currency": x["currency"],
            "unit_price": x.get("base_net_price"), "unit": x.get("unit"),
            "supplier": x.get("supplier_name"), "data_origin": x.get("data_origin")
        } for x in result["items"]]
    }

<<<<<<< HEAD
=======
def _travel_recommendations(destination: str | None) -> dict:
    """Return grounded inventory items and destination attractions for the chat UI."""
    if not destination:
        return {"recommendations": [], "places": []}
    try:
        data = inventory.search_items(destination=destination, page=1, page_size=30, sort="price_asc")
        by_type = {}
        for item in data["items"]:
            by_type.setdefault(item["type"], [])
            if len(by_type[item["type"]]) < 3:
                by_type[item["type"]].append({
                    "id": item["id"], "name": item["name"], "type": item["type"],
                    "tier": item["tier"], "destination": item["destination"],
                    "currency": item["currency"], "price": item.get("base_net_price"),
                    "unit": item.get("unit"), "supplier": item.get("supplier_name"),
                    "locality": item.get("responsible", {}).get("locality"),
                    "data_origin": item.get("data_origin"),
                })
        destinations = load_json("destinations.json")
        dest = next((d for d in destinations if d["slug"] == destination), None)
        places = [{
            "name": a["name"], "category": a.get("category"),
            "location": a.get("location"), "description": a.get("description", ""),
            "duration": a.get("duration", ""),
        } for a in (dest or {}).get("attractions", [])[:6]]
        return {"recommendations": [item for group in by_type.values() for item in group],
                "places": places}
    except Exception:
        logger.exception("Could not assemble destination recommendations")
        return {"recommendations": [], "places": []}


>>>>>>> fe70b5b (Add updated project files final one)
def chat_with_unified_agent(messages: list[dict], constraints: dict | None = None) -> dict:
    if not messages:
        raise ValueError("Send a message to start the conversation.")
    history = _history(messages)
    latest = str(messages[-1].get("content", "")).strip()
    if len(latest) > advisor.MAX_MESSAGE_CHARS:
        raise ValueError(f"Please keep each message under {advisor.MAX_MESSAGE_CHARS} characters.")

    # A plan is always produced by Wayfare's existing deterministic planner.
    if _is_plan_request(latest, constraints, messages):
        try:
            if constraints:
                advisor.validate(constraints)
            planned = advisor.respond(latest, constraints)
        except advisor.AdvisorError as exc:
            return {"reply": str(exc), "constraints": constraints or {}, "proposal": None, "mode": "planning"}
        proposal = planned.get("proposal")
        if proposal:
            fx = inventory.state()["meta"]["fx_per_usd"].get("INR")
            if fx:
                for line in proposal["lines"]:
                    line["sell_inr"] = round(line["sell_usd"] * fx, 2)
                    line["net_inr"] = round(line["net_usd"] * fx, 2)
                totals = proposal["totals"]
                totals["sell_inr"] = round(totals["sell_usd"] * fx, 2)
                totals["net_inr"] = round(totals["net_usd"] * fx, 2)
                totals["margin_inr"] = round(totals["margin_usd"] * fx, 2)
                totals["per_person_inr"] = round(totals["per_person_usd"] * fx, 2)
                proposal["budget_inr"] = round(proposal["budget_usd"] * fx, 2) if proposal.get("budget_usd") is not None else None
                proposal["display_currency"] = "INR"
                proposal["fx_rate_used"] = fx
            if fx:
                total_inr = proposal["totals"]["sell_inr"]
                per_person_inr = proposal["totals"]["per_person_inr"]
                destination_name = next((d["name"] for d in advisor._destinations()
                                         if d["slug"] == proposal["destination"]), proposal["destination"])
                reply = (f"Here is your {proposal['nights']}-night {destination_name} proposal for "
                         f"{proposal['travellers']} traveller(s). Estimated total: ₹{_format_inr(total_inr)} "
                         f"(₹{_format_inr(per_person_inr)} per person). Amounts are converted using Wayfare's "
                         f"configured sample FX rate. This uses committed sample inventory, not live availability.")
                if proposal.get("budget_inr") is not None:
                    reply += f" Budget: ₹{_format_inr(proposal['budget_inr'])} — " + ("within budget." if proposal["within_budget"] else "over budget.")
            else:
                reply = planned["reply"] + " INR conversion is not configured, so prices remain in their source currency."
<<<<<<< HEAD
            return {"reply": reply, "constraints": planned["constraints"], "proposal": proposal, "mode": "planning"}
        return {"reply": planned["reply"], "constraints": planned["constraints"], "proposal": None, "mode": "planning"}

    context = _inventory_context(latest)
=======
            extras = _travel_recommendations(proposal["destination"])
            return {"reply": reply, "constraints": planned["constraints"], "proposal": proposal,
                    "mode": "planning", **extras}
        destination = planned.get("constraints", {}).get("destination") or advisor.find_destination(latest)
        extras = _travel_recommendations(destination)
        return {"reply": planned["reply"], "constraints": planned["constraints"], "proposal": None,
                "mode": "planning", **extras}

    conversation_text = " ".join(
        item["parts"][0]["text"] for item in history if item.get("parts")
    )
    conversation_destination = (
        advisor.find_destination(latest)
        or advisor.find_destination(conversation_text)
        or (constraints or {}).get("destination")
    )
    context = _inventory_context(latest, conversation_destination)
>>>>>>> fe70b5b (Add updated project files final one)
    contents = [dict(item) for item in history]
    if context is not None:
        contents[-1] = {
            "role": "user",
            "parts": [{"text": contents[-1]["parts"][0]["text"] +
                       "\\n\\nRetrieved Wayfare inventory context (sample data only):\\n" + str(context)}],
        }
    try:
        response = get_client().models.generate_content(
            model=settings.gemini_model,
            contents=contents,
<<<<<<< HEAD
            config={"system_instruction": SYSTEM_INSTRUCTIONS, "temperature": 0.35, "max_output_tokens": 1400},
=======
            config={"system_instruction": SYSTEM_INSTRUCTIONS, "max_output_tokens": 1400},
>>>>>>> fe70b5b (Add updated project files final one)
        )
        answer = (response.text or "").strip()
        if not answer:
            raise AIProviderError("Gemini returned an empty response. Please try again.")
<<<<<<< HEAD
        return {"reply": answer, "constraints": constraints or {}, "proposal": None, "mode": "conversation"}
=======
        destination = conversation_destination
        extras = _travel_recommendations(destination)
        return {"reply": answer, "constraints": constraints or {}, "proposal": None,
                "mode": "conversation", **extras}
>>>>>>> fe70b5b (Add updated project files final one)
    except AIConfigurationError:
        raise
    except AIProviderError:
        raise
    except Exception as exc:
        logger.exception("Unexpected Gemini error in unified assistant")
        if getattr(exc, "code", None) == 429 or "429" in str(exc):
            raise AIProviderError("Gemini request limit reached. Wait for the quota to reset, then try again.") from exc
        raise AIProviderError("Could not get a response from Gemini. Check the API key and model settings, then try again.") from exc
