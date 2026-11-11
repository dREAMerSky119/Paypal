import json
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "app" / "data"


def test_exported_reference_files_exist_and_have_content():
    for name in ("spots.json", "spot_links.json", "airports.json", "package_fees.json"):
        assert (DATA / name).exists(), name
    spots = json.loads((DATA / "spots.json").read_text(encoding="utf-8"))
    links = json.loads((DATA / "spot_links.json").read_text(encoding="utf-8"))
    airports = json.loads((DATA / "airports.json").read_text(encoding="utf-8"))
    fees = json.loads((DATA / "package_fees.json").read_text(encoding="utf-8"))
    assert len(spots) == 38
    assert len(links["day_items"]) == 114
    assert len(links["near"]) == 81
    assert len(airports) == 19
    assert 0 <= fees["fee_rate"] < 1
