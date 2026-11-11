import time
import re
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core import config
from app.services import advisor, agent, llm_budget

router = APIRouter(tags=["advisor"])

LIMIT, WINDOW_S = 30, 60
AGENT_LIMIT = 12  # each agent request can make several Gemini calls, so it gets a tighter limit
_hits: dict[str, deque] = defaultdict(deque)
_agent_hits: dict[str, deque] = defaultdict(deque)
_SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


class PlanRequest(BaseModel):
    message: str = Field(max_length=advisor.MAX_MESSAGE_CHARS)
    constraints: dict | None = None
    destination: str | None = None


def _guard(hits: dict, limit: int, request: Request) -> None:
    _limit(hits, limit, request)
    sid = request.headers.get("x-session-id", "")
    if _SESSION_RE.match(sid):
        wait = llm_budget.check_session(sid)
        if wait is not None:
            lim = config.llm_limits
            raise HTTPException(status_code=429, headers={"Retry-After": str(wait)},
                detail=f"You have used your {lim.session_limit} advisor requests for this session. Try again shortly.")


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
    _guard(_hits, LIMIT, request)
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
    _guard(_agent_hits, AGENT_LIMIT, request)
    try:
        return agent.run(body.message, body.constraints, body.destination)
    except advisor.AdvisorError as e:
        raise HTTPException(status_code=422, detail=str(e))
