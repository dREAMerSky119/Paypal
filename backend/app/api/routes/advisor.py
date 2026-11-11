import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.services import advisor, agent

router = APIRouter(tags=["advisor"])

LIMIT, WINDOW_S = 30, 60
AGENT_LIMIT = 12  # each agent request can make several Gemini calls, so it gets a tighter limit
_hits: dict[str, deque] = defaultdict(deque)
_agent_hits: dict[str, deque] = defaultdict(deque)


class PlanRequest(BaseModel):
    message: str = Field(max_length=advisor.MAX_MESSAGE_CHARS)
    constraints: dict | None = None
    destination: str | None = None


def _limit(hits: dict, limit: int, request: Request) -> None:
    now = time.monotonic()
    q = hits[request.client.host if request.client else "anon"]
    while q and now - q[0] > WINDOW_S:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests, try again in a minute")
    q.append(now)


@router.post("/advisor/plan")
def advisor_plan(body: PlanRequest, request: Request) -> dict:
    """Parse a request into constraints and build a proposal from inventory only."""
    _limit(_hits, LIMIT, request)
    try:
        return advisor.respond(body.message, body.constraints, body.destination)
    except advisor.AdvisorError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/advisor/agent")
def advisor_agent(body: PlanRequest, request: Request) -> dict:
    """Agentic planner: Gemini calls inventory, proposal and checkout tools.

    Same request and response shape as /advisor/plan, plus `checkout` (an open, unpaid PayPal
    order, or null) and `agent` (mode and the tool steps taken). It never captures a payment.
    Without a Gemini key it behaves exactly like /advisor/plan."""
    _limit(_agent_hits, AGENT_LIMIT, request)
    try:
        return agent.run(body.message, body.constraints, body.destination)
    except advisor.AdvisorError as e:
        raise HTTPException(status_code=422, detail=str(e))
