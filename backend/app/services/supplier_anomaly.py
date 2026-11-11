
import json
import joblib
import pandas as pd
import numpy as np
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1] / "data"

# Load the saved ML model
bundle = joblib.load(BASE_DIR / "anomaly_model.joblib")
model = bundle["model"]
features = bundle["features"]

# Load the original dataset
raw_data = pd.read_csv(
    BASE_DIR / "wayfare_master.csv",
    low_memory=False
)

# Keep only room-night rate records
rate_data = raw_data[raw_data["record_type"] == "rate"].copy()

def get_unit(value):
    try:
        return json.loads(value).get("unit")
    except (TypeError, json.JSONDecodeError):
        return None

rate_data["unit"] = rate_data["attrs_json"].apply(get_unit)
history = rate_data[rate_data["unit"] == "per_room_night"].copy()

history["period"] = pd.to_datetime(
    history["period"], format="%Y-%m", errors="coerce"
)
history["price_usd"] = pd.to_numeric(
    history["price_net_usd"], errors="coerce"
)

history = history.dropna(
    subset=["parent_id", "period", "price_usd"]
)

history = history[
    ["parent_id", "period", "price_usd"]
].copy()


def detect_anomalies(new_records):
    new_data = pd.DataFrame(new_records)

    required = {"parent_id", "period", "price_usd"}
    if not required.issubset(new_data.columns):
        raise ValueError(
            "Each record needs parent_id, period, and price_usd"
        )

    new_data["period"] = pd.to_datetime(new_data["period"])
    new_data["price_usd"] = pd.to_numeric(
        new_data["price_usd"], errors="coerce"
    )

    new_data = new_data.dropna(
        subset=["parent_id", "period", "price_usd"]
    ).copy()

    new_data["_is_new"] = True

    past_data = history.copy()
    past_data["_is_new"] = False

    combined = pd.concat(
        [past_data, new_data], ignore_index=True
    )

    combined = combined.sort_values(
        ["parent_id", "period"]
    ).copy()

    combined["month"] = combined["period"].dt.month
    combined["year"] = combined["period"].dt.year

    grouped = combined.groupby("parent_id")["price_usd"]

    combined["previous_month_price"] = grouped.shift(1)

    combined["monthly_price_ratio"] = (
        combined["price_usd"] /
        combined["previous_month_price"].where(
            combined["previous_month_price"] > 0
        )
    )

    combined["past_6m_median"] = grouped.transform(
        lambda x: x.shift(1).rolling(
            window=6, min_periods=3
        ).median()
    )

    combined["past_price_ratio"] = (
        combined["price_usd"] /
        combined["past_6m_median"].where(
            combined["past_6m_median"] > 0
        )
    )

    combined["past_6m_std"] = grouped.transform(
        lambda x: x.shift(1).rolling(
            window=6, min_periods=3
        ).std()
    )

    combined["past_6m_mean"] = grouped.transform(
        lambda x: x.shift(1).rolling(
            window=6, min_periods=3
        ).mean()
    )

    combined["past_6m_cv"] = (
        combined["past_6m_std"] /
        combined["past_6m_mean"].abs()
    )

    X = combined[features].replace(
        [np.inf, -np.inf], np.nan
    )

    valid = X.notna().all(axis=1)

    combined["ml_flag"] = False
    combined.loc[valid, "ml_flag"] = (
        model.predict(X.loc[valid]) == -1
    )

    combined["rule_flag"] = (
        (combined["price_usd"] <= 0) |
        (combined["past_price_ratio"] > 2) |
        (combined["past_price_ratio"] < 0.35) |
        (combined["monthly_price_ratio"] > 2)
    )

    combined["final_flag"] = (
        combined["rule_flag"] | combined["ml_flag"]
    )

    def explain(row):
        reasons = []

        if row["price_usd"] <= 0:
            reasons.append("Zero or negative price")

        if row["past_price_ratio"] > 2:
            reasons.append("Price is more than 2x its historical median")

        if row["past_price_ratio"] < 0.35:
            reasons.append("Price is unusually low")

        if row["monthly_price_ratio"] > 2:
            reasons.append("Price increased more than 2x from previous record")

        if row["ml_flag"]:
            reasons.append("Machine learning detected an unusual pattern")

        return reasons

    combined["explanation"] = combined.apply(explain, axis=1)

    results = combined[combined["_is_new"]].copy()
    results = results.drop(columns=["_is_new"])

    return json.loads(
        results.to_json(orient="records", date_format="iso")
    )


def list_items():
    items = raw_data[raw_data["record_type"] == "item"]

    result = []

    for _, row in items.iterrows():
        result.append({
            "parent_id": str(row["record_id"]),
            "name": str(row["name"]),
            "destination": str(row["destination_slug"]),
        })

    return sorted(result, key=lambda item: item["name"].lower())