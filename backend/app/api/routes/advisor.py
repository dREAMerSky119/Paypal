import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services import advisor

router = APIRouter(tags=["advisor"])

LIMIT, WINDOW_S = 30, 60
_hits: dict[str, deque] = defaultdict(deque)


class PlanRequest(BaseModel):
    message: str = Field(max_length=advisor.MAX_MESSAGE_CHARS)
    constraints: dict | None = None
    destination: str | None = None


@router.post("/advisor/plan")
def advisor_plan(body: PlanRequest, request: Request) -> dict:
    """Parse a request into constraints and build a proposal from inventory only."""
    now = time.monotonic()
    q = _hits[request.client.host if request.client else "anon"]
    while q and now - q[0] > WINDOW_S:
        q.popleft()
    if len(q) >= LIMIT:
        raise HTTPException(status_code=429, detail="Too many requests, try again in a minute")
    q.append(now)
    try:
        return advisor.respond(body.message, body.constraints, body.destination)
    except advisor.AdvisorError as e:
        raise HTTPException(status_code=422, detail=str(e))
