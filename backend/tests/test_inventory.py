import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import inventory as inv

client = TestClient(app)
FIXTURES = Path(__file__).parent / "fixtures"
GOOD_HEADER = "name,destination,type,tier,currency,net_price,lat,lon"


@pytest.fixture(autouse=True)
def fresh_state():
    from app.api.routes import inventory as route
    inv.reset()
    route._import_hits.clear()
    yield
    inv.reset()
    route._import_hits.clear()


def get(path, **params):
    return client.get(f"/api{path}", params=params)


def import_csv(text, **params):
    return client.post("/api/inventory/import", content=text.encode(), headers={"content-type": "text/csv"}, params=params)


# ------------------------------------------------------------------ seed integrity

def test_seed_counts_and_coverage():
    m = get("/inventory/meta").json()
    assert m["row_counts"] == {"items": 171, "suppliers": 171, "rates": 6156}
    assert len(m["destinations"]) == 12
    assert m["is_sample"] is True


def test_every_item_has_supplier_and_36_rates():
    s = inv.state()
    sup_ids = {x["id"] for x in s["suppliers"]}
    for i in s["items"]:
        assert i["supplier_id"] in sup_ids
        assert len(s["rates"][i["id"]]) == 36
        assert i["data_origin"] == "synthetic_sample"


def test_ground_truth_labels_are_not_served():
    body = json.dumps(get("/inventory/item_0004/rates").json()) + json.dumps(get("/inventory", page_size=100).json())
    for leak in ("anomaly_label", "true_price", "extra_zero", "INJECTED"):
        assert leak not in body
    assert (FIXTURES / "rate_anomaly_labels.json").exists()


# ------------------------------------------------------------------ list + filters

def test_list_defaults_and_shape():
    b = get("/inventory").json()
    assert b["count"] == 171 and b["page"] == 1 and b["page_size"] == 25 and b["pages"] == 7
    assert len(b["items"]) == 25
    first = b["items"][0]
    assert {"id", "name", "type", "tier", "supplier_name", "lat", "lon", "margin", "responsible_badge", "anomaly_flag"} <= set(first)
    assert first["margin"] is None  # slot, filled by #2


@pytest.mark.parametrize("type_", ["stay", "guide", "experience", "transport"])
def test_filter_type(type_):
    b = get("/inventory", type=type_, page_size=100).json()
    assert b["count"] > 0 and all(i["type"] == type_ for i in b["items"])


@pytest.mark.parametrize("tier", ["budget", "mid", "luxury"])
def test_filter_tier(tier):
    b = get("/inventory", tier=tier, page_size=100).json()
    assert b["count"] > 0 and all(i["tier"] == tier for i in b["items"])


def test_filter_destination():
    b = get("/inventory", destination="kyoto-japan", page_size=100).json()
    assert b["count"] == 15 and all(i["destination"] == "kyoto-japan" for i in b["items"])


def test_filter_price_band_partitions_inventory():
    total = 0
    for band in inv.meta()["price_bands"]:
        b = get("/inventory", price_band=band["id"], page_size=100).json()
        for i in b["items"]:
            p = i["base_net_price_usd"]
            assert p >= band["min_usd"] and (band["max_usd"] is None or p < band["max_usd"])
        total += b["count"]
    assert total == 171  # every item lands in exactly one band


def test_filter_text_matches_name_supplier_and_locality_case_insensitive():
    assert get("/inventory", q="ORTISEI").json()["count"] > 0
    assert get("/inventory", q="homestay double").json()["count"] >= 0  # multi-token AND, no error
    assert get("/inventory", q="zzzz-no-match").json()["count"] == 0


def test_filters_combine():
    b = get("/inventory", destination="bali-indonesia", type="stay", tier="mid", page_size=100).json()
    assert all(i["destination"] == "bali-indonesia" and i["type"] == "stay" and i["tier"] == "mid" for i in b["items"])


def test_sorting():
    asc = [i["base_net_price_usd"] for i in get("/inventory", sort="price_asc", page_size=100).json()["items"]]
    desc = [i["base_net_price_usd"] for i in get("/inventory", sort="price_desc", page_size=100).json()["items"]]
    assert asc == sorted(asc) and desc == sorted(desc, reverse=True)
    names = [i["name"].lower() for i in get("/inventory", page_size=100).json()["items"]]
    assert names == sorted(names)


