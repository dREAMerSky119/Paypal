
from fastapi import APIRouter, HTTPException, Query

from app.services.demand_forecast import (
    get_demand_destinations,
    get_demand_forecast,
    get_shoulder_season,
)

router = APIRouter()


@router.get("/forecast/destinations")
def forecast_destinations():
    return {
        "destinations": get_demand_destinations()
    }


@router.get("/forecast/demand")
def demand_forecast(
    destination: str = Query(...),
    horizon: int = Query(6, ge=1, le=12),
):
    try:
        return get_demand_forecast(destination, horizon)

    except ValueError as error:
        raise HTTPException(
            status_code=404,
            detail=str(error),
        )

    except FileNotFoundError as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )


@router.get("/forecast/shoulder-season")
def shoulder_season():
    """Quieter-than-average months per destination, from the committed
    seasonal shape. Feeds the Overview insight panel and the forecast page."""
    try:
        return {
            "is_sample": True,
            "destinations": get_shoulder_season(),
        }

    except FileNotFoundError as error:
        raise HTTPException(
            status_code=500,
            detail=str(error),
        )
