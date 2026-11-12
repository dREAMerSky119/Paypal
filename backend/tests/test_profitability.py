"""Profitability engine and API tests.

The engine tests use four hand-made bookings so every expected number can be checked
with a calculator. The route tests run against the committed seed.
"""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import profitability as p

client = TestClient(app)


def bk(dest, sup, sell, net, fees, day, canceled=False, penalty=0.0, typ="stay", tier="mid"):
    return {"destination": dest, "supplier_id": sup, "sell_amount": sell, "net_amount": net, "fees": fees,
            "date": day, "is_canceled": canceled, "cancel_penalty": penalty, "type": typ, "tier": tier}


# d1: A (stay, Jan) and B (guide, Feb) complete. d2: C (Feb) cancelled with an 8.00 loss, D (Jul) complete.
BOOKINGS = [
    bk("d1", "sup_001", 120, 100, 3.0, "2025-01-10"),
    bk("d1", "sup_002", 220, 200, 5.5, "2025-02-05", typ="guide"),
    bk("d2", "sup_001", 110, 100, 2.75, "2025-02-20", canceled=True, penalty=8.0),
    bk("d2", "sup_002", 55, 50, 1.5, "2025-07-01"),
]


def by_name(rows):
    return {r["name"]: r for r in rows}


# ---------- summary ----------
def test_summary_hand_computed():
    s = p.calculate_summary(BOOKINGS)
    # completed: sales 120+220+55=395, net 350, profit (17)+(14.5)+(3.5)=35, minus 8 leakage = 27
    assert s["gross_sales"] == 395
    assert s["total_net_cost"] == 350
    assert s["gross_profit"] == 27
    assert s["gross_margin"] == 6.84  # 27 / 395
    assert s["cancellation_leakage"] == 8
    assert s["margin_forgone_on_cancelled"] == 7.25  # 110 - 100 - 2.75, not subtracted from profit
    assert (s["completed_bookings"], s["cancelled_bookings"], s["total_bookings"]) == (3, 1, 4)


def test_summary_empty_is_zeros_not_an_error():
    s = p.calculate_summary([])
    assert s["gross_sales"] == 0 and s["gross_margin"] == 0 and s["total_bookings"] == 0


def test_cancelled_booking_never_counts_as_sales():
    only_cancelled = [bk("d", "s", 500, 400, 10, "2025-03-01", canceled=True, penalty=40)]
    s = p.calculate_summary(only_cancelled)
    assert s["gross_sales"] == 0 and s["gross_profit"] == -40 and s["gross_margin"] == 0


# ---------- breakdown ----------
def test_breakdown_by_destination():
    rows = by_name(p.calculate_breakdown(BOOKINGS, "destination"))
    assert rows["d1"]["gross_profit"] == 31.5 and rows["d1"]["gross_margin"] == 9.26
    # d2: profit 3.5 on sales 55, minus an 8 loss => -4.5 (a loss-making destination)
    assert rows["d2"]["gross_profit"] == -4.5 and rows["d2"]["gross_margin"] == -8.18
    assert [r["name"] for r in p.calculate_breakdown(BOOKINGS, "destination")] == ["d1", "d2"]  # best first


def test_breakdown_by_season_and_package_and_supplier():
    seasons = by_name(p.calculate_breakdown(BOOKINGS, "season"))
    assert seasons["Winter"]["gross_profit"] == 23.5 and seasons["Winter"]["gross_margin"] == 6.91
    assert seasons["Summer"]["gross_profit"] == 3.5 and seasons["Summer"]["gross_margin"] == 6.36
    assert set(by_name(p.calculate_breakdown(BOOKINGS, "package"))) == {"stay - mid", "guide - mid"}
    sup = by_name(p.calculate_breakdown(BOOKINGS, "supplier"))
    assert sup["sup_001"]["gross_profit"] == 9  # 17 - 8
    assert sup["sup_002"]["gross_profit"] == 18  # 14.5 + 3.5


def test_breakdown_rejects_unknown_group():
    with pytest.raises(ValueError):
        p.calculate_breakdown(BOOKINGS, "nonsense")


# ---------- monthly trend ----------
def test_monthly_trend_is_sorted_and_correct():
    months = p.calculate_monthly_trend(BOOKINGS)
    assert [m["month"] for m in months] == ["2025-01", "2025-02", "2025-07"]
    feb = months[1]
    assert feb["gross_profit"] == 6.5 and feb["gross_margin"] == 2.95 and feb["cancelled_bookings"] == 1


def test_monthly_trend_skips_bad_dates():
    assert p.calculate_monthly_trend([bk("d", "s", 1, 1, 0, "not-a-date")]) == []


# ---------- date range ----------
def test_date_range_is_inclusive():
    got = p.filter_bookings_by_date(BOOKINGS, date(2025, 2, 5), date(2025, 2, 20))
    assert [b["date"] for b in got] == ["2025-02-05", "2025-02-20"]


def test_date_range_reversed_raises():
    with pytest.raises(ValueError):
        p.filter_bookings_by_date(BOOKINGS, date(2025, 3, 1), date(2025, 2, 1))