@pytest.mark.parametrize("params", [
    {"destination": "atlantis"}, {"type": "spa"}, {"tier": "platinum"}, {"price_band": "free"},
    {"sort": "random"}, {"page": 0}, {"page_size": 0}, {"page_size": 101}, {"q": "x" * 101},
])
def test_bad_filters_are_422(params):
    assert get("/inventory", **params).status_code == 422


# ------------------------------------------------------------------ map points

def test_points_match_list_filters_exactly_and_ignore_pagination():
    f = {"destination": "kyoto-japan", "type": "stay"}
    listed = get("/inventory", page_size=100, **f).json()
    pts = get("/inventory/points", **f).json()
    assert pts["count"] == listed["count"] > 0
    assert {p["id"] for p in pts["points"]} == {i["id"] for i in listed["items"]}
    assert set(pts["points"][0]) == {"id", "name", "type", "tier", "destination", "lat", "lon"}
    assert get("/inventory/points").json()["count"] == 171  # all, beyond one page


def test_points_validate_filters_and_are_not_an_item_id():
    assert get("/inventory/points", tier="gold").status_code == 422
    assert get("/inventory/points", q="zzzz-no-match").json() == {"count": 0, "points": [], "is_sample": True}


# ------------------------------------------------------------------ pagination

def test_pagination_covers_everything_once():
    seen = []
    for p in range(1, 8):
        seen += [i["id"] for i in get("/inventory", page=p, page_size=25).json()["items"]]
    assert len(seen) == 171 == len(set(seen))


def test_page_beyond_end_is_empty_not_error():
    b = get("/inventory", page=99).json()
    assert b["items"] == [] and b["count"] == 171


def test_empty_result_has_one_page():
    b = get("/inventory", q="zzzz-no-match").json()
    assert b["pages"] == 1 and b["items"] == []


# ------------------------------------------------------------------ detail, rates, 404s

def test_item_detail_and_404():
    i = get("/inventory/item_0001").json()
    assert i["name"] == "Ortisei Guesthouse – double room" and i["supplier_name"]
    assert get("/inventory/nope").status_code == 404


def test_rates_sorted_with_currency_and_404():
    r = get("/inventory/item_0001/rates").json()
    assert r["currency"] == "EUR" and r["count"] == 36
    periods = [x["period"] for x in r["rates"]]
    assert periods == sorted(periods) and periods[0] == "2025-01" and periods[-1] == "2027-12"
    assert get("/inventory/nope/rates").status_code == 404


def test_meta_route_is_not_swallowed_by_item_id():
    assert "price_bands" in get("/inventory/meta").json()


# ------------------------------------------------------------------ suppliers

def test_suppliers_list_filters_and_item_counts():
    b = get("/suppliers", destination="iceland", page_size=100).json()
    assert b["count"] == 14 and all(s["destination"] == "iceland" and s["item_count"] >= 1 for s in b["items"])
    assert get("/suppliers", tier="luxury").json()["count"] > 0
    assert get("/suppliers", q="sample").json()["count"] > 0
    assert get("/suppliers", destination="atlantis").status_code == 422
    assert get("/suppliers", tier="x").status_code == 422


# ------------------------------------------------------------------ CSV import

def test_import_valid_rows_become_searchable():
    csv = f"{GOOD_HEADER},supplier\nTest Riad Suite,marrakech-morocco,stay,mid,MAD,1200,31.63,-7.99,Test Riad\nTest Guide Day,kyoto-japan,guide,budget,JPY,9000,35.01,135.76,\n"
    r = import_csv(csv).json()
    assert r["imported"] == 2 and r["rejected"] == 0 and len(r["item_ids"]) == 2
    found = get("/inventory", q="test riad").json()
    assert found["count"] == 1 and found["items"][0]["data_origin"] == "imported"
    assert found["items"][0]["base_net_price_usd"] == round(1200 / 9.9, 2)
    assert get(f"/inventory/{r['item_ids'][0]}/rates").json()["count"] == 1
    assert get("/inventory/meta").json()["row_counts"]["items"] == 173


def test_import_dry_run_changes_nothing():
    r = import_csv(f"{GOOD_HEADER}\nA,kyoto-japan,stay,mid,JPY,9000,35,135\n", dry_run="true").json()
    assert r["valid"] == 1 and r["imported"] == 0
    assert get("/inventory/meta").json()["row_counts"]["items"] == 171


