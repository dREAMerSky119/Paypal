
from fastapi import APIRouter

from app.api.routes import (
    advisor,
    destinations,
    health,
    inventory,
    overview,
    analytics,
    forecast,
)

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(destinations.router)
api_router.include_router(overview.router)
api_router.include_router(inventory.router)
api_router.include_router(advisor.router)
api_router.include_router(analytics.router)
api_router.include_router(forecast.router)
