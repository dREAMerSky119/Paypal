from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

<<<<<<< HEAD
from app.services.ai_travel_agent import (
    AIConfigurationError, AIProviderError, chat_with_agent,
=======
from app.services.unified_assistant import (
    AIConfigurationError, AIProviderError, chat_with_unified_agent,
>>>>>>> fe70b5b (Add updated project files final one)
)

router = APIRouter(tags=["ai-operations"])

<<<<<<< HEAD
=======

>>>>>>> fe70b5b (Add updated project files final one)
class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|model)$")
    content: str = Field(min_length=1, max_length=4000)

<<<<<<< HEAD
class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)

@router.post("/advisor/chat")
def advisor_chat(body: ChatRequest) -> dict:
    try:
        return chat_with_agent([m.model_dump() for m in body.messages])
=======

class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    constraints: dict | None = None


@router.post("/advisor/chat")
def advisor_chat(body: ChatRequest) -> dict:
    """One chat endpoint for conversation, advisory and inventory-backed trip plans."""
    try:
        return chat_with_unified_agent(
            [m.model_dump() for m in body.messages], body.constraints
        )
>>>>>>> fe70b5b (Add updated project files final one)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except AIConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except AIProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
