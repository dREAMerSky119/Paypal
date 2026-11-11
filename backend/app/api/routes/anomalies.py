
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services import supplier_anomaly

router = APIRouter(tags=["anomalies"])


class PriceRequest(BaseModel):
    parent_id: str = Field(min_length=1)
    period: str = Field(
        pattern=r"^\d{4}-(0[1-9]|1[0-2])$"
    )
    price_usd: float


@router.get("/anomalies/items")
def get_anomaly_items():
    return {
        "items": supplier_anomaly.list_items()
    }


@router.post("/anomalies/detect")
def detect_price(request: PriceRequest):
    try:
        result = supplier_anomaly.detect_anomalies([
            request.model_dump()
        ])

        if not result:
            raise HTTPException(
                status_code=400,
                detail="No result was generated."
            )

        return {
            "success": True,
            "result": result[0]
        }

    except HTTPException:
        raise

    except (ValueError, KeyError) as error:
        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except Exception:
        import logging
        logging.exception("Supplier anomaly detection failed")
        raise HTTPException(
            status_code=500,
            detail="Supplier anomaly detection failed. Check backend logs."
        )
