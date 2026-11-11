import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Query, Request

from app.services import inventory as inv

router = APIRouter(tags=["inventory"])

# Import is the only write endpoint, so it gets a small per-client limit.
IMPORT_LIMIT, IMPORT_WINDOW_S = 10, 60
_import_hits: dict[str, deque] = defaultdict(deque)


def _bad_request(e: inv.InventoryError) -> HTTPException:
    return HTTPException(status_code=422, detail=str(e))


@router.get("/inventory/meta")
def inventory_meta() -> dict:
    """Filter options and row counts, so the UI never hard-codes them."""
    return inv.meta()


@router.get("/inventory")
def list_inventory(
    destination: str | None = None,
    type: str | None = None,
    tier: str | None = None,
    price_band: str | None = None,
    q: str | None = Query(None, max_length=100),
    sort: str = "name",
    page: int = 1,
    page_size: int = 25,
) -> dict:
    try:
        return inv.search_items(destination, type, tier, price_band, q, sort, page, page_size)
    except inv.InventoryError as e:
        raise _bad_request(e)


@router.get("/inventory/points")
def inventory_points(
    destination: str | None = None,
    type: str | None = None,
    tier: str | None = None,
    price_band: str | None = None,
    q: str | None = Query(None, max_length=100),
) -> dict:
    """All matches as lightweight map markers; same filters as /inventory."""
    try:
        return inv.map_points(destination, type, tier, price_band, q)
    except inv.InventoryError as e:
        raise _bad_request(e)


@router.post("/inventory/import")
async def import_inventory(request: Request, dry_run: bool = False) -> dict:
    """Body is the raw CSV (Content-Type: text/csv). Columns: name, destination,
    type, tier, currency, net_price, lat, lon; optional supplier, category, unit, capacity."""
    client = request.client.host if request.client else "unknown"
    now, hits = time.monotonic(), _import_hits[client]
    while hits and now - hits[0] > IMPORT_WINDOW_S:
        hits.popleft()
    if len(hits) >= IMPORT_LIMIT:
        raise HTTPException(status_code=429, detail="Too many imports, try again in a minute")
    hits.append(now)
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > inv.MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="File is too large")
    body = await request.body()
    try:
        return inv.import_csv(body, dry_run=dry_run)
    except inv.InventoryError as e:
        raise _bad_request(e)


@router.get("/inventory/{item_id}")
def get_inventory_item(item_id: str) -> dict:
    item = inv.get_item(item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


@router.get("/inventory/{item_id}/rates")
def get_inventory_rates(item_id: str) -> dict:
    rates = inv.get_rates(item_id)
    if rates is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return rates


@router.get("/suppliers")
def list_suppliers(
    destination: str | None = None,
    tier: str | None = None,
    q: str | None = Query(None, max_length=100),
    page: int = 1,
    page_size: int = 25,
) -> dict:
    try:
        return inv.search_suppliers(destination, tier, q, page, page_size)
    except inv.InventoryError as e:
        raise _bad_request(e)
