from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.ai_travel_agent import (
    AIConfigurationError, AIProviderError, chat_with_agent,
)

router = APIRouter(tags=["ai-operations"])

class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|model)$")
    content: str = Field(min_length=1, max_length=4000)

class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)

@router.post("/advisor/chat")
def advisor_chat(body: ChatRequest) -> dict:
    try:
        return chat_with_agent([m.model_dump() for m in body.messages])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AIConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AIProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
