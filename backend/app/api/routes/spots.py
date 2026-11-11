from fastapi import APIRouter, HTTPException, Query

from app.services import spots as svc

router = APIRouter(tags=["spots"])


@router.get("/spots/related")
def related_spots(
    destination: str = Query(..., description="Destination slug, e.g. kyoto-japan"),
    item: str | None = Query(None, description="Anchor spot id or name; defaults to the destination's best-known spot"),
    mode: str = Query("near", description="near | similar | day"),
    limit: int = Query(6, ge=1, le=20),
    max_travel_min: int = Query(45, ge=5, le=240, description="Day mode only: one-way road-time cap"),
) -> dict:
    try:
        return svc.related(destination, item=item, mode=mode, limit=limit,
                           max_travel_min=max_travel_min)
    except svc.SpotError as error:
        raise HTTPException(status_code=400, detail=str(error))
