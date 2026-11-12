"""Start a PayPal checkout for a trip. Shared by the payments route and the agent.

This module can create an order and a booking row. It can never capture one: only the
buyer approving in PayPal, followed by the capture endpoint, moves money. The price is
always recomputed here from inventory; callers cannot supply an amount.
"""
from app.services import advisor, bookings, packages, paypal


class CheckoutError(Exception):
    """A checkout could not be started. `status` is the HTTP status a route should use."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def start_checkout(raw_constraints: dict) -> dict:
    if not paypal.is_configured():
        raise CheckoutError(503, "PayPal sandbox keys are not configured on the server")
    try:
        constraints = advisor.validate(dict(raw_constraints))
        missing = advisor.missing_fields(constraints)
        if missing:
            raise CheckoutError(422, f"Missing trip details: {', '.join(missing)}")
        proposal = advisor.plan(constraints)
    except advisor.AdvisorError as e:
        raise CheckoutError(422, str(e)) from e

    sell = proposal["totals"]["sell_usd"]
    if sell <= 0:
        raise CheckoutError(422, "This trip has no payable amount")
    deposit = paypal.deposit_for(sell)
    booking_id = bookings.new_id()
    try:
        order = paypal.create_order(
            deposit,
            reference_id=booking_id,
            custom_id=booking_id,
            description=f"Wayfare deposit: {proposal['nights']} nights, {proposal['destination']}",
        )
    except paypal.PayPalError as e:
        raise CheckoutError(502, str(e)) from e
    booking = bookings.create(booking_id, order["id"], constraints, proposal, sell, float(deposit))
    return {
        "booking_id": booking["id"], "order_id": order["id"], "currency": paypal.CURRENCY,
        "sell_usd": sell, "deposit_usd": float(deposit), "balance_usd": booking["balance_usd"],
        "is_sample": True,
    }


def start_package_checkout(package_id: str) -> dict:
    """Open a PayPal order for the deposit on a saved package.

    The amount comes from the quote stored with the package on the server; the client only names
    the package. Like start_checkout, this can never capture.
    """
    if not paypal.is_configured():
        raise CheckoutError(503, "PayPal sandbox keys are not configured on the server")
    saved = packages.get(package_id)
    if saved is None:
        raise CheckoutError(404, "Package not found")
    if bookings.paid_for_package(package_id):
        raise CheckoutError(409, "This package already has a paid deposit")
    try:
        quote = packages.quote_package(saved["payload"])
    except packages.PackageQuoteError as e:
        raise CheckoutError(422, str(e)) from e
    sell = quote["totals"]["sell_usd"]
    if not sell or sell <= 0:
        raise CheckoutError(422, "This package has no payable amount. Add stays or experiences first.")
    deposit = paypal.deposit_for(sell)
    booking_id = bookings.new_id()
    payload = saved["payload"]
    try:
        order = paypal.create_order(
            deposit, reference_id=booking_id, custom_id=booking_id,
            description=f"Wayfare deposit: {payload.get('title') or 'Journey'} ({package_id})",
        )
    except paypal.PayPalError as e:
        raise CheckoutError(502, str(e)) from e
    constraints = {"package_id": package_id, "destination": payload.get("destination"),
                   "nights": payload.get("nights"), "travellers": payload.get("travellers")}
    proposal = {"title": payload.get("title"), "destination": payload.get("destination"),
                "nights": payload.get("nights"), "totals": {"sell_usd": sell}}
    booking = bookings.create(booking_id, order["id"], constraints, proposal, sell, float(deposit))
    return {"booking_id": booking["id"], "order_id": order["id"], "currency": paypal.CURRENCY,
            "sell_usd": sell, "deposit_usd": float(deposit), "balance_usd": booking["balance_usd"]}
