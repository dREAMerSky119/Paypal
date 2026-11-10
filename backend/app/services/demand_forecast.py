
import csv
import math
from pathlib import Path
from datetime import datetime


# Locate the existing master dataset
BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_FILE = BACKEND_DIR / "scripts" / "data" / "wayfare_master.csv"


def load_demand_data():
    """Load monthly demand records from the master dataset."""

    if not DATA_FILE.exists():
        raise FileNotFoundError(
            f"Demand dataset not found: {DATA_FILE}"
        )

    records = []

    with DATA_FILE.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)

        for row in reader:
            if row.get("record_type") != "demand_monthly":
                continue

            records.append({
                "destination": row["destination_slug"],
                "period": row["period"],
                "value": float(row["index_value"]),
                "data_origin": row["data_origin"],
            })

    return records


def get_demand_destinations():
    """Return all destinations available for forecasting."""

    records = load_demand_data()
    destinations = sorted({
        record["destination"] for record in records
    })

    return [
        {
            "slug": slug,
            "name": slug.replace("-", " ").title(),
        }
        for slug in destinations
    ]


def calculate_linear_trend(values):
    """Calculate a simple linear trend using least squares."""

    count = len(values)

    if count < 2:
        return 0.0, values[0] if values else 0.0

    x_values = list(range(count))
    x_mean = sum(x_values) / count
    y_mean = sum(values) / count

    denominator = sum(
        (x - x_mean) ** 2 for x in x_values
    )

    if denominator == 0:
        return 0.0, y_mean

    slope = sum(
        (x_values[i] - x_mean) * (values[i] - y_mean)
        for i in range(count)
    ) / denominator

    intercept = y_mean - slope * x_mean

    return slope, intercept


def get_demand_forecast(destination_slug, horizon=6):
    """
    Generate a destination-specific monthly demand forecast.

    Uses historical seasonal patterns and a linear trend.
    The forecast is an estimate based on synthetic calibrated data.
    """

    if not 1 <= horizon <= 12:
        raise ValueError("Forecast horizon must be between 1 and 12 months.")

    records = load_demand_data()

    history = [
        record for record in records
        if record["destination"] == destination_slug
    ]

    if not history:
        raise ValueError(
            f"No demand data found for destination: {destination_slug}"
        )

    history.sort(key=lambda record: record["period"])

    values = [record["value"] for record in history]

    if len(values) < 12:
        raise ValueError("At least 12 months of history are required.")

    # Calculate average demand for each calendar month.
    monthly_averages = {month: [] for month in range(1, 13)}

    for record in history:
        month = int(record["period"].split("-")[1])
        monthly_averages[month].append(record["value"])

    overall_average = sum(values) / len(values)

    seasonal_indices = {}

    for month, month_values in monthly_averages.items():
        average = (
            sum(month_values) / len(month_values)
            if month_values else overall_average
        )

        seasonal_indices[month] = (
            average / overall_average if overall_average else 1.0
        )

    # Remove seasonality before calculating the underlying trend.
    deseasonalized = []

    for record in history:
        month = int(record["period"].split("-")[1])
        seasonal_factor = seasonal_indices[month]

        deseasonalized.append(
            record["value"] / seasonal_factor
        )

    slope, intercept = calculate_linear_trend(deseasonalized)

    # Estimate historical model error.
    residuals = []

    for index, actual in enumerate(deseasonalized):
        predicted = intercept + slope * index
        residuals.append(actual - predicted)

    residual_std = math.sqrt(
        sum(error ** 2 for error in residuals)
        / max(1, len(residuals) - 2)
    )

    # Keep the last historical period for future date calculation.
    last_date = datetime.strptime(
        history[-1]["period"], "%Y-%m"
    )

    forecast = []

    for step in range(1, horizon + 1):
        future_month_number = last_date.month + step
        year = last_date.year + (future_month_number - 1) // 12
        month = (future_month_number - 1) % 12 + 1

        period = f"{year}-{month:02d}"

        trend_position = len(history) - 1 + step
        trend_value = max(
            0,
            intercept + slope * trend_position
        )

        seasonal_factor = seasonal_indices[month]
        predicted = trend_value * seasonal_factor

        # Approximate 80% uncertainty interval.
        uncertainty = (
            1.28 * residual_std
            * math.sqrt(1 + step / 12)
            * seasonal_factor
        )

        forecast.append({
            "period": period,
            "predicted": round(predicted, 2),
            "lower": round(max(0, predicted - uncertainty), 2),
            "upper": round(predicted + uncertainty, 2),
        })

    # Compare the latest 12 months with the preceding 12 months.
    recent_average = sum(values[-12:]) / 12
    previous_average = sum(values[-24:-12]) / 12

    growth_rate = (
        ((recent_average - previous_average) / previous_average) * 100
        if previous_average else 0
    )

    seasonality = [
        {
            "month": datetime(2024, month, 1).strftime("%b"),
            "month_number": month,
            "index": round(seasonal_indices[month], 3),
        }
        for month in range(1, 13)
    ]

    return {
        "destination": destination_slug,
        "latest_period": history[-1]["period"],
        "forecast_horizon": horizon,
        "confidence_level": 80,
        "model": "Seasonal trend projection",
        "data_origin": "synthetic_calibrated",
        "data_note": (
            "Historical demand values are synthetic calibrated indices, "
            "not verified tourist-arrival statistics."
        ),
        "growth_rate": round(growth_rate, 2),
        "historical": [
            {
                "period": record["period"],
                "actual": round(record["value"], 2),
            }
            for record in history
        ],
        "forecast": forecast,
        "seasonality": seasonality,
    }
