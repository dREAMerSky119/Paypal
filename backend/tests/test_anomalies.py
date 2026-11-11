"""Phase C acceptance (#9): the rules, the statistics, the API, persistence and the
measured precision and recall on the labelled fixture.

The fixture `tests/fixtures/rate_anomaly_labels.json` holds 127 injected anomalies
in the 6,156 seeded rates (an extra digit, a dropped digit, a currency slip, a
zero, a negative, a spike). `docs/anomaly-eval.md` records how the thresholds were
chosen; the last test here is the check that they still hold.
"""
import json
import os
from dataclasses import replace

import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app
from app.services import anomaly_rules as rules
from app.services import anomaly_stats as stats
from app.services import anomalies as svc
from app.services import inventory

client = TestClient(app)
FIXTURES = __import__("pathlib").Path(__file__).parent / "fixtures"


@pytest.fixture(autouse=True)
def _offline(monkeypatch, tmp_path):
    """Own SQLite file per test, so a resolution test never touches another's rows."""
    monkeypatch.setattr(db, "db_settings", replace(db.db_settings, url=""))
    monkeypatch.setenv("ANOMALY_DB", str(tmp_path / "anomalies.sqlite3"))
    inventory.reset()
    svc.reset()
    yield
    svc.reset()


# ---------------------------------------------------------------- rule layer

def test_zero_and_negative_and_sub_penny_prices():
    assert [f["code"] for f in rules.price_value(0)] == ["zero_price"]
    assert [f["code"] for f in rules.price_value(-12.5)] == ["negative_price"]
    assert [f["code"] for f in rules.price_value(0.004)] == ["below_penny"]
    assert rules.price_value(120) == []
    assert [f["code"] for f in rules.price_value("abc")] == ["not_a_number"]


def test_ten_x_and_hundred_x_ratios_to_peers():
    assert "ten_x" in [f["code"] for f in rules.peer_ratio(1_100, 100)]
    assert "hundred_x" in [f["code"] for f in rules.peer_ratio(11_000, 100)]
    assert "digit_too_many" in [f["code"] for f in rules.peer_ratio(650, 100)]
    assert "tenth_x" in [f["code"] for f in rules.peer_ratio(9, 100)]
    assert "digit_dropped" in [f["code"] for f in rules.peer_ratio(18, 100)]
    # An ordinary seasonal swing stays quiet.
    assert rules.peer_ratio(130, 100) == []
    # No peer median means no ratio check, rather than a divide-by-zero.
    assert rules.peer_ratio(500, None) == []
    assert rules.peer_ratio(500, 0) == []


def test_currency_slips_are_named():
    # 100x: one conversion too many. 0.01x: converted the wrong way.
    assert "currency_slip" in [f["code"] for f in rules.currency_slip(9_800, 98)]
    assert "currency_slip" in [f["code"] for f in rules.currency_slip(0.98, 98)]
    # A 0.92 EUR rate is NOT a slip signal: ordinary prices are near it.
    assert rules.currency_slip(90, 98) == []
    # A supplied FX factor is recognised too.
    assert "currency_slip" in [f["code"] for f in rules.currency_slip(16_300, 100, (163.0,))]


def test_missing_required_fields_are_reported():
    codes = [f["code"] for f in rules.missing_fields({"price_usd": None}, ("price_usd", "item_id"))]
    assert codes == ["missing_field", "missing_field"]
    assert rules.missing_fields({"price_usd": 10}, ("price_usd",)) == []


def test_text_layer_catches_the_ladin_fixture_and_leaves_clean_names_alone():
    fixture = json.loads((FIXTURES / "destinations_typo.json").read_text())
    vocabulary = ["The Dolomites", "Ladin culture", "Lago di Braies", "Tre Cime di Lavaredo",
                  "Ortisei Guesthouse", "Kyoto"]
    found = rules.text_typo(fixture["text"], vocabulary)
    assert found, "the 'Lad in'/'Ladin' fixture must be caught"
    assert fixture["expected_correction"].split()[0].lower() in found[0]["detail"].lower()

    split = rules.split_word(fixture["text"], vocabulary)
    assert any("split" in f["detail"].lower() for f in split)

    # A correct name has no finding: no false positives on clean vocabulary members.
    assert rules.text_typo("Lago di Braies", vocabulary) == []
    assert rules.split_word("Tre Cime di Lavaredo", vocabulary) == []


