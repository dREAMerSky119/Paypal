import os
from dataclasses import dataclass, field


def _split_csv(value: str) -> list[str]:
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = "Wayfare API"
    version: str = "0.1.0"
    # Comma-separated list of allowed frontend origins, e.g.
    # "http://localhost:5173,https://your-app.vercel.app"
    cors_origins: list[str] = field(
        default_factory=lambda: _split_csv(
            os.getenv("FRONTEND_URL", "http://localhost:5173")
        )
    )
    # Optional regex, e.g. r"https://your-app-.*\.vercel\.app" for Vercel preview URLs
    cors_origin_regex: str | None = field(
        default_factory=lambda: os.getenv("CORS_ORIGIN_REGEX") or None
    )


def _float_env(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return default


@dataclass(frozen=True)
class PayPalSettings:
    """PayPal sandbox credentials. Sandbox only: live mode is deliberately unsupported."""
    client_id: str = field(default_factory=lambda: os.getenv("PAYPAL_CLIENT_ID", "").strip())
    client_secret: str = field(default_factory=lambda: os.getenv("PAYPAL_CLIENT_SECRET", "").strip())
    # Share of the server-computed trip price charged up front, in percent (1-100).
    deposit_pct: float = field(default_factory=lambda: min(100.0, max(1.0, _float_env("DEPOSIT_PCT", 30.0))))
    # SQLite file for bookings. Empty means a file in the OS temp dir.
    bookings_db: str = field(default_factory=lambda: os.getenv("BOOKINGS_DB", "").strip())

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret)


settings = Settings()
paypal_settings = PayPalSettings()
