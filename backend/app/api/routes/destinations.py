from fastapi import APIRouter, HTTPException

from app.services.seed import load_json

router = APIRouter(tags=["destinations"])


@router.get("/destinations")
def list_destinations() -> dict:
    """Light destination index. The frontend keeps data/destinations.js as an
    offline fallback, so this only needs the fields used for lists and search."""
    items = load_json("destinations.json")
    return {"count": len(items), "items": items, "is_sample": True}


@router.get("/destinations/{slug}")
def get_destination(slug: str) -> dict:
    for item in load_json("destinations.json"):
        if item["slug"] == slug:
            return item
    raise HTTPException(status_code=404, detail="Destination not found")
