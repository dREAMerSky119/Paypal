#!/usr/bin/env python3
"""
Split wayfare_master.csv into tables and load them into an SQL database.

  pip install pandas sqlalchemy "psycopg[binary]"        # Aiven PostgreSQL
  export DATABASE_URL="postgresql+psycopg://avnadmin:PASSWORD@HOST:PORT/defaultdb?sslmode=require"
  python load_to_sql.py --csv wayfare_master.csv --schema schema.sql --reset

Local test without a server:  --url sqlite:///wayfare_test.db
"""
import argparse, json, os, re
import pandas as pd
from sqlalchemy import create_engine, text

# record_type -> (table, {csv/attr column -> table column}, [attr keys to expand from attrs_json])
SPEC = {
 "destination": ("destination", {"record_id": "destination_slug", "name": "name", "country": "country", "category": "category", "lat": "lat", "lon": "lon",
                  "currency": "currency", "text": "editorial", "data_origin": "data_origin"},
                 {"bbox_west_south_east_north": "bbox_west_south_east_north", "best_time": "best_time", "duration": "duration", "tags": "tags", "related_hand_wired": "related_hand_wired"}),
 "spot": ("spot", {"record_id": "spot_id", "destination_slug": "destination_slug", "name": "name", "category": "category", "lat": "lat", "lon": "lon", "text": "description", "data_origin": "data_origin"},
          {"location_label": "location_label", "typical_duration": "typical_duration", "image_id": "image_id"}),
 "supplier": ("supplier", {"record_id": "supplier_id", "destination_slug": "destination_slug", "name": "name", "subtype": "subtype", "tier": "tier", "lat": "lat", "lon": "lon",
              "currency": "currency", "score": "responsible_score", "data_origin": "data_origin"},
              {"supplier_kind": "supplier_kind", "ownership": "ownership", "chain_brand": "chain_brand", "locality": "locality", "overture_id": "overture_id",
               "score_if_self_reported_counted": "score_if_self_reported_counted"}),
 "item": ("item", {"record_id": "item_id", "parent_id": "supplier_id", "destination_slug": "destination_slug", "name": "name", "category": "category", "subtype": "item_type",
          "tier": "tier", "lat": "lat", "lon": "lon", "currency": "currency", "price_net": "base_net_price", "price_net_usd": "base_net_price_usd", "quantity": "capacity", "data_origin": "data_origin"},
          {"unit": "unit", "markup_pct": "markup_pct"}),
 "rate": ("rate", {"record_id": "rate_id", "parent_id": "item_id", "destination_slug": "destination_slug", "period": "period", "date": "rate_date", "currency": "currency",
          "price_net": "price_net", "price_net_usd": "price_net_usd", "index_value": "occupancy", "anomaly_label": "injected_anomaly", "data_origin": "data_origin"},
          {"true_price_net": "true_price_net", "unit": "unit"}),
 "booking": ("booking", {"record_id": "booking_id", "parent_id": "item_id", "related_id": "trip_id", "destination_slug": "destination_slug", "country": "source_market", "category": "market_segment",
             "subtype": "line_type", "tier": "tier", "date": "check_in", "date_end": "check_out", "period": "period", "currency": "currency", "price_net": "net_cost", "price_sell": "sell_price",
             "fees": "fees", "quantity": "quantity", "nights": "nights", "lead_time_days": "lead_time_days", "is_canceled": "is_canceled", "data_origin": "data_origin"},
             {"booking_date": "booking_date", "travellers": "travellers", "deposit_type": "deposit_type", "cancel_penalty_usd": "cancel_penalty_usd", "distribution_channel": "distribution_channel", "supplier_id": "supplier_id"}),
 "demand_monthly": ("demand_monthly", {"record_id": "demand_id", "destination_slug": "destination_slug", "country": "country", "period": "period", "date": "period_date",
                    "index_value": "demand_index", "subtype": "confidence", "data_origin": "data_origin"}, {"method": "method"}),
 "seasonality_profile": ("seasonality_profile", {"record_id": "profile_id", "subtype": "hotel_type", "period": "month_key", "index_value": "adr_index", "score": "cancel_rate",
                         "lead_time_days": "mean_lead_time_days", "quantity": "booking_share", "data_origin": "data_origin"}, {}),
 "event": ("event", {"record_id": "event_id", "destination_slug": "destination_slug", "country": "country", "name": "name", "subtype": "event_type", "date": "start_date", "date_end": "end_date",
          "demand_multiplier": "demand_multiplier", "rate_multiplier": "rate_multiplier", "source_note": "source_note", "data_origin": "data_origin"}, {"scope": "scope"}),
 "macro_shock": ("macro_shock", {"record_id": "shock_id", "country": "country", "name": "name", "date": "start_date", "date_end": "end_date", "demand_multiplier": "demand_multiplier", "source_note": "source_note"}, {}),
 "fx_assumption": ("fx_assumption", {"currency": "currency", "index_value": "per_usd", "score": "annual_volatility", "source_note": "source_note"}, {}),
 "emission_factor": ("emission_factor", {"record_id": "factor_id", "name": "mode", "subtype": "unit", "country": "country", "index_value": "kg_co2e", "verification": "verification", "source_note": "source_note"}, {}),
 "holiday": ("holiday", {"record_id": "holiday_id", "country": "country", "name": "name", "date": "holiday_date", "period": "period"}, {}),
 "airport": ("airport", {"record_id": "airport_id", "destination_slug": "destination_slug", "name": "name", "subtype": "airport_type", "category": "role", "lat": "lat", "lon": "lon",
             "distance_km": "distance_km", "travel_min": "travel_min"}, {"iata": "iata"}),
 "relation": ("relation", {"record_id": "relation_id", "parent_id": "from_id", "related_id": "to_id", "category": "relation_type", "subtype": "entity_kind", "score": "score",
              "distance_km": "distance_km", "travel_min": "travel_min", "destination_slug": "destination_slug", "source_note": "source_note"}, {}),
 "responsible_claim": ("responsible_claim", {"record_id": "claim_id", "parent_id": "supplier_id", "destination_slug": "destination_slug", "category": "claim_type", "text": "claim_text",
                       "verification": "verification", "score": "weight", "source_note": "source_note"}, {}),
 "text_vocab": ("text_vocab", {"record_id": "vocab_id", "name": "name"}, {}),
 "text_test": ("text_test", {"record_id": "test_id", "parent_id": "supplier_id", "text": "observed_text", "name": "canonical_text", "subtype": "kind", "anomaly_label": "label", "source_note": "source_note"}, {}),
 "hbd_sample": ("hbd_sample", {"record_id": "hbd_id", "subtype": "hotel_type", "category": "market_segment", "country": "nationality", "period": "period", "price_net": "adr", "nights": "nights",
                "lead_time_days": "lead_time_days", "is_canceled": "is_canceled", "quantity": "guests", "anomaly_label": "label"}, {"deposit_type": "deposit_type", "distribution_channel": "distribution_channel"}),
}
DATE_COLS = {"rate_date", "check_in", "check_out", "booking_date", "period_date", "start_date", "end_date", "holiday_date"}