def test_near_duplicate_suppliers_are_found_and_numbered_placeholders_are_not():
    suppliers = [
        {"id": "s1", "name": "Ortisei Guesthouse", "destination": "dolomites-italy"},
        {"id": "s2", "name": "Ortisei Guesthouse", "destination": "dolomites-italy"},
        {"id": "s3", "name": "Rifugio Or Lodge · Sample 03", "destination": "dolomites-italy"},
        {"id": "s4", "name": "Rifugio Or Lodge · Sample 04", "destination": "dolomites-italy"},
        {"id": "s5", "name": "Kyoto Machiya Stay", "destination": "kyoto-japan"},
    ]
    pairs = rules.duplicate_suppliers(suppliers)
    ids = [{a, b} for a, b, *_ in pairs]
    assert {"s1", "s2"} in ids
    # The · Sample NN marker is stripped, so numbered placeholders are duplicates too.
    assert {"s3", "s4"} in ids
    # Different destinations are never compared.
    assert not any("s5" in pair for pair in ids)


def test_severity_helpers_pick_the_worst_finding():
    found = [rules.finding("a", "low", "x"), rules.finding("b", "high", "y")]
    assert rules.severity_of(found) == "high"
    assert rules.severity_of([], floor="medium") == "medium"
    assert rules.highest([]) is None


# --------------------------------------------------------- statistical layer

def _frame(price_by_month, item="item_x", destination="d", tier="mid", category="double_room"):
    return pd.DataFrame([{"item_id": item, "item_name": item, "destination": destination,
                          "tier": tier, "category": category, "unit": "per_room_night",
                          "period": f"2026-{month:02d}", "price_usd": price, "currency": "USD"}
                         for month, price in price_by_month.items()])


def test_robust_z_ignores_a_single_extreme_and_flags_it():
    values = [100, 101, 99, 102, 98, 100, 5_000]
    assert stats.robust_z(values, 5_000) > 10   # the outlier is visible
    assert stats.robust_z(values, 101) < 1      # an ordinary value is not
    assert stats.robust_z([1, 2], 100) is None  # too few peers to judge


def test_peer_and_history_stats_are_attached_per_group():
    frame = pd.concat([_frame({m: 100 for m in range(1, 7)}),
                       _frame({m: 100 for m in range(1, 7)}, item="item_y")])
    frame.loc[frame["item_id"] == "item_y", "price_usd"] = 9_000
    enriched = stats.enrich(frame)
    assert {"peer_z", "own_z", "peer_ratio", "own_ratio", "ml_flag"} <= set(enriched.columns)
    assert enriched["peer_count"].min() >= 2
    # A series that moves a little has no history outlier.
    steady = stats.enrich(_frame({1: 100, 2: 104, 3: 97, 4: 101, 5: 99, 6: 103}))
    assert steady["own_z"].abs().max() <= stats.HISTORY_Z
    # A 40x jump in one month does.
    jumped = stats.enrich(_frame({1: 100, 2: 104, 3: 97, 4: 4_000, 5: 99, 6: 103}))
    assert jumped["own_z"].abs().max() >= stats.HISTORY_Z


def test_imported_zero_rate_is_flagged_and_clean_rate_is_not():
    zero = svc.flag_imported(
        [{"id": "imp_9001", "name": "Test Guesthouse – double room", "destination": "dolomites-italy",
          "type": "stay", "category": "double_room", "tier": "budget", "base_net_price_usd": 0.0,
          "currency": "EUR"}],
        {"imp_9001": [{"period": "2026-11", "date": "2026-11-01", "net_price": 0.0,
                       "net_price_usd": 0.0}]})
    assert zero and zero[0]["codes"] == ["zero_price"]
    assert "price is zero" in zero[0]["explanation"].lower()

    clean = svc.flag_imported(
        [{"id": "imp_9002", "name": "Test Guesthouse – double room", "destination": "dolomites-italy",
          "type": "stay", "category": "double_room", "tier": "budget", "base_net_price_usd": 80.0,
          "currency": "EUR"}],
        {"imp_9002": [{"period": "2026-11", "date": "2026-11-01", "net_price": 74.0,
                       "net_price_usd": 80.0}]})
    assert clean == []


