# Wayfare Package Builder — Backend Phase 1

This update adds the Package Builder reference-data export and quote calculation layer. It intentionally does not add database persistence or HTTP package endpoints yet; those are Phase 2.

## Added files

- `app/services/quote.py` — package validation and quote calculations using the existing inventory service and monthly rates.
- `scripts/export_package_data.py` — deterministic export of spots, spot/item relationships, airports and the booking-derived fee rate.
- `app/data/spots.json`
- `app/data/spot_links.json`
- `app/data/airports.json`
- `app/data/package_fees.json` — exact filename used by the quote engine.
- `tests/test_package_quote.py`
- `tests/test_package_export.py`

## Regenerate reference data

From the `backend` directory:

```bash
python scripts/export_package_data.py
```

The script reads `scripts/data/wayfare_master.csv` and writes the four JSON files under `app/data/`.

## Run focused tests

From the `backend` directory:

```bash
python -m pytest tests/test_package_quote.py tests/test_package_export.py tests/test_inventory.py -q
```

## Quote engine entry point

```python
from app.services.quote import quote_package

quote = quote_package({
    "destination": "kyoto-japan",
    "start_date": "2026-11-20",
    "nights": 4,
    "travellers": 3,
    "stays": [],
    "days": [],
    "transfers": {"arrival": None, "departure": None},
})
```

The quote function raises `PackageQuoteError` for invalid package input. It returns line items, USD totals, fee, profit, margin, rate months and warnings. The caller/API layer should translate `PackageQuoteError` into an HTTP 400 response in Phase 2.

## Data notes

- Fee rate is derived as the median `fees / price_sell` ratio over booking records with valid values. The source CSV currently yields 2.5% across 7,054 rows.
- The dataset is marked as sample/synthetic in responses and fee configuration.
- Customer-facing share responses must not expose net cost, fee, profit or margin; that is part of Phase 4.
- Package database persistence and API endpoints are not included in this Phase 1 archive.
