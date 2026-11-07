from fastapi import APIRouter

from app.api.routes import health

api_router = APIRouter()
api_router.include_router(health.router)

# Add new feature routers here:
# from app.api.routes import users
# api_router.include_router(users.router, prefix="/users")
