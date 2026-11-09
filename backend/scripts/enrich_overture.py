#!/usr/bin/env python3
"""
UNTESTED HELPER (the build sandbox could not reach S3): replace the synthetic supplier names/coords in
wayfare_master.csv with real Overture Maps places inside each destination bounding box.

  pip install duckdb pandas
  python enrich_overture.py --release 2026-09-17.0 --csv wayfare_master.csv --out wayfare_master_overture.csv

Check the current release id and schema at https://docs.overturemaps.org (the old `categories` field was removed;
use `taxonomy` / `basic_category`). Overture data is CDLA-Permissive-2.0: keep the attribution.
Approach: for each supplier row, pick the closest unused Overture place of a matching basic_category inside the destination bbox,
overwrite name/lat/lon, store overture_id + brand (chain detection) in attrs_json, and mark data_origin=real_public.
"""
import argparse, json
import duckdb, pandas as pd

KIND_TO_CAT = {"stay": ["hotel", "guest_house", "bed_and_breakfast", "hostel", "resort", "lodge"],
               "experience": ["tour_operator", "cooking_school", "arts_and_crafts", "farm"],
               "guide": ["tour_operator", "travel_agency"], "transport": ["taxi_service", "car_rental", "transportation_service"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--release", required=True); ap.add_argument("--csv", default="wayfare_master.csv"); ap.add_argument("--out", default="wayfare_master_overture.csv")
    a = ap.parse_args()
    df = pd.read_csv(a.csv, low_memory=False)
    con = duckdb.connect(); con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    path = f"s3://overturemaps-us-west-2/release/{a.release}/theme=places/type=place/*"
    for _, d in df[df.record_type == "destination"].iterrows():
        w, s, e, n = json.loads(d.attrs_json)["bbox_west_south_east_north"]
        q = f"""SELECT id, names.primary AS name, basic_category, brand.names.primary AS brand, confidence,
                       ST_Y(geometry) AS lat, ST_X(geometry) AS lon
                FROM read_parquet('{path}', filename=true, hive_partitioning=1)
                WHERE bbox.xmin BETWEEN {w} AND {e} AND bbox.ymin BETWEEN {s} AND {n} AND confidence > 0.7"""
        pl = con.execute(q).df()
        print(d.record_id, len(pl), "places")
        used = set()
        sup = df[(df.record_type == "supplier") & (df.destination_slug == d.record_id)]
        for idx, r in sup.iterrows():
            kind = json.loads(r.attrs_json)["supplier_kind"]
            cand = pl[pl.basic_category.isin(KIND_TO_CAT[kind]) & ~pl.id.isin(used)].copy()
            if cand.empty: continue
            cand["d"] = (cand.lat - r.lat) ** 2 + (cand.lon - r.lon) ** 2
            p = cand.sort_values("d").iloc[0]; used.add(p.id)
            a_ = json.loads(r.attrs_json); a_.update({"overture_id": p.id, "chain_brand": p.brand if isinstance(p.brand, str) else None,
                                                      "ownership": "chain" if isinstance(p.brand, str) else a_["ownership"]})
            df.loc[idx, ["name", "lat", "lon", "data_origin", "attrs_json"]] = [p["name"], p.lat, p.lon, "real_public", json.dumps(a_, ensure_ascii=False)]
    df.to_csv(a.out, index=False); print("wrote", a.out)


if __name__ == "__main__":
    main()