def test_import_reports_each_bad_row_with_line_number():
    csv = "\n".join([
        GOOD_HEADER,
        "Good,kyoto-japan,stay,mid,JPY,9000,35,135",           # line 2 ok
        ",kyoto-japan,stay,mid,JPY,9000,35,135",               # 3 missing name
        "Bad dest,atlantis,stay,mid,JPY,9000,35,135",          # 4
        "Bad type,kyoto-japan,spa,mid,JPY,9000,35,135",        # 5
        "Bad tier,kyoto-japan,stay,gold,JPY,9000,35,135",      # 6
        "Bad cur,kyoto-japan,stay,mid,XXX,9000,35,135",        # 7
        "Bad price,kyoto-japan,stay,mid,JPY,abc,35,135",       # 8
        "Neg price,kyoto-japan,stay,mid,JPY,-5,35,135",        # 9
        "Bad lat,kyoto-japan,stay,mid,JPY,9000,95,135",        # 10
        "Extra,kyoto-japan,stay,mid,JPY,9000,35,135,oops",     # 11 too many cells
        "Good,kyoto-japan,stay,mid,JPY,9000,35,135",           # 12 duplicate of line 2
        "",                                                    # blank ignored
    ])
    r = import_csv(csv).json()
    assert r["imported"] == 1 and r["rejected"] == 10
    assert [e["row"] for e in r["errors"]] == list(range(3, 13))
    by_row = {e["row"]: e["message"] for e in r["errors"]}
    assert "name is required" in by_row[3]
    assert "unknown destination" in by_row[4]
    assert "type" in by_row[5] and "tier" in by_row[6] and "currency" in by_row[7]
    assert "number" in by_row[8] and "outside" in by_row[9] and "lat" in by_row[10]
    assert "more values" in by_row[11] and "duplicate" in by_row[12]


@pytest.mark.parametrize("body,fragment", [
    ("", "empty"),
    ("name,destination\nx,kyoto-japan\n", "Missing required column"),
    ("just some text with no commas\n", "Missing required column"),
])
def test_import_unusable_files_are_422(body, fragment):
    r = import_csv(body)
    assert r.status_code == 422 and fragment in r.json()["detail"]


def test_import_rejects_non_utf8_and_oversize_and_too_many_rows():
    r = client.post("/api/inventory/import", content=b"\xff\xfe\x00bad", headers={"content-type": "text/csv"})
    assert r.status_code == 422 and "UTF-8" in r.json()["detail"]
    big = "x" * (inv.MAX_IMPORT_BYTES + 1)
    assert client.post("/api/inventory/import", content=big.encode(), headers={"content-type": "text/csv"}).status_code in (413, 422)
    many = GOOD_HEADER + "\n" + "\n".join(f"n{i},kyoto-japan,stay,mid,JPY,9000,35,135" for i in range(inv.MAX_IMPORT_ROWS + 1))
    if len(many.encode()) <= inv.MAX_IMPORT_BYTES:
        assert import_csv(many).status_code == 422


def test_import_handles_bom_header_case_and_thousands_separator():
    csv = "\ufeffName,Destination,Type,Tier,Currency,Net_Price,Lat,Lon\n\"Comma Price\",kyoto-japan,stay,mid,jpy,\"12,000\",35,135\n"
    r = import_csv(csv).json()
    assert r["imported"] == 1 and r["rejected"] == 0


def test_import_reuses_supplier_by_name():
    csv = f"{GOOD_HEADER},supplier\nA,kyoto-japan,stay,mid,JPY,9000,35,135,Same Co\nB,kyoto-japan,experience,mid,JPY,3000,35,135,Same Co\n"
    import_csv(csv)
    sups = [s for s in inv.state()["suppliers"] if s["name"] == "Same Co"]
    assert len(sups) == 1


def test_import_rate_limit(monkeypatch):
    from app.api.routes import inventory as route
    codes = [import_csv(f"{GOOD_HEADER}\n", dry_run="true").status_code for _ in range(route.IMPORT_LIMIT + 1)]
    assert codes[-1] == 429 and codes[-2] == 200


# ------------------------------------------------------------------ overview integration

def test_overview_supplier_card_reads_inventory_and_follows_imports():
    def card():
        return next(m for m in get("/overview").json()["metrics"] if m["key"] == "suppliers")
    c = card()
    assert c["value"] == "171" and c["change"] == "" and "171 bookable items across 12 destinations" == c["detail"]
    import_csv(f"{GOOD_HEADER},supplier\nNew,kyoto-japan,stay,mid,JPY,9000,35,135,Brand New Supplier\n")
    assert card()["value"] == "172" and "172 bookable items" in card()["detail"]