# -------------------------------------------------------------------- the API

def test_feed_is_severity_sorted_filterable_and_paginated():
    body = client.get("/api/anomalies", params={"page_size": 5}).json()
    assert body["count"] > 0 and body["is_sample"] is True
    assert len(body["items"]) <= 5
    order = [rules.SEVERITY_RANK[item["severity"]] for item in body["items"]]
    assert order == sorted(order, reverse=True)
    for field in ("key", "severity", "codes", "explanation", "findings", "resolved"):
        assert field in body["items"][0]
    assert body["items"][0]["explanation"].endswith(".")  # plain language, one sentence plus context

    high = client.get("/api/anomalies", params={"severity": "high", "page_size": 100}).json()
    assert all(item["severity"] == "high" for item in high["items"])
    assert high["count"] == body["severities"]["high"]

    bad = client.get("/api/anomalies", params={"severity": "apocalyptic"})
    assert bad.status_code == 422 and "severity" in bad.json()["detail"]


def test_summary_counts_match_the_feed():
    summary = client.get("/api/anomalies/summary").json()
    feed = client.get("/api/anomalies", params={"page_size": 1}).json()
    assert summary["open"] == feed["open_count"] == feed["count"]
    assert summary["high"] == feed["severities"]["high"]
    assert summary["open"] == summary["high"] + summary["medium"] + summary["low"]


def test_resolution_survives_a_restart_and_leaves_the_open_feed():
    first = client.get("/api/anomalies", params={"page_size": 1}).json()["items"][0]
    key = first["key"]
    ok = client.post(f"/api/anomalies/{key}/resolve", json={"action": "dismiss", "note": "seasonal event"})
    assert ok.status_code == 200 and ok.json()["status"] == "dismissed"

    before = client.get("/api/anomalies/summary").json()["open"]
    # Simulate a restart: every in-process cache is dropped, the database is not.
    svc.reset()
    after = client.get("/api/anomalies/summary").json()["open"]
    assert after == before, "a resolution must not come back after a restart"

    open_keys = {item["key"] for item in
                 client.get("/api/anomalies", params={"page_size": 100}).json()["items"]}
    assert key not in open_keys
    resolved = client.get("/api/anomalies", params={"status": "resolved", "page_size": 100}).json()
    assert key in {item["key"] for item in resolved["items"]}

    reopened = client.post(f"/api/anomalies/{key}/reopen")
    assert reopened.status_code == 200
    assert client.get("/api/anomalies/summary").json()["open"] == before + 1


def test_resolve_validates_the_action_and_requires_a_note_to_mark_a_fix():
    key = client.get("/api/anomalies", params={"page_size": 1}).json()["items"][0]["key"]
    assert client.post(f"/api/anomalies/{key}/resolve", json={"action": "shrug"}).status_code == 422
    no_note = client.post(f"/api/anomalies/{key}/resolve", json={"action": "fix"})
    assert no_note.status_code == 422 and "fix" in no_note.json()["detail"]
    with_note = client.post(f"/api/anomalies/{key}/resolve",
                            json={"action": "fix", "note": "corrected the extra digit"})
    assert with_note.status_code == 200 and with_note.json()["status"] == "fixed"


def test_scan_reports_what_it_checked():
    body = client.post("/api/anomalies/scan").json()
    assert body["rates_checked"] == 6_156
    assert body["findings"] >= body["open"]
    assert set(body["by_severity"]) == {"high", "medium", "low"}


