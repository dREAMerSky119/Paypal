import logging

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings

log = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)



@app.middleware("http")
async def security_headers(request, call_next):
    """Cheap hardening for an API that only returns JSON."""
    try:
        response = await call_next(request)
    except Exception:  # noqa: BLE001 - turn crashes into a JSON 500 that still passes through CORS below
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        response = JSONResponse({"detail": "Internal server error"}, status_code=500)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if request.method != "GET":
        response.headers.setdefault("Cache-Control", "no-store")
    return response


# Added last so it is the OUTERMOST middleware: every response, including a 500 from a crashed
# route, carries CORS headers. Otherwise the browser hides the real error behind
# "We could not reach the server".
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": settings.app_name, "docs": "/docs", "health": "/api/health"}
