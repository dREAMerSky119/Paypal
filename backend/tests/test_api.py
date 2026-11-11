from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root_names_wayfare_api():
    assert client.get("/").json()["service"] == "Wayfare API"


def test_health():
    assert client.get("/api/health").json() == {"status": "ok"}


def test_destinations_list_has_all_twelve():
    body = client.get("/api/destinations").json()
    assert body["count"] == 12
    assert body["is_sample"] is True
    assert {"slug", "name", "country", "related"} <= set(body["items"][0])


def test_destination_detail_and_404():
    assert client.get("/api/destinations/kyoto-japan").json()["name"] == "Kyoto"
    assert client.get("/api/destinations/atlantis").status_code == 404


def test_related_slugs_point_to_real_destinations():
    items = client.get("/api/destinations").json()["items"]
    slugs = {d["slug"] for d in items}
    for d in items:
        assert set(d["related"]) <= slugs


def test_overview_shape():
    body = client.get("/api/overview").json()
    assert body["is_sample"] is True
    assert len(body["metrics"]) == 4
    assert len(body["trend"]["labels"]) == len(body["trend"]["values"])
    assert all("departure_offset_days" in j for j in body["journeys"])


def test_cors_allows_local_frontend():
    r = client.options(
        "/api/health",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_known_typo_stays_fixed_in_destination_seed():
    """The 'Lad in' typo is kept as an anomaly-detector fixture, not as live data."""
    import json
    from pathlib import Path

    raw = (Path(__file__).parent.parent / "app" / "data" / "destinations.json").read_text()
    assert "Lad in" not in raw
    fixture = json.loads((Path(__file__).parent / "fixtures" / "destinations_typo.json").read_text())
    assert fixture["text"] == "Lad in and Tyrolean culture"