def table_frame(df, rtype, mapping, attrs):
    sub = df[df.record_type == rtype].copy()
    out = pd.DataFrame({dst: sub[src] for src, dst in mapping.items()})
    if attrs:
        parsed = sub["attrs_json"].map(lambda s: json.loads(s) if isinstance(s, str) else {})
        for k, dst in attrs.items():
            out[dst] = parsed.map(lambda d: (json.dumps(d[k]) if isinstance(d.get(k), (list, dict)) else d.get(k)))
    for c in out.columns:
        if c in DATE_COLS:
            out[c] = pd.to_datetime(out[c], errors="coerce").dt.date
    return out.dropna(axis=1, how="all") if False else out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="wayfare_master.csv"); ap.add_argument("--schema", default="schema.sql")
    ap.add_argument("--url", default=os.getenv("DATABASE_URL")); ap.add_argument("--reset", action="store_true", help="drop and recreate all tables first")
    a = ap.parse_args()
    assert a.url, "set DATABASE_URL or pass --url"
    eng = create_engine(a.url)
    ddl = [s.strip() for s in re.sub(r"--.*", "", open(a.schema).read()).split(";") if s.strip()]
    tables = [re.search(r"CREATE TABLE (\w+)", s).group(1) for s in ddl if s.startswith("CREATE TABLE")]
    with eng.begin() as c:
        if a.reset:
            for t in reversed(tables): c.execute(text(f"DROP TABLE IF EXISTS {t}"))
        for s in ddl: c.execute(text(s))
    df = pd.read_csv(a.csv, low_memory=False)
    with eng.begin() as c:
        for rtype, (table, mapping, attrs) in SPEC.items():
            t = table_frame(df, rtype, mapping, attrs)
            t.to_sql(table, c, if_exists="append", index=False, chunksize=1000)
            print(f"{table:22s} {len(t):6d} rows")
    print("done")


if __name__ == "__main__":
    main()
