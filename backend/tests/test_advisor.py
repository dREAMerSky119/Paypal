import pytest

from app.services import advisor as adv
from app.services import inventory as inv


@pytest.fixture(autouse=True)
def fresh():
    inv.reset()
    yield
    inv.reset()


def test_parse_basic_constraints():
    c = adv.parse_request("3 nights in Kyoto for 2 under $1500, love food")
    assert c["destination"] == "kyoto-japan" and c["nights"] == 3 and c["travellers"] == 2
    assert c["budget_input"]["amount"] == 1500 and c["interests"] == ["food"]


def test_budget_word_before_amount_is_not_a_tier():
    c = adv.parse_request("5 days in Kerala for 4, budget ₹80,000 per person")
    assert "tier" not in c and c["budget_input"]["currency"] == "INR" and c["budget_input"]["per_person"]


def test_the_dolomites_matches():
    assert adv.parse_request("2 nights in the Dolomites")["destination"] == "dolomites-italy"


def test_missing_destination_or_nights_asks_a_question():
    r = adv.respond("plan a trip")
    assert r["proposal"] is None and set(r["missing"]) == {"destination", "nights"}
    r2 = adv.respond("kyoto", {"nights": 3})
    assert r2["proposal"] is not None


def test_followup_merges_previous_constraints():
    r = adv.respond("3 nights")
    r2 = adv.respond("kyoto please", r["constraints"])
    assert r2["proposal"]["nights"] == 3 and r2["proposal"]["destination"] == "kyoto-japan"


@pytest.mark.parametrize("msg", [
    "3 nights in Kyoto for 2 under $1500", "5 nights in Kerala for 4", "luxury week in Iceland for a couple",
    "4 days in Bali on a budget", "2 nights in Marrakech solo",
])
def test_every_line_traces_to_inventory_and_totals_add_up(msg):
    p = adv.respond(msg)["proposal"]
    items = {i["id"]: i for i in inv.state()["items"]}
    for l in p["lines"]:
        item = items[l["item_id"]]
        assert item["destination"] == p["destination"]
        assert l["unit_net_usd"] == item["base_net_price_usd"]
    assert round(sum(l["sell_usd"] for l in p["lines"]), 2) == p["totals"]["sell_usd"]
    assert sum(1 for l in p["lines"] if l["type"] == "stay") == 1
    assert len({l["item_id"] for l in p["lines"]}) == len(p["lines"])


def test_respects_budget_when_feasible():
    p = adv.respond("3 nights in Kyoto for 2 under $1500")["proposal"]
    assert p["within_budget"] and p["totals"]["sell_usd"] <= 1500


def test_warns_when_budget_is_impossible():
    p = adv.respond("3 nights in Kyoto for 2 under $50")["proposal"]
    assert not p["within_budget"] and any(c["level"] == "warn" for c in p["checks"])


def test_rooms_scale_with_group_size():
    p = adv.respond("2 nights in Kyoto for 9")["proposal"]
    stay = next(l for l in p["lines"] if l["type"] == "stay")
    assert stay["qty"] >= 2 * 2  # at least 2 rooms x 2 nights


def test_price_outliers_are_excluded():
    s = inv.state()
    victim = next(i for i in s["items"] if i["destination"] == "kyoto-japan" and i["type"] == "stay")
    victim["base_net_price_usd"] *= 100  # extra-zero data error
    usable, excluded = adv._trusted_items("kyoto-japan")
    assert victim["id"] in {i["id"] for i in excluded}
    p = adv.respond("2 nights in Kyoto")["proposal"]
    assert victim["id"] not in {l["item_id"] for l in p["lines"]}


@pytest.mark.parametrize("bad", ["", "   ", "x" * 700])
def test_bad_messages_rejected(bad):
    with pytest.raises(adv.AdvisorError):
        adv.respond(bad)


def test_limits_enforced():
    with pytest.raises(adv.AdvisorError):
        adv.respond("99 nights in Kyoto")
    with pytest.raises(adv.AdvisorError):
        adv.respond("3 nights in Kyoto", {"travellers": 500})
