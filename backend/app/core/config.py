import os
from pathlib import Path
from dataclasses import dataclass, field


def load_env_file(path: Path) -> None:
    """Load KEY=VALUE lines from a .env file into os.environ.

    Real environment variables (e.g. set on Render) always win over the file, so
    production behaviour is unchanged. A missing file is fine.
    """
    try:
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except OSError:
        return
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip().removeprefix("export ").strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key:
            os.environ.setdefault(key, value)


# backend/.env, found relative to this file so it works from any working directory.
load_env_file(Path(__file__).resolve().parents[2] / ".env")

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

    gemini_api_key: str | None = field(default_factory=lambda: os.getenv("GEMINI_API_KEY") or None)
    gemini_model: str = field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-3.6-flash"))


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


@dataclass(frozen=True)
class GeminiSettings:
    """Gemini API (AI Studio free tier). Optional: without a key the advisor stays rule-based."""
    api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", "").strip())
    # Change this if Google retires the default; no code change needed.
    model: str = field(default_factory=lambda: os.getenv("GEMINI_MODEL", "").strip() or "gemini-2.5-flash")
    # Kept short: the advisor falls back to rules rather than making the user wait.
    timeout_s: float = field(default_factory=lambda: min(30.0, max(2.0, _float_env("GEMINI_TIMEOUT_S", 8.0))))

    @property
    def configured(self) -> bool:
        return bool(self.api_key)


@dataclass(frozen=True)
class DatabaseSettings:
    """Aiven PostgreSQL connection. Empty means no database: the app serves the committed
    JSON seed and keeps bookings in a local SQLite file (the pre-database behaviour)."""
    url: str = field(default_factory=lambda: os.getenv("DATABASE_URL", "").strip())

    @property
    def configured(self) -> bool:
        return bool(self.url)


settings = Settings()
db_settings = DatabaseSettings()
paypal_settings = PayPalSettings()
gemini_settings = GeminiSettings()
