
from fastapi import APIRouter

from app.api.routes import (
    advisor,
    destinations,
    health,
    inventory,
    overview,
    packages,
    payments,
    analytics,
    forecast,
    simulator,
    responsible,
    ai_advisor,
    anomalies,
    spots,
)

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(destinations.router)
api_router.include_router(overview.router)
api_router.include_router(inventory.router)
api_router.include_router(packages.router)
api_router.include_router(advisor.router)
api_router.include_router(analytics.router)
api_router.include_router(forecast.router)
api_router.include_router(payments.router)
api_router.include_router(simulator.router)
api_router.include_router(responsible.router)
api_router.include_router(ai_advisor.router)
api_router.include_router(anomalies.router)
api_router.include_router(spots.router)
