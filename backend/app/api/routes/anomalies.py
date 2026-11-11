"""Anomaly detection API (feature #9).

GET  /api/anomalies                 severity-sorted, filterable, paginated feed
GET  /api/anomalies/summary         counts for the topbar bell
POST /api/anomalies/scan            re-run every layer now
POST /api/anomalies/{id}/resolve    accept, dismiss or fix one anomaly
POST /api/anomalies/{id}/reopen     undo a resolution
GET  /api/anomalies/items           inventory items for the manual check form
POST /api/anomalies/detect          check a single proposed price before it is entered
"""
from fastapi import APIRouter, HTTPException, Query

from pydantic import BaseModel, Field

from app.services import anomalies as svc
from app.services import supplier_anomaly

router = APIRouter(tags=["anomalies"])


class ResolveRequest(BaseModel):
    action: str = Field(pattern=r"^(accept|dismiss|fix)$")
    note: str | None = Field(default=None, max_length=500)


class PriceRequest(BaseModel):
    parent_id: str = Field(min_length=1)
    period: str = Field(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    price_usd: float


@router.get("/anomalies")
def get_feed(
    severity: str | None = None,
    kind: str | None = None,
    destination: str | None = None,
    status: str = "open",
    q: str | None = Query(None, max_length=100),
    page: int = 1,
    page_size: int = 25,
) -> dict:
    try:
        return svc.feed(severity=severity, kind=kind, destination=destination,
                        status=status, q=q, page=page, page_size=page_size)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.get("/anomalies/summary")
def get_summary() -> dict:
    return svc.summary()


@router.post("/anomalies/scan")
def post_scan() -> dict:
    return svc.scan()


@router.post("/anomalies/{anomaly_id}/resolve")
def post_resolve(anomaly_id: str, body: ResolveRequest) -> dict:
    """`anomaly_id` is the anomaly key, URL-encoded (it contains colons)."""
    try:
        result = svc.resolve(anomaly_id, body.action, body.note)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except Exception:
        import logging
        logging.exception("Could not store the anomaly resolution")
        raise HTTPException(status_code=503,
                            detail="The database is not reachable, so the resolution was not saved. Try again shortly.")
    return {"success": True, **result}


@router.post("/anomalies/{anomaly_id}/reopen")
def post_reopen(anomaly_id: str) -> dict:
    try:
        return {"success": True, **svc.reopen(anomaly_id)}
    except Exception:
        import logging
        logging.exception("Could not reopen the anomaly")
        raise HTTPException(status_code=503, detail="The database is not reachable. Try again shortly.")


@router.get("/anomalies/items")
def get_anomaly_items() -> dict:
    return {"items": supplier_anomaly.list_items()}


@router.post("/anomalies/detect")
def detect_price(request: PriceRequest):
    try:
        result = supplier_anomaly.detect_anomalies([request.model_dump()])
        if not result:
            raise HTTPException(status_code=400, detail="No result was generated.")
        return {"success": True, "result": result[0]}
    except HTTPException:
        raise
    except (ValueError, KeyError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    except Exception:
        import logging
        logging.exception("Supplier anomaly detection failed")
        raise HTTPException(status_code=500,
                            detail="Supplier anomaly detection failed. Check backend logs.")
