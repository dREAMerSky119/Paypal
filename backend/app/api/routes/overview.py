import logging

from fastapi import APIRouter

from app.services import bookings, inventory as inv, packages
from app.services.seed import load_json

log = logging.getLogger(__name__)
router = APIRouter(tags=["overview"])


@router.get("/overview")
def overview() -> dict:
    """Overview dashboard payload. Seeded sample data, with the supplier card and the
    journeys list computed from the inventory and saved-package stores.

    This is the landing page, so it must never 500: if the package/booking database (or the
    inventory store) is unreachable, that section degrades to the seed / an empty list and the
    rest of the page still loads. (A 500 would also reach the browser without CORS headers and
    be shown as "We could not reach the server".)"""
    body = load_json("overview_seed.json")

    metrics = list(body["metrics"])
    try:
        st = inv.state()
        n_dest = len({i["destination"] for i in st["items"]})
        # No period-over-period figure exists for real inventory yet, so no "change" is
        # claimed (the UI hides the arrow when it is empty).
        metrics = [
            {**m, "value": str(len(st["suppliers"])), "change": "",
             "detail": f"{len(st['items'])} bookable items across {n_dest} destinations"}
            if m["key"] == "suppliers" else m
            for m in metrics
        ]
    except Exception:  # noqa: BLE001 - keep the seeded supplier card
        log.exception("Overview: inventory section failed")

    journeys = []
    try:
        for pkg in packages.list_packages()["items"][:8]:
            try:
                paid = bookings.paid_for_package(pkg["package_id"])
            except Exception:  # noqa: BLE001 - show the package as Saved if bookings are unreadable
                log.exception("Overview: booking lookup failed for %s", pkg["package_id"])
                paid = None
            journeys.append({
                "id": pkg["package_id"], "package_id": pkg["package_id"], "place": pkg["title"],
                "destination": pkg["destination_slug"],
                "start_date": str(pkg["start_date"]) if pkg.get("start_date") else None,
                "end_date": str(pkg["end_date"]) if pkg.get("end_date") else None,
                "travellers": pkg["travellers"], "sell_usd": pkg["sell_usd"],
                "status": "Deposit paid" if paid else "Saved", "tone": "sage" if paid else "blue",
                "booking_id": paid["id"] if paid else None,
            })
    except Exception:  # noqa: BLE001 - empty journeys list; the UI shows its empty state
        log.exception("Overview: saved-packages section failed")
        journeys = []
    return {**body, "metrics": metrics, "journeys": journeys, "is_sample": True}
