"""Phase D: related spots service and API."""
from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.services import spots as svc

client = TestClient(app)


# ---------------------------------------------------------------- service, near

def test_near_mode_stays_inside_the_destination():
    body = svc.related("dolomites-italy", item="Lago di Braies", mode="near")
    assert body["mode"] == "near"
    assert all(r["destination"] == "dolomites-italy" for r in body["results"])
    names = {r["name"] for r in body["results"]}
    assert "Lago di Braies" not in names  # the anchor is never its own result


def test_near_results_are_ranked_by_distance_with_reasons():
    body = svc.related("dolomites-italy", item="Lago di Braies", mode="near", limit=5)
    dists = [r["distance_km"] for r in body["results"]]
    assert dists == sorted(dists)
    for r in body["results"]:
        assert r["distance_km"] is not None
        assert r["travel_min"] >= 5
        assert r["reason"]
        assert "km away" in r["reason"]


def test_the_dolomites_never_relates_to_kyoto_or_marrakech():
    for mode in ("near", "similar", "day"):
        body = svc.related("dolomites-italy", mode=mode, limit=20)
        assert all(r["destination"] not in ("kyoto-japan", "marrakech-morocco")
                   for r in body["results"]), mode


# ------------------------------------------------------------- service, similar

def test_similar_mode_ranks_textual_matches_across_destinations():
    body = svc.related("dolomites-italy", item="Lago di Braies", mode="similar", limit=8)
    # Below the noise threshold the list is short on purpose: only genuine
    # textual matches (lakes, alpine meadows) survive, not every spot in the corpus.
    assert 1 <= len(body["results"]) <= 8
    top = body["results"][0]
    assert top["score"] > 0
    assert top["reason"].startswith("Shares themes:")
    # every result carries the attribution it will be shown with
    for r in body["results"]:
        assert isinstance(r["attribution"], list)


def test_similar_surface_runs_without_wikimedia_text(monkeypatch):
    """A spot with no knowledge entry and no coordinates must degrade, never raise:
    near drops it (no coords), similar simply has fewer candidates."""
    real_spots, real_knowledge = svc._spots, svc._knowledge
    stripped = [{**s, "lat": None, "lon": None} if s["id"] == "spot_002" else s
                for s in real_spots()]
    monkeypatch.setattr(svc, "_spots", lambda: stripped)
    monkeypatch.setattr(svc, "_knowledge", lambda: {})
    near = svc.related("dolomites-italy", item="Lago di Braies", mode="near", limit=20)
    assert "Tre Cime di Lavaredo" not in {r["name"] for r in near["results"]}  # no coords -> absent from near
    similar = svc.related("dolomites-italy", item="Lago di Braies", mode="similar", limit=20)
    assert "Tre Cime di Lavaredo" not in {r["name"] for r in similar["results"]}  # no shared text -> noise gate
    day = svc.related("dolomites-italy", item="Tre Cime di Lavaredo", mode="day")
    assert "count" in day  # an anchor without coords still answers, just empty-handed


# ------------------------------------------------------------------ service, day

def test_day_mode_respects_travel_time_and_heavy_pairing():
    body = svc.related("dolomites-italy", item="Tre Cime di Lavaredo", mode="day",
                       max_travel_min=45)
    results = body["results"]
    assert results, "the 4–6 hour hike still has nearby companions"
    for r in results:
        assert r["travel_min"] <= 45
        # Tre Cime is a heavy (4–6 h) spot: no other heavy spot may share the day
        spot = next(s for s in svc._spots() if s["id"] == r["spot_id"])
        if svc._is_heavy(spot):
            raise AssertionError(f"heavy spot {spot['name']} paired with a heavy anchor")


def test_day_mode_without_an_item_anchors_on_the_best_known_spot():
    body = svc.related("kyoto-japan", mode="day")
    assert body["anchor"]["destination"] == "kyoto-japan"
    assert body["results"]


# ------------------------------------------------------------------- input errors

def test_unknown_destination_mode_and_items_are_caller_errors():
    assert "Unknown destination" in str(svc.SpotError() if False else _msg(lambda: svc.related("atlantis")))
    assert "Unknown mode" in _msg(lambda: svc.related("kyoto-japan", mode="vibes"))
    assert "Unknown spot" in _msg(lambda: svc.related("kyoto-japan", item="spot_999"))
    assert "belongs to" in _msg(lambda: svc.related("kyoto-japan", item="spot_001"))  # a Dolomites spot


def _msg(fn):
    try:
        fn()
    except svc.SpotError as error:
        return str(error)
    raise AssertionError("expected SpotError")


# --------------------------------------------------------------------------- API

def test_related_endpoint_contract():
    body = client.get("/api/spots/related",
                      params={"destination": "dolomites-italy", "item": "spot_001", "mode": "near"}).json()
    assert body["anchor"] == {"spot_id": "spot_001", "name": "Lago di Braies", "destination": "dolomites-italy"}
    assert body["is_sample"] is True
    assert 0 < body["count"] == len(body["results"]) <= 6
    first = body["results"][0]
    assert {"spot_id", "name", "destination", "category", "distance_km", "travel_min",
            "score", "reason", "attribution", "is_sample"} <= set(first)


def test_related_endpoint_attribution_is_live():
    body = client.get("/api/spots/related",
                      params={"destination": "kyoto-japan", "item": "Fushimi Inari Shrine",
                              "mode": "similar", "limit": 10}).json()
    credited = [r for r in body["results"] if r["attribution"]]
    assert credited, "Fushimi Inari has Wikimedia text; its neighbourhood must carry credit"
    sources = {a["source"] for r in credited for a in r["attribution"]}
    assert sources & {"Wikipedia", "Wikivoyage"}
    for r in credited:
        for a in r["attribution"]:
            assert a["licence"].startswith("CC BY-SA")
            assert a["url"].startswith("https://")


def test_related_endpoint_errors_map_to_400():
    assert client.get("/api/spots/related", params={"destination": "atlantis"}).status_code == 400
    assert client.get("/api/spots/related",
                      params={"destination": "kyoto-japan", "mode": "vibes"}).status_code == 400
    assert client.get("/api/spots/related").status_code == 422  # missing destination
    assert client.get("/api/spots/related",
                      params={"destination": "kyoto-japan", "max_travel_min": 999}).status_code == 422


def test_related_endpoint_day_mode():
    body = client.get("/api/spots/related",
                      params={"destination": "jaipur-india", "mode": "day"}).json()
    assert body["mode"] == "day"
    assert all(r["travel_min"] <= 45 for r in body["results"])


def test_spot_knowledge_seed_is_licenced_for_every_text():
    knowledge = svc._knowledge()
    spots = svc._spots()
    assert {s["id"] for s in spots} <= set(knowledge)  # one entry per spot
    for entry in knowledge.values():
        for source in ("wikipedia", "wikivoyage"):
            if entry.get(source):
                assert entry[source]["licence"].startswith("CC BY-SA")
                assert entry[source]["extract"]
                assert entry[source]["url"].startswith("https://")
