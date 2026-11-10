import os
from pathlib import Path
from dataclasses import dataclass, field

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
except ImportError:
    pass


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


settings = Settings()
