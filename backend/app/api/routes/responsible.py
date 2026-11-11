
from fastapi import APIRouter, HTTPException, Request
from app.services import responsible

router = APIRouter(tags=["responsible travel"])


@router.get("/responsible/partners")
def partners(destination: str | None = None, kind: str | None = None, q: str | None = None):
    return responsible.overview(destination=destination, kind=kind, query=q)


@router.get("/responsible/score/{item_id}")
def score(item_id: str):
    # Supplier ID returns a partner's scorecard; destination slug returns all
    # partners and the destination average.
    result = responsible.destination_detail(item_id)
    if result is not None:
        return result
    all_data = responsible.overview()
    partner = next((p for p in all_data["partners"] if p["id"] == item_id), None)
    if partner is not None:
        return partner
    raise HTTPException(status_code=404, detail="No matching destination or partner was found.")


@router.get("/responsible/package/{package_id}")
def package_impact(package_id: str):
    raise HTTPException(
        status_code=404,
        detail="This package has no saved transport and accommodation details to calculate an impact summary yet.",
    )


@router.post("/responsible/carbon")
async def carbon(request: Request):
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Please enter trip details using valid numbers.")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Trip details must be submitted as a JSON object.")
    try:
        return responsible.calculate_carbon(payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