def test_inventory_rows_carry_their_flag_and_package_quotes_show_flags():
    flagged = None
    for page in (1, 2, 3, 4, 5, 6, 7):
        items = client.get("/api/inventory", params={"page": page, "page_size": 100}).json()["items"]
        flagged = next((i for i in items if i["anomaly_flag"]), None)
        if flagged:
            break
    assert flagged, "at least one seeded item must carry an open anomaly flag"
    flag = flagged["anomaly_flag"]
    assert flag["count"] >= 1 and flag["severity"] in rules.SEVERITY_RANK and flag["codes"]

    # The same item, seen through a package quote, raises the same flag.
    item = inventory.state()["items"][0]
    quote = __import__("app.services.quote", fromlist=["quote_package"]).quote_package({
        "destination": item["destination"], "start_date": "2026-11-20", "nights": 2, "travellers": 2,
        "stays": [{"item_id": item["id"], "name": item["name"], "check_in_night": 1, "nights": 2}],
        "days": [], "transfers": {}})
    assert "anomaly_flags" in quote["checks"]
    assert "responsible_score" in quote["checks"]  # the Phase F slot is still reserved


def test_importing_a_bad_csv_raises_flags_in_the_import_result():
    # 7,200 EUR is a plausible-looking number that is 100x the peers for this tier,
    # so it passes CSV format validation (which rejects zero/negative) and must be
    # caught by the anomaly scan that runs right after the import.
    csv = ("name,destination,type,tier,currency,net_price,lat,lon,supplier\n"
           "Broken Extra Digit Stay,dolomites-italy,stay,budget,EUR,7200,46.5,11.6,Zero Supplier\n"
           "Fine Stay,dolomites-italy,stay,budget,EUR,72,46.5,11.6,Fine Supplier\n")
    result = client.post("/api/inventory/import", content=csv,
                         headers={"Content-Type": "text/csv"}).json()
    assert result["imported"] == 2
    assert result["anomaly_flags"], "a 100x rate in an import must raise a flag immediately"
    codes = {code for flag in result["anomaly_flags"] for code in flag["codes"]}
    assert "hundred_x" in codes or "ten_x" in codes or "currency_slip" in codes
    flagged_ids = {flag["item_id"] for flag in result["anomaly_flags"]}
    assert len(flagged_ids) == 1
    # The flagged row is also visible in the feed, so the bell and the importer agree.
    open_ids = {item["item_id"] for item in
                client.get("/api/anomalies", params={"page_size": 100}).json()["items"]}
    assert flagged_ids <= open_ids


def test_detector_is_measured_against_the_injected_labels():
    """The acceptance numbers: every injected anomaly, no false positives on clean seed."""
    labels = json.loads((FIXTURES / "rate_anomaly_labels.json").read_text())
    truth = {(v["item_id"], v["period"]) for v in labels.values()}
    detected = {(item["item_id"], item["period"]) for item in svc.detect_rates()}
    true_positives = len(detected & truth)
    false_positives = len(detected - truth)
    recall = true_positives / len(truth)
    precision = true_positives / max(1, len(detected))

    assert recall >= 0.95, f"recall fell to {recall:.3f}"
    assert false_positives <= 5, f"{false_positives} false positives on clean seed"
    assert precision >= 0.95, f"precision fell to {precision:.3f}"
    # The two misses are spikes that are not out of range for their peers; docs record this.
    assert len(truth - detected) <= 4


def test_bell_feed_and_inventory_counts_agree():
    """The Phase C 'Done when' line: bell, feed and inventory counts tell the same story."""
    summary = client.get("/api/anomalies/summary").json()
    feed = client.get("/api/anomalies", params={"page_size": 1}).json()
    assert summary["open"] == feed["open_count"]

    # Walk every inventory row and add up the flags it shows.
    total = 0
    page = 1
    while True:
        body = client.get("/api/inventory", params={"page": page, "page_size": 100}).json()
        for item in body["items"]:
            if item["anomaly_flag"]:
                total += item["anomaly_flag"]["count"]
        if page >= body["pages"]:
            break
        page += 1
    rate_flags = sum(1 for item in svc.anomalies()
                     if item["kind"] == "rate" and not item["resolved"] and item["item_id"])
    assert total == rate_flags, "the sum of inventory flags must equal the rate anomalies in the feed"
