from fastapi import APIRouter, HTTPException

from app import db
from app.services import db_seed, seed

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Cheap liveness probe for Render. Deliberately does not touch the database."""
    return {"status": "ok"}


@router.get("/health/db")
def health_db() -> dict:
    """Is the database configured, reachable and loaded? Also says where each seed file is being served from."""
    if not db.enabled():
        return {"database": "not configured", "serving": "committed JSON"}
    try:
        counts = db_seed.table_counts()
    except Exception as exc:
        raise HTTPException(503, f"database unreachable or schema missing ({type(exc).__name__})") from exc
    return {"database": "connected", "rows": counts, "seed_served_from": seed.sources() or "not read yet"}
