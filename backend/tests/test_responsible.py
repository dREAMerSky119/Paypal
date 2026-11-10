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
