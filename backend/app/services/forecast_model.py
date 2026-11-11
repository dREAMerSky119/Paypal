"""Pure demand-forecast model code, shared by the offline training script.

Phase E of the Wayfare plan: forecasts are fitted OFFLINE by
`scripts/train_forecast.py` and committed to `app/data/forecast_seed.json`.
The running app never fits a model on request; it only slices the committed
forecast. This module holds the fitting/backtest math so the training script
and its tests share one implementation. Stdlib only, so the script runs on a
fresh clone without installing the heavier requirements.
"""
from __future__ import annotations

import csv
import math
from datetime import datetime

SHOULDER_THRESHOLD = 0.9   # a calendar month counts as shoulder season when its seasonal index is below this
HOLDOUT_MONTHS = 6         # months held back for the backtest
MAX_HORIZON = 12           # months of committed forecast per destination
CONFIDENCE_LEVEL = 80      # the approximate prediction-interval level, in percent
Z_80 = 1.28                # two-sided 80% normal quantile

TREND_MODEL = "Seasonal trend projection"
NAIVE_MODEL = "Seasonal naive (12-month)"


def month_of(period: str) -> int:
    """Month number of a `YYYY-MM` period."""
    return int(period.split("-")[1])


def shift_period(period: str, steps: int) -> str:
    """`YYYY-MM` moved `steps` months forward (negative moves back)."""
    year, month = int(period[:4]), int(period[5:7])
    total = year * 12 + (month - 1) + steps
    return f"{total // 12}-{total % 12 + 1:02d}"


def month_label(period: str) -> str:
    return datetime(int(period[:4]), month_of(period), 1).strftime("%b")


