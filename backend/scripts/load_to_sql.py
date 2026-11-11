#!/usr/bin/env python3
"""
Load wayfare_master.csv (+ the hand-written JSON content) into the Wayfare database.

  pip install -r requirements-scripts.txt
  export DATABASE_URL="postgres://avnadmin:PASSWORD@HOST:PORT/defaultdb?sslmode=require"   # Aiven > Overview > Service URI
  python scripts/load_to_sql.py --reset          # run from backend/; DATABASE_URL may also live in backend/.env

  --reset   drop and recreate the SEED tables first (everything in wayfare_master.csv + content_doc,
            imported inventory rows included). App-owned tables such as checkout_booking are never dropped.
            Without --reset the load refuses to run if the database already holds seed data.
  --check   validate the CSV against schema.sql (column lengths, duplicate ids) and exit; touches no database.

Local test without a server:  --url sqlite:///wayfare_test.db
The whole load is one transaction: it either completes or leaves the database as it was.
"""
import argparse
import json
import math
import re
import sys
from datetime import date
from pathlib import Path

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from app import db  # noqa: E402

CONTENT_DOCS = ("destinations.json", "overview_seed.json", "inventory_meta.json")
INT_COLS = {"nights", "lead_time_days", "is_canceled", "travellers", "travel_min"}

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
    return out


def parse_schema(sql_text):
    """-> (statements, {table: {column: max_len or None}}) from schema.sql."""
    ddl = [s.strip() for s in re.sub(r"--.*", "", sql_text).split(";") if s.strip()]
    cols = {}
    for s in ddl:
        m = re.match(r"CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\((.*)\)\s*$", s, re.S)
        if not m:
            continue
        depth, buf, parts = 0, "", []
        for ch in m.group(2):
            depth += ch == "("
            depth -= ch == ")"
            if ch == "," and depth == 0:
                parts.append(buf); buf = ""
            else:
                buf += ch
        parts.append(buf)
        table = {}
        for p in parts:
            tok = p.split()
            if not tok or tok[0].upper() in ("PRIMARY", "UNIQUE", "FOREIGN", "CONSTRAINT"):
                continue
            ln = re.search(r"VARCHAR\((\d+)\)", p, re.I)
            table[tok[0]] = int(ln.group(1)) if ln else None
        cols[m.group(1)] = table
    return ddl, cols


def _clean(v, col, dialect):
    if v is None or v is pd.NaT or (isinstance(v, float) and math.isnan(v)):
        return None
    if not isinstance(v, (str, bytes, list, dict)) and pd.isna(v):  # pd.NA and friends
        return None
    if hasattr(v, "item") and not isinstance(v, (str, date)):
        v = v.item()  # numpy scalar -> python
    if col in INT_COLS and isinstance(v, (int, float)):
        return int(v)
    if isinstance(v, date) and dialect == "sqlite":
        return v.isoformat()
    return v


def build_rows(df, schema_cols):
    """-> {table: (columns, rows)}; raises ValueError listing every problem found."""
    out, problems = {}, []
    for rtype, (table, mapping, attrs) in SPEC.items():
        t = table_frame(df, rtype, mapping, attrs)
        unknown = [c for c in t.columns if c not in schema_cols[table]]
        if unknown:
            problems.append(f"{table}: columns not in schema.sql: {unknown}")
            continue
        pk = t.columns[0]
        dups = t[pk][t[pk].duplicated()].unique().tolist()
        if dups:
            problems.append(f"{table}: duplicate {pk} values, e.g. {dups[:3]}")
        for c in t.columns:
            limit = schema_cols[table][c]
            if limit:
                longest = t[c].dropna().astype(str).str.len().max()
                if longest and longest > limit:
                    problems.append(f"{table}.{c}: longest value is {longest} chars, schema allows {limit}")
        out[table] = (list(t.columns), t)
    if problems:
        raise ValueError("\n".join(problems))
    return out


def run(url, csv_path, schema_path, reset=False, check_only=False, log=print):
    schema_text = Path(schema_path).read_text()
    ddl, schema_cols = parse_schema(schema_text)
    df = pd.read_csv(csv_path, low_memory=False)
    frames = build_rows(df, schema_cols)
    if check_only:
        log("CSV matches schema.sql: " + ", ".join(f"{t}={len(f)}" for t, (_, f) in frames.items()))
        return {t: len(f) for t, (_, f) in frames.items()}
    seed_tables = [t for t, _ in frames.items()] + ["content_doc"]
    counts = {}
    with db.connect(url) as c:
        if reset:
            for t in reversed(seed_tables):
                c.execute(f"DROP TABLE IF EXISTS {t}")
        for s in ddl:
            c.execute(s)
        if not reset and c.one("SELECT COUNT(*) AS n FROM destination")["n"]:
            raise SystemExit("Database already holds seed data. Re-run with --reset to replace it (imported inventory rows are dropped too).")
        for table, (cols, frame) in frames.items():
            rows = [tuple(_clean(v, col, c.dialect) for col, v in zip(cols, rec)) for rec in frame.itertuples(index=False, name=None)]
            c.executemany(f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", rows)
            counts[table] = len(rows)
            log(f"{table:22s} {len(rows):6d} rows")
        for name in CONTENT_DOCS:
            body = (BACKEND / "app" / "data" / name).read_text(encoding="utf-8")
            json.loads(body)  # refuse to store malformed JSON
            c.execute("INSERT INTO content_doc (doc_name, body) VALUES (?, ?)", (name, body))
            counts["content_doc"] = counts.get("content_doc", 0) + 1
        log(f"{'content_doc':22s} {counts['content_doc']:6d} rows")
    log("done")
    return counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=str(Path(__file__).parent / "data" / "wayfare_master.csv"))
    ap.add_argument("--schema", default=str(Path(__file__).parent / "schema.sql"))
    ap.add_argument("--url", default=None, help="default: DATABASE_URL (env or backend/.env)")
    ap.add_argument("--reset", action="store_true")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    url = a.url or db.url()
    if not url and not a.check:
        sys.exit("Set DATABASE_URL (or pass --url).")
    try:
        run(url, a.csv, a.schema, reset=a.reset, check_only=a.check)
    except ValueError as e:
        sys.exit(f"CSV does not fit schema.sql:\n{e}")


if __name__ == "__main__":
    main()
