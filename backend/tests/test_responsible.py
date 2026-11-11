import pytest

from app.services import responsible


def test_stay_registry_returns_only_accommodation_records():
    data = responsible.list_stays()
    assert data["count"] == 72
    assert all(item["is_sample"] for item in data["items"])
    assert all(item["image_url"].startswith("https://images.unsplash.com/") for item in data["items"])


def test_stay_registry_includes_editorial_copy_not_impact_claims():
    data = responsible.list_stays()
    assert all(item["editorial_note"] for item in data["items"])
    forbidden = ("reduces carbon", "supports local", "community benefit", "eco-certified")
    assert not any(term in item["editorial_note"].lower() for item in data["items"] for term in forbidden)


def test_stay_registry_filters_destination():
    all_data = responsible.list_stays()
    destination = all_data["items"][0]["destination"]
    filtered = responsible.list_stays(destination=destination)
    assert filtered["count"] > 0
    assert all(item["destination"] == destination for item in filtered["items"])


def test_stay_registry_search_is_case_insensitive():
    all_data = responsible.list_stays()
    name = all_data["items"][0]["name"].split()[0]
    filtered = responsible.list_stays(q=name.upper())
    assert filtered["count"] > 0
    assert all(name.lower() in item["name"].lower() for item in filtered["items"])


def test_carbon_estimate_matches_reference_example():
    result = responsible.carbon_estimate({
        "flight_km": 5000, "rail_km": 100, "road_km": 50,
        "hotel_nights": 4, "travellers": 2,
    })
    assert result["total_kg"] == 634.0
    assert result["per_traveller_kg"] == 317.0


def test_carbon_estimate_returns_component_breakdown():
    result = responsible.carbon_estimate({
        "flight_km": 1000, "rail_km": 100, "road_km": 50,
        "hotel_nights": 2, "travellers": 1,
    })
    assert set(result["components_kg"]) == {"flights", "rail", "road", "accommodation"}
    assert result["total_kg"] == sum(result["components_kg"].values())


@pytest.mark.parametrize("payload", [
    {"flight_km": -1},
    {"rail_km": 50001},
    {"road_km": float("nan")},
    {"hotel_nights": 366},
    {"travellers": 0},
    {"travellers": True},
])
def test_carbon_rejects_invalid_values(payload):
    with pytest.raises(ValueError):
        responsible.carbon_estimate(payload)
