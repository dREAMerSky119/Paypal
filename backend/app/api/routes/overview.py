from fastapi import APIRouter

from app.services import bookings, inventory as inv, packages
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
    journeys = []
    for pkg in packages.list_packages()["items"][:8]:
        paid = bookings.paid_for_package(pkg["package_id"])
        journeys.append({
            "id": pkg["package_id"], "package_id": pkg["package_id"], "place": pkg["title"],
            "destination": pkg["destination_slug"], "start_date": pkg["start_date"], "end_date": pkg["end_date"],
            "travellers": pkg["travellers"], "sell_usd": pkg["sell_usd"],
            "status": "Deposit paid" if paid else "Saved", "tone": "sage" if paid else "blue",
            "booking_id": paid["id"] if paid else None,
        })
    return {**body, "metrics": metrics, "journeys": journeys, "is_sample": True}
