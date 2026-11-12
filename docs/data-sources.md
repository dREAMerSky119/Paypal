# Wayfare data sources

Every number in Wayfare is either real (with a licence noted below) or synthetic
sample data, labelled as such in the interface. This file lists each source, what
it is used for, its licence, and where it is used in the code. Anything not on
this list is generated or hand-entered and marked `synthetic_sample`,
`synthetic_calibrated` or `assumption` in the dataset's `data_origin` column
(see `docs/data-dictionary.md`).

| Source | Used for | Licence | Where |
| --- | --- | --- | --- |
| Hotel Booking Demand (Antonio, Almeida & Nunes 2019, *Data in Brief* 22) — TidyTuesday copy | Real booking rows used to calibrate seasonality and to validate the anomaly detector (known ADR outliers) | CC BY 4.0 ([article](https://www.sciencedirect.com/science/article/pii/S2352340918315191); TidyTuesday [copy](https://github.com/rfordatascience/tidytuesday/tree/main/data/2020/2020-02-11)) | `scripts/build_dataset.py` (`hotels.csv`) |
| OurAirports (David Megginson) | Airport coordinates for travel-time estimates | Public domain / The Unlicense ([ourairports.com/data](https://ourairports.com/data/), [GitHub mirror](https://github.com/davidmegginson/ourairports-data)) | `scripts/build_dataset.py` (`airports.csv`), `app/data/airports.json` |
| Wikipedia REST API (page summaries) | Attraction text for related spots | CC BY-SA 4.0 ([Wikipedia:Copyrights](https://en.wikipedia.org/wiki/Wikipedia:Copyrights)) | `scripts/fetch_wiki.py` → `app/data/spot_knowledge.json` |
| Wikivoyage API (intro extracts) | Destination travel-guide text | CC BY-SA 3.0 ([Wikivoyage:Copyleft](https://en.wikivoyage.org/wiki/Wikivoyage:Copyleft)) | `scripts/fetch_wiki.py` |
| Wikimedia Pageviews API | Popularity signal for related-spot ranking | CC0 dedication ([pageviews readme](https://dumps.wikimedia.org/other/pageviews/readme.html)) | `scripts/fetch_wiki.py` |
| Overture Maps Places | Supplier names/coordinates (enrichment is offline and optional) | CDLA-Permissive 2.0 ([attribution](https://docs.overturemaps.org/attribution/)) | `scripts/enrich_overture.py` |
| OpenStreetMap standard tiles | Map baselayers | Map data ODbL; tile usage policy applies ([copyright](https://www.openstreetmap.org/copyright), [tile policy](https://operations.osmfoundation.org/policies/tiles/)) — attribution is rendered on every map | `frontend/src/components/InventoryMap.jsx`, `SpotMap.jsx` |
| UK GHG conversion factors 2026 (DESNZ) | Carbon factors for the responsible-travel score | Open Government Licence v3.0 ([collection](https://www.gov.uk/government/collections/government-conversion-factors-for-company-reporting)) | `app/data/carbon_factors_2026.json`, `services/responsible.py` |
| ECB euro reference rates (via Frankfurter when network allows) | FX reference values for the simulator and currency helpers | Free reuse with "Source: ECB" attribution ([reuse policy](https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html), [Frankfurter](https://frankfurter.dev/license/)); current values in the repo are labelled assumptions, not live rates | `app/data/simulator_assumptions.json` (`fx`), `frontend/src/lib/fx.js` |
| Wikipedia/Wikivoyage-derived knowledge for demand notes | Qualitative context only | CC BY-SA as above | `app/data/spot_knowledge.json` |

## Demand forecasting (feature 6)

The monthly demand indices behind `/app/forecast` and the market simulator are
**synthetic calibrated indices** (`data_origin=synthetic_calibrated`): a
hand-built seasonal shape × yearly growth × 2022 reopening × noise, with the
seasonal amplitude calibrated from the real Hotel Booking Demand ADR data.
They are **not** verified tourist-arrival statistics, and every forecast
response carries that note (`data_note`). Replace them with Eurostat / JNTO /
state tourism data before using any number for a real decision
(`scripts/build_dataset.py` marks the row for replacement).

Forecasts are fitted **offline** by `scripts/train_forecast.py` and committed to
`app/data/forecast_seed.json`; the running app only slices that file. The
training script holds out the last six months per destination and keeps the
seasonal-trend model only when it beats a seasonal-naive baseline (same
calendar month one year earlier); otherwise the naive model is served and
confidence is reported as low. India destinations are always flagged low
confidence until real arrival data replaces the calibrated sample.

## Weather / climate

No weather or climate data is currently used. If shoulder-season reasoning ever
needs real climate normals, Open-Meteo publishes its API data under CC BY 4.0
with attribution ([licence](https://open-meteo.com/en/licence)); nothing in the
repo calls it today, so it is listed here only as the planned source.

## World Bank indicators

The demand series' *shape* was inspired by World Bank international-arrival
recoveries (`ST.INT.ARVL`), but the values are **not** World Bank figures — the
row is marked for replacement after a real download. World Bank open data is
CC BY 4.0 with attribution ([terms](https://data.worldbank.org/summary-terms-of-use)).

## Everything else

Supplier names, rates, responsible-travel registry entries, bookings and
simulator events are synthetic sample data generated by
`scripts/build_dataset.py` (seeded, reproducible) and labelled "Sample data" in
the UI. Nothing in this repo invents a real price, availability or claim.
