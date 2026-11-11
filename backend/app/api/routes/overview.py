from fastapi import APIRouter

from app.services import inventory as inv
from app.services.seed import load_json

router = APIRouter(tags=["overview"])


@router.get("/overview")
def overview() -> dict:
    """Overview dashboard payload. Seeded sample data until features 2-6 land.
    The supplier card is computed from the inventory store, so it always agrees
    with /app/inventory."""
    body = load_json("overview_seed.json")
    st = inv.state()
    n_dest = len({i["destination"] for i in st["items"]})
    metrics = []
    for m in body["metrics"]:
        if m["key"] == "suppliers":
            # No period-over-period figure exists for real inventory yet, so no
            # "change" is claimed (the UI hides the arrow when it is empty).
            m = {**m, "value": str(len(st["suppliers"])), "change": "",
                 "detail": f"{len(st['items'])} bookable items across {n_dest} destinations"}
        metrics.append(m)
    return {**body, "metrics": metrics, "is_sample": True}
