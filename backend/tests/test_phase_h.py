"""Phase H: launch hardening checks that must keep passing in CI."""
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import inventory as inv

ROOT = Path(__file__).resolve().parents[2]
client = TestClient(app)


def test_paypal_client_is_sandbox_only():
    from app.services import paypal
    assert "sandbox" in paypal.BASE_URL
    src = (ROOT / "backend/app/services/paypal.py").read_text()
    assert "api-m.paypal.com" not in src.replace("api-m.sandbox.paypal.com", "")


def test_payments_config_reports_sandbox():
    assert client.get("/api/payments/config").json()["environment"] == "sandbox"


def test_security_headers_present():
    r = client.get("/api/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer"


def test_import_rejects_oversized_declared_body():
    big = b"a" * (inv.MAX_IMPORT_BYTES + 1)
    r = client.post("/api/inventory/import", content=big, headers={"content-type": "text/csv"})
    assert r.status_code == 413


def test_import_rejects_oversized_chunked_body():
    def gen():  # no Content-Length: the streamed cap must still stop it
        for _ in range(inv.MAX_IMPORT_BYTES // 100_000 + 2):
            yield b"a" * 100_000
    r = client.post("/api/inventory/import", content=gen(), headers={"content-type": "text/csv"})
    assert r.status_code == 413


def test_import_rate_limited():
    from app.api.routes import inventory as route
    route._import_hits.clear()
    codes = [client.post("/api/inventory/import?dry_run=true", content=b"x", headers={"content-type": "text/csv"}).status_code
             for _ in range(route.IMPORT_LIMIT + 1)]
    route._import_hits.clear()
    assert codes[-1] == 429 and 429 not in codes[:-1]


def test_payment_orders_rate_limited(monkeypatch):
    from app.api.routes import payments as route
    route._hits.clear()
    codes = [client.post("/api/payments/orders", json={"constraints": {}}).status_code for _ in range(route.LIMIT + 1)]
    route._hits.clear()
    assert codes[-1] == 429


def test_advisor_endpoints_are_rate_limited():
    src = (ROOT / "backend/app/api/routes/advisor.py").read_text()
    assert src.count("_guard(") >= 3


SECRET_PATTERNS = [r"AIza[0-9A-Za-z_\-]{20,}", r"-----BEGIN [A-Z ]*PRIVATE KEY-----", r"postgres(ql)?://[^\s\"']+:[^\s\"']+@",
                   r"PAYPAL_CLIENT_SECRET\s*[:=]\s*[\"'][^\"']+[\"']", r"sk-[A-Za-z0-9]{20,}"]


def test_no_secrets_in_frontend_source():
    hits = []
    for path in (ROOT / "frontend/src").rglob("*"):
        if path.suffix in {".js", ".jsx", ".css", ".json"} and path.is_file():
            text = path.read_text(errors="ignore")
            hits += [f"{path.name}: {p}" for p in SECRET_PATTERNS if re.search(p, text)]
    assert not hits


def test_frontend_reads_only_vite_api_url():
    envs = set()
    for path in (ROOT / "frontend/src").rglob("*.js*"):
        envs |= set(re.findall(r"import\.meta\.env\.(\w+)", path.read_text(errors="ignore")))
    assert envs <= {"VITE_API_URL", "MODE", "DEV", "PROD", "BASE_URL", "VITE_PAYPAL_CLIENT_ID"}, envs


def test_readme_documents_every_env_var():
    """Every env var the backend reads must appear in the README."""
    names = set()
    for path in (ROOT / "backend/app").rglob("*.py"):
        text = path.read_text()
        names |= set(re.findall(r"(?:getenv|_float_env|environ\.get)\(\s*\"([A-Z][A-Z0-9_]+)\"", text))
    names |= {"VITE_API_URL"}
    readme = (ROOT / "README.md").read_text()
    missing = sorted(n for n in names if n not in readme)
    assert not missing, f"undocumented env vars: {missing}"


def test_attribution_covers_plan_sources_in_docs():
    text = (ROOT / "docs/data-sources.md").read_text()
    for name in ["Overture", "Wikipedia", "Wikivoyage", "OpenStreetMap", "UK GHG", "ECB", "World Bank", "Open-Meteo"]:
        assert name in text, name


def test_render_trusts_proxy_headers_for_rate_limits():
    assert "--proxy-headers" in (ROOT / "render.yaml").read_text()