def load_master_demand(csv_path) -> dict:
    """`demand_monthly` rows of the master dataset, grouped and period-sorted."""
    history = {}
    with open(csv_path, "r", encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            if row.get("record_type") != "demand_monthly":
                continue
            history.setdefault(row["destination_slug"], []).append({
                "period": row["period"],
                "value": float(row["index_value"]),
                "country": row.get("country") or "",
            })
    for rows in history.values():
        rows.sort(key=lambda record: record["period"])
    return history


def _linear_trend(values):
    count = len(values)
    if count < 2:
        return 0.0, values[0] if values else 0.0
    x_values = list(range(count))
    x_mean = sum(x_values) / count
    y_mean = sum(values) / count
    denominator = sum((x - x_mean) ** 2 for x in x_values)
    if denominator == 0:
        return 0.0, y_mean
    slope = sum((x_values[i] - x_mean) * (values[i] - y_mean) for i in range(count)) / denominator
    return slope, y_mean - slope * x_mean


def fit_seasonal_trend(history):
    """Fit the seasonal-trend model on `history`; the same maths the service
    used to run per request, now only ever run offline."""
    values = [row["value"] for row in history]
    overall = sum(values) / len(values)
    monthly = {month: [] for month in range(1, 13)}
    for row in history:
        monthly[month_of(row["period"])].append(row["value"])
    seasonal = {}
    for month, month_values in monthly.items():
        average = sum(month_values) / len(month_values) if month_values else overall
        seasonal[month] = average / overall if overall else 1.0
    deseasonalized = [row["value"] / seasonal[month_of(row["period"])] for row in history]
    slope, intercept = _linear_trend(deseasonalized)
    residuals = [actual - (intercept + slope * index) for index, actual in enumerate(deseasonalized)]
    resid_std = math.sqrt(sum(error ** 2 for error in residuals) / max(1, len(residuals) - 2))
    return {
        "kind": "trend",
        "slope": slope,
        "intercept": intercept,
        "seasonal": seasonal,
        "resid_std": resid_std,
        "n": len(history),
    }


def _naive_reference(history, month):
    """Latest observed value of `month` in `history`, or the month's mean."""
    same_month = [row["value"] for row in history if month_of(row["period"]) == month]
    if not same_month:
        return None
    return same_month[-1]


def fit_seasonal_naive(history):
    residuals = []
    for index, row in enumerate(history):
        if index < 12:
            continue
        reference = history[index - 12]["value"]  # same calendar month one year earlier
        residuals.append(row["value"] - reference)
    resid_std = math.sqrt(sum(error ** 2 for error in residuals) / max(1, len(residuals))) if residuals else 0.0
    return {"kind": "naive", "history": history, "resid_std": resid_std}


def _interval(std, step, factor=1.0):
    return Z_80 * std * math.sqrt(1 + step / MAX_HORIZON) * factor


def predict(model, last_period, steps):
    """`steps` future points with an approximate 80% interval."""
    points = []
    for step in range(1, steps + 1):
        period = shift_period(last_period, step)
        month = month_of(period)
        if model["kind"] == "trend":
            factor = model["seasonal"][month]
            trend_value = max(0.0, model["intercept"] + model["slope"] * (model["n"] - 1 + step))
            predicted = trend_value * factor
            uncertainty = _interval(model["resid_std"], step, factor)
        else:
            predicted = _naive_reference(model["history"], month) or 0.0
            uncertainty = _interval(model["resid_std"], step)
        points.append({
            "period": period,
            "predicted": round(predicted, 2),
            "lower": round(max(0.0, predicted - uncertainty), 2),
            "upper": round(predicted + uncertainty, 2),
        })
    return points


def seasonality_table(model):
    return [
        {
            "month": datetime(2024, month, 1).strftime("%b"),
            "month_number": month,
            "index": round(model["seasonal"][month], 3),
        }
        for month in range(1, 13)
    ]


def growth_rate(history):
    values = [row["value"] for row in history]
    if len(values) < 24:
        return 0.0
    recent = sum(values[-12:]) / 12
    previous = sum(values[-24:-12]) / 12
    return round(((recent - previous) / previous) * 100, 2) if previous else 0.0


def backtest(history, holdout=HOLDOUT_MONTHS):
    """Hold out the last `holdout` months; MAE of the seasonal-trend model vs
    a seasonal-naive baseline (same calendar month one year earlier), both
    fitted only on the training months."""
    if len(history) < holdout + 14:
        return None
    train, test = history[:-holdout], history[-holdout:]
    model = fit_seasonal_trend(train)
    predictions = predict(model, train[-1]["period"], holdout)
    model_error = sum(abs(row["value"] - point["predicted"]) for row, point in zip(test, predictions)) / holdout

    naive_errors = []
    for row in test:
        month = month_of(row["period"])
        reference = _naive_reference(train, shift_period(row["period"], -12)) if shift_period(row["period"], -12) <= train[-1]["period"] else None
        if reference is None:
            reference = _naive_reference(train, month)
        if reference is None:
            return None
        naive_errors.append(abs(row["value"] - reference))
    baseline_error = sum(naive_errors) / holdout

    mean_test = sum(row["value"] for row in test) / holdout or 1.0
    return {
        "method": (
            f"held out the last {holdout} months ({test[0]['period']} to {test[-1]['period']}); "
            "mean absolute error on the demand index; baseline = seasonal naive (same calendar month one year earlier)"
        ),
        "test_periods": [row["period"] for row in test],
        "model_error": round(model_error, 3),
        "baseline_error": round(baseline_error, 3),
        "model_error_rel": round(model_error / mean_test, 4),
        "baseline_error_rel": round(baseline_error / mean_test, 4),
        "beats_baseline": model_error < baseline_error,
    }


def score_destination(country, history):
    """Choose the served model and its confidence level.

    The trend model is kept only when it beats the seasonal-naive baseline on
    the held-out months; otherwise the naive model is served and confidence is
    low. India destinations are always flagged low confidence until real
    arrival data replaces the calibrated sample.
    """
    bt = backtest(history)
    if bt is None:
        confidence, note = "low", "Not enough history to run the held-out backtest."
        model = NAIVE_MODEL
    elif bt["beats_baseline"]:
        model = TREND_MODEL
        relative = bt["model_error_rel"]
        if relative <= 0.10:
            confidence = "high"
            note = f"Beat the seasonal-naive baseline on held-out months (relative MAE {relative:.0%})."
        else:
            confidence = "medium"
            note = f"Beat the seasonal-naive baseline on held-out months, but the relative error ({relative:.0%}) is material."
    else:
        model = NAIVE_MODEL
        confidence = "low"
        note = (
            f"Did not beat the seasonal-naive baseline on held-out months "
            f"(MAE {bt['model_error']} vs {bt['baseline_error']}); the naive model is served instead."
        )
    if country == "India":
        confidence = "low"
        note += " India destinations are flagged low confidence until real arrival data replaces the calibrated sample."
    return model, bt, confidence, note