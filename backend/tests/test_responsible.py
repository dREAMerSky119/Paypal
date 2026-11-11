from app.services import responsible


def test_supplier_scores_match_verified_claim_points():
    result = responsible.overview()
    assert result["total_suppliers"] == 171
    assert result["scored_suppliers"] > 0
    assert result["not_yet_verified_suppliers"] > 0
    for partner in result["partners"]:
        verified_sum = sum(c["possible_points"] for c in partner["claims"] if c["status"] == "verified")
        if partner["score"] is None:
            assert verified_sum == 0
        else:
            assert partner["score"] == min(100, verified_sum)
            assert partner["score_consistent_with_csv"] is True


def test_destination_average_excludes_unverified_partners():
    result = responsible.overview()
    for destination in result["destinations"]:
        partners = [p for p in result["partners"] if p["destination_slug"] == destination["slug"]]
        scored = [p["score"] for p in partners if p["score"] is not None]
        expected = round(sum(scored) / len(scored), 1) if scored else None
        assert destination["average_score"] == expected
        assert destination["supplier_count"] == len(partners)


def test_unverified_and_self_reported_claims_earn_zero_points():
    result = responsible.overview()
    for partner in result["partners"]:
        for claim in partner["claims"]:
            if claim["status"] in ("self_reported", "unverified"):
                assert claim["points"] == 0


def test_carbon_estimate_and_breakdown():
    result = responsible.calculate_carbon({
        "flight_km": 5000, "rail_km": 100, "road_km": 50,
        "hotel_nights": 4, "travellers": 2,
    })
    assert result["total_kg"] == 634.0
    assert result["per_traveller_kg"] == 317.0
    assert set(result["components_kg"]) == {"flights", "rail", "road", "accommodation"}


def test_carbon_validation_is_readable():
    try:
        responsible.calculate_carbon({"flight_km": 999999, "travellers": 1})
        assert False, "Expected validation error"
    except ValueError as exc:
        assert "between 0 and 50,000" in str(exc)


def test_carbon_rejects_non_finite_values():
    try:
        responsible.calculate_carbon({"flight_km": float("nan"), "travellers": 1})
        assert False, "Expected validation error"
    except ValueError as exc:
        assert "finite number" in str(exc)


def test_api_carbon_invalid_input_returns_400_not_422():
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    response = client.post("/api/responsible/carbon", json={"flight_km": 999999, "travellers": 1})
    assert response.status_code == 400
    assert "between 0 and 50,000" in response.json()["detail"]


def test_api_returns_supplier_scores():
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    response = client.get("/api/responsible/partners")
    assert response.status_code == 200
    assert response.json()["total_suppliers"] == 171


# ---- Royal Stay Collection (Feature 8 redesign) ---------------------------------

def test_stay_collection_returns_only_accommodation_records():
    data = responsible.list_stays()
    assert data["count"] == 72
    assert all(item["is_sample"] for item in data["items"])
    assert all(item["image_url"].startswith("https://images.unsplash.com/") for item in data["items"])


def test_stay_collection_uses_editorial_copy_not_impact_claims():
    data = responsible.list_stays()
    assert all(item["editorial_note"] for item in data["items"])
    forbidden = ("reduces carbon", "supports local", "community benefit", "eco-certified")
    assert not any(term in item["editorial_note"].lower() for item in data["items"] for term in forbidden)


def test_stay_collection_filters_destination():
    destination = responsible.list_stays()["items"][0]["destination"]
    filtered = responsible.list_stays(destination=destination)
    assert filtered["count"] > 0
    assert all(item["destination"] == destination for item in filtered["items"])


def test_stay_collection_search_is_case_insensitive():
    name = responsible.list_stays()["items"][0]["name"].split()[0]
    filtered = responsible.list_stays(q=name.upper())
    assert filtered["count"] > 0
    assert all(name.lower() in item["name"].lower() for item in filtered["items"])


def test_scoring_and_stays_coexist():
    """The Royal redesign must not remove the verified-claim scoring model."""
    assert responsible.overview()["total_suppliers"] == 171
    assert responsible.destination_detail("kyoto-japan") is not None
    assert responsible.list_stays()["count"] == 72


def test_api_returns_stay_collection():
    from fastapi.testclient import TestClient
    from app.main import app
    client = TestClient(app)
    response = client.get("/api/responsible/stays")
    assert response.status_code == 200
    assert response.json()["count"] == 72
    assert client.get("/api/responsible/partners").json()["total_suppliers"] == 171
