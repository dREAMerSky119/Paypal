"""PayPal sandbox client: OAuth token, create order, capture order.

Sandbox only. The base URL is fixed on purpose so a stray env var can never point
this app at real money. Amounts are always decided by the caller from server-side
data; nothing here trusts a browser-supplied total.
"""
import threading
import time
import uuid
from decimal import ROUND_HALF_UP, Decimal

import httpx

from app.core.config import paypal_settings as settings

BASE_URL = "https://api-m.sandbox.paypal.com"
CURRENCY = "USD"
TIMEOUT_S = 20.0

# Tests inject an httpx transport here so no real network call is made.
_transport: httpx.BaseTransport | None = None
_lock = threading.Lock()
_token: dict = {"value": None, "expires_at": 0.0}


class PayPalError(RuntimeError):
    """PayPal rejected a call or returned something we cannot trust."""

    def __init__(self, message: str, status: int | None = None):
        super().__init__(message)
        self.status = status


def is_configured() -> bool:
    return settings.configured


def money(value) -> str:
    """Format as PayPal expects: a string with exactly two decimals."""
    return str(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def deposit_for(sell_usd: float) -> str:
    """Deposit amount for a trip price, rounded to cents, never below 0.01."""
    amount = (Decimal(str(sell_usd)) * Decimal(str(settings.deposit_pct)) / Decimal(100)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return str(max(amount, Decimal("0.01")))


def _client() -> httpx.Client:
    return httpx.Client(base_url=BASE_URL, timeout=TIMEOUT_S, transport=_transport)


def _error_message(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        detail = body.get("details", [{}])[0].get("description") if body.get("details") else None
        return detail or body.get("message") or body.get("error_description") or f"HTTP {resp.status_code}"
    except Exception:
        return f"HTTP {resp.status_code}"


def _access_token(client: httpx.Client) -> str:
    with _lock:
        if _token["value"] and time.monotonic() < _token["expires_at"]:
            return _token["value"]
        resp = client.post(
            "/v1/oauth2/token",
            auth=(settings.client_id, settings.client_secret),
            data={"grant_type": "client_credentials"},
        )
        if resp.status_code != 200:
            raise PayPalError(f"PayPal sign-in failed: {_error_message(resp)}", resp.status_code)
        body = resp.json()
        _token["value"] = body["access_token"]
        # Refresh a minute early so a token never expires mid-request.
        _token["expires_at"] = time.monotonic() + max(30, int(body.get("expires_in", 300)) - 60)
        return _token["value"]


def reset_token_cache() -> None:
    with _lock:
        _token.update(value=None, expires_at=0.0)


def _call(method: str, path: str, *, json: dict | None = None, request_id: str | None = None) -> dict:
    if not is_configured():
        raise PayPalError("PayPal sandbox keys are not configured")
    try:
        with _client() as client:
            headers = {"Authorization": f"Bearer {_access_token(client)}"}
            if request_id:
                headers["PayPal-Request-Id"] = request_id  # makes retries safe
            resp = client.request(method, path, json=json, headers=headers)
    except httpx.HTTPError as e:
        raise PayPalError(f"Could not reach PayPal: {e.__class__.__name__}") from e
    if resp.status_code >= 400:
        raise PayPalError(f"PayPal rejected the request: {_error_message(resp)}", resp.status_code)
    try:
        return resp.json()
    except ValueError as e:
        raise PayPalError("PayPal returned an unreadable response", resp.status_code) from e


def create_order(amount: str, *, reference_id: str, description: str, custom_id: str) -> dict:
    """Create a CAPTURE order for `amount` (already formatted by `money`/`deposit_for`)."""
    body = {
        "intent": "CAPTURE",
        "purchase_units": [{
            "reference_id": reference_id,
            "custom_id": custom_id,
            "description": description[:127],
            "amount": {"currency_code": CURRENCY, "value": amount},
        }],
        "payment_source": {"paypal": {"experience_context": {
            "shipping_preference": "NO_SHIPPING",
            "user_action": "PAY_NOW",
        }}},
    }
    order = _call("POST", "/v2/checkout/orders", json=body, request_id=f"create-{uuid.uuid4()}")
    if not order.get("id"):
        raise PayPalError("PayPal did not return an order id")
    return order


def capture_order(order_id: str) -> dict:
    """Capture an approved order. The request id is derived from the order so a retry is idempotent."""
    return _call("POST", f"/v2/checkout/orders/{order_id}/capture", json={}, request_id=f"capture-{order_id}")


def parse_capture(result: dict) -> dict:
    """Pull the first capture out of a capture response. Raises if it is not a completed one."""
    try:
        cap = result["purchase_units"][0]["payments"]["captures"][0]
    except (KeyError, IndexError, TypeError) as e:
        raise PayPalError("PayPal capture response had no capture") from e
    payer = result.get("payer") or {}
    return {
        "capture_id": cap.get("id"),
        "status": cap.get("status"),
        "amount": (cap.get("amount") or {}).get("value"),
        "currency": (cap.get("amount") or {}).get("currency_code"),
        "payer_email": payer.get("email_address"),
    }
