# Inventory: extension points for other features

The inventory page and API reserve slots so later features plug in without reshaping anything.

| Slot | Where it appears | Filled by | Contract |
| --- | --- | --- | --- |
| `margin` | `GET /api/inventory[/{id}]` item field; drawer "Margin" card | #2 Profitability | `null` now. Will be `{ "pct": number, "basis": "sample" }`. Show "n/a" for `null`, never 0 |
| `responsible_badge` | item field; drawer "Responsible badge" card; a badge column in the table | #8 Responsible travel | `null` now. Only **verified** claims may produce a badge; self-reported claims show in the detail view with a visible label |
| `anomaly_flag` | item field; drawer "Anomaly flag" card; a flag icon in table rows | #9 Anomaly watch | `null` now. Will be `{ "severity": "high"\|"medium"\|"low", "open": n }`. `null` means *not scanned*, not *clean* |

How to fill one: add the field to `_public_item` in `backend/app/services/inventory.py` (compute
from your service, keep the route thin), then replace the matching `<Slot>` in `ItemDrawer`
in `frontend/src/components/InventoryPage.jsx`. Nothing else moves.

Also available to other features:

* `/app/inventory?item=<id>` opens an item's drawer (used by the ⌘K palette; packages and
  anomalies should link the same way).
* `/api/inventory/points` returns every match as a map marker, with the same filters as the list.
* `inventory.import_csv()` is the single entry point for new rows. #9 hooks its scan there
  ("scan runs on inventory import").
* `inventory_meta.json` `fx_per_usd` is the only FX table until #5 replaces it.
