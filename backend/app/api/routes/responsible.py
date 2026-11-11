from fastapi import APIRouter, HTTPException, Query
from app.services import responsible

router = APIRouter(prefix="/responsible", tags=["responsible-travel"])


@router.get("/partners")
def responsible_partners(
    destination: str | None = None,
    kind: str | None = None,
    q: str | None = Query(None, max_length=100),
) -> dict:
    return responsible.list_stays(destination=destination, q=q, kind=kind)


@router.post("/carbon")
def responsible_carbon(payload: dict) -> dict:
    try:
        return responsible.carbon_estimate(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