def test_date_range_with_no_matches_is_empty():
    assert p.filter_bookings_by_date(BOOKINGS, date(2030, 1, 1), date(2030, 2, 1)) == []


# ---------- what-if ----------
def test_markup_what_if_hand_computed():
    r = p.calculate_markup_what_if(BOOKINGS, 20)
    # sales become 350 * 1.2 = 420; fees 10; leakage 8 => profit 52 (vs 27 today)
    assert r["current_markup"] == 12.86 and r["projected_gross_sales"] == 420
    assert r["projected_gross_profit"] == 52 and r["profit_difference"] == 25
    assert r["projected_gross_margin"] == 12.38


def test_markup_what_if_at_current_markup_changes_nothing():
    current = (395 - 350) / 350 * 100
    assert abs(p.calculate_markup_what_if(BOOKINGS, current)["profit_difference"]) < 0.01


# ---------- API ----------
def test_summary_route_matches_engine_on_seed():
    body = client.get("/api/analytics/profitability/summary").json()
    assert body == p.get_profitability_summary()
    assert body["is_sample"] is True


@pytest.mark.parametrize("group_by", ["destination", "supplier", "package", "season"])
def test_breakdown_route_every_group(group_by):
    r = client.get(f"/api/analytics/profitability/breakdown?group_by={group_by}")
    assert r.status_code == 200
    rows = r.json()["results"]
    assert rows and r.json()["total_groups"] == len(rows)
    profits = [x["gross_profit"] for x in rows]
    assert profits == sorted(profits, reverse=True)


def test_breakdown_totals_equal_summary():
    summary = client.get("/api/analytics/profitability/summary").json()
    for group_by in ("destination", "supplier", "season"):
        rows = client.get(f"/api/analytics/profitability/breakdown?group_by={group_by}").json()["results"]
        assert round(sum(x["gross_profit"] for x in rows), 1) == pytest.approx(summary["gross_profit"], abs=0.5)


def test_supplier_breakdown_uses_names_not_ids():
    rows = client.get("/api/analytics/profitability/breakdown?group_by=supplier").json()["results"]
    assert all(not r["name"].startswith("sup_") and r["supplier_id"].startswith("sup_") for r in rows)


def test_breakdown_with_range_and_combos():
    q = "from=2025-06-01&to=2025-08-31"
    full = client.get("/api/analytics/profitability/summary").json()
    ranged = client.get(f"/api/analytics/profitability/summary?{q}").json()
    assert 0 < ranged["total_bookings"] < full["total_bookings"]
    seasons = client.get(f"/api/analytics/profitability/breakdown?group_by=season&{q}").json()["results"]
    assert [s["name"] for s in seasons] == ["Summer"]


def test_empty_range_is_zeros():
    r = client.get("/api/analytics/profitability/summary?from=2030-01-01&to=2030-02-01")
    assert r.status_code == 200 and r.json()["total_bookings"] == 0
    assert client.get("/api/analytics/profitability/monthly-trend?from=2030-01-01&to=2030-02-01").json()["results"] == []


def test_validation_errors():
    assert client.get("/api/analytics/profitability/summary?from=2025-06-01&to=2025-05-01").status_code == 400
    assert client.get("/api/analytics/profitability/summary?from=notadate").status_code == 422
    assert client.get("/api/analytics/profitability/breakdown?group_by=bogus").status_code == 422
    assert client.get("/api/analytics/profitability/markup-what-if?markup_percentage=150").status_code == 422
    assert client.get("/api/analytics/profitability/markup-what-if?markup_percentage=-1").status_code == 422


def test_what_if_route_matches_engine():
    r = client.get("/api/analytics/profitability/markup-what-if?markup_percentage=20&from=2025-06-01&to=2025-12-31").json()
    engine = p.calculate_markup_what_if(
        p.filter_bookings_by_date(p.get_bookings(), date(2025, 6, 1), date(2025, 12, 31)), 20)
    assert r == engine


def test_monthly_trend_route():
    r = client.get("/api/analytics/profitability/monthly-trend").json()
    assert r["month_count"] == len(r["results"]) == 18
    months = [m["month"] for m in r["results"]]
    assert months == sorted(months)


def test_supplier_ranking():
    r = client.get("/api/analytics/suppliers/ranking?limit=5").json()
    rows = r["results"]
    assert len(rows) == 5 and [x["rank"] for x in rows] == [1, 2, 3, 4, 5]
    assert [x["gross_profit"] for x in rows] == sorted((x["gross_profit"] for x in rows), reverse=True)
    margin = client.get("/api/analytics/suppliers/ranking?by=gross_margin&limit=3").json()["results"]
    assert all(x["gross_sales"] > 0 for x in margin)
    assert [x["gross_margin"] for x in margin] == sorted((x["gross_margin"] for x in margin), reverse=True)
    assert client.get("/api/analytics/suppliers/ranking?by=bogus").status_code == 422
    assert client.get("/api/analytics/suppliers/ranking?limit=0").status_code == 422
