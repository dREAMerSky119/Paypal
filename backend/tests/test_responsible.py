<<<<<<< HEAD

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
=======
from app.services.responsible import registry, score_partner, carbon_estimate


def test_registry_covers_every_destination():
    from app.services.seed import load_json
    slugs = {d['slug'] for d in load_json('destinations.json')}
    assert slugs == {p['destination_slug'] for p in registry()}


def test_unverified_claims_never_raise_score_or_badge():
    partner = registry()[0]
    result = score_partner(partner)
    assert result['score'] == 0
    assert result['verified_claim_count'] == 0
    assert result['badge_eligible'] is False


def test_verified_claims_are_weighted_and_require_evidence_url():
    partner = dict(registry()[0])
    partner['claims'] = [
        {'type':'local_ownership','status':'verified','evidence_url':'https://example.org/proof'},
        {'type':'community_benefit','status':'verified','evidence_url':'https://example.org/proof'},
        {'type':'environmental_practice','status':'verified','evidence_url':'https://example.org/proof'},
        {'type':'certification','certification':'Green Key','status':'verified','evidence_url':'https://example.org/cert'},
    ]
    result = score_partner(partner)
    assert result['score'] == 100
    assert result['badge_eligible'] is True
    partner['claims'][0]['evidence_url'] = ''
    assert score_partner(partner)['score'] == 70


def test_carbon_estimate_and_swap_are_deterministic():
    result = carbon_estimate({'country':'India','flight_km':1000,'rail_km':100,'road_km':50,'hotel_nights':2})
    assert result['total_kg_co2e'] == round(117.04 + 3.549 + 8.5 + 40, 2)
    assert result['is_approximate'] is True
    assert result['swap_suggestion']['estimated_saving_kg_co2e'] > 0


def test_zero_distance_has_no_swap():
    result = carbon_estimate({'country':'Japan','flight_km':0,'rail_km':0,'road_km':0,'hotel_nights':0})
    assert result['total_kg_co2e'] == 0
    assert result['swap_suggestion'] is None
>>>>>>> fe70b5b (Add updated project files final one)
