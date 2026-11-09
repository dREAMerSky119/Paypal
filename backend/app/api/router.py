from fastapi import APIRouter

from app.api.routes import advisor, destinations, health, inventory, overview

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(destinations.router)
api_router.include_router(overview.router)
api_router.include_router(inventory.router)
api_router.include_router(advisor.router)

# Add new feature routers here, one file per feature:
