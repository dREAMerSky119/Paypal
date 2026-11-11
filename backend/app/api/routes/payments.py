import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.services import bookings, checkout, paypal

router = APIRouter(tags=["payments"])

LIMIT, WINDOW_S = 20, 60
_hits: dict[str, deque] = defaultdict(deque)


class OrderRequest(BaseModel):
    """Trip constraints only. There is deliberately no amount field: the price is
    recomputed on the server, and anything extra the client sends is ignored."""
    constraints: dict


class PackageOrderRequest(BaseModel):
    """Only the package id: the amount is read from the stored, server-priced quote."""
    package_id: str


def _rate_limit(request: Request) -> None:
    now = time.monotonic()
    q = _hits[request.client.host if request.client else "anon"]
    while q and now - q[0] > WINDOW_S:
        q.popleft()
    if len(q) >= LIMIT:
        raise HTTPException(status_code=429, detail="Too many requests, try again in a minute")
    q.append(now)


def _require_paypal() -> None:
    if not paypal.is_configured():
        raise HTTPException(status_code=503, detail="PayPal sandbox keys are not configured on the server")


@router.get("/payments/config")
def payments_config() -> dict:
    """Public settings the checkout button needs. The client id is public by design; the secret never leaves the server."""
    return {
        "configured": paypal.is_configured(),
        "client_id": paypal.settings.client_id if paypal.is_configured() else None,
        "environment": "sandbox",
        "currency": paypal.CURRENCY,
        "deposit_pct": paypal.settings.deposit_pct,
    }


@router.post("/payments/orders")
def create_order(body: OrderRequest, request: Request) -> dict:
    """Plan the trip from inventory, then open a PayPal order for the deposit."""
    _rate_limit(request)
    try:
        return checkout.start_checkout(body.constraints)
    except checkout.CheckoutError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)


@router.post("/payments/package-orders")
def create_package_order(body: PackageOrderRequest, request: Request) -> dict:
    """Open a PayPal order for the deposit on a saved package."""
    _rate_limit(request)
    try:
        return checkout.start_package_checkout(body.package_id)
    except checkout.CheckoutError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)


@router.get("/payments/packages/{package_id}/booking")
def package_booking(package_id: str) -> dict:
    """The paid booking for a package, or null."""
    booking = bookings.paid_for_package(package_id)
    return {"booking": bookings.public_view(booking) if booking else None}


@router.post("/payments/orders/{order_id}/capture")
def capture_order(order_id: str, request: Request) -> dict:
    """Capture an order the buyer approved. Only orders this server created can be captured."""
    _rate_limit(request)
    _require_paypal()
    booking = bookings.get_by_order(order_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Unknown order")
    if booking["status"] == bookings.STATUS_PAID:
        return bookings.public_view(booking)  # already captured: a retry must not charge twice
    try:
        cap = paypal.parse_capture(paypal.capture_order(order_id))
    except paypal.PayPalError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if cap["status"] != "COMPLETED":
        raise HTTPException(status_code=502, detail=f"Payment was not completed (status: {cap['status']})")
    if cap["currency"] != paypal.CURRENCY or cap["amount"] != paypal.money(booking["deposit_usd"]):
        # Never mark a booking paid for an amount we did not ask for.
        raise HTTPException(status_code=502, detail="Captured amount did not match the deposit, booking not confirmed")
    return bookings.public_view(bookings.mark_paid(booking["id"], cap["capture_id"], cap["payer_email"]))


@router.get("/payments/bookings/{booking_id}")
def get_booking(booking_id: str) -> dict:
    booking = bookings.get(booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found")
    return bookings.public_view(booking)
