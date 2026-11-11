
"""Profitability calculations for Wayfare."""

from datetime import datetime, date

from app.services.seed import load_json


def get_bookings():
    """Load the generated booking records."""
    return load_json("bookings.json")


def get_supplier_names():
    """Map supplier id to display name; falls back to the raw id."""
    try:
        suppliers = load_json("inventory_suppliers.json")
        return {s["id"]: s.get("name") or s["id"] for s in suppliers}
    except Exception:
        return {}


def filter_bookings_by_date(bookings, from_date=None, to_date=None):
    """Filter bookings using an inclusive date range."""

    if from_date and to_date and from_date > to_date:
        raise ValueError("'from' date cannot be later than 'to' date")

    if not from_date and not to_date:
        return list(bookings)

    filtered_bookings = []

    for booking in bookings:
        try:
            booking_date = date.fromisoformat(booking.get("date", ""))
        except (ValueError, TypeError):
            continue

        if from_date and booking_date < from_date:
            continue

        if to_date and booking_date > to_date:
            continue

        filtered_bookings.append(booking)

    return filtered_bookings


def get_season(date_value):
    """Determine the calendar season from a booking date."""

    try:
        month = datetime.strptime(date_value, "%Y-%m-%d").month
    except (ValueError, TypeError):
        return "Unknown"

    if month in (12, 1, 2):
        return "Winter"
    elif month in (3, 4, 5):
        return "Spring"
    elif month in (6, 7, 8):
        return "Summer"
    else:
        return "Autumn"


def get_group_name(booking, group_by):
    """Get the appropriate grouping value for a booking."""

    if group_by == "destination":
        return booking.get("destination") or "Unknown"

    if group_by == "supplier":
        return booking.get("supplier_id") or "Unknown"

    if group_by == "package":
        package_type = booking.get("type") or "Unknown"
        tier = booking.get("tier") or "Unknown"
        return f"{package_type} - {tier}"

    if group_by == "season":
        return get_season(booking.get("date"))

    raise ValueError("Invalid profitability grouping")


def calculate_summary(bookings):
    """Calculate the main profitability metrics."""

    gross_sales = 0.0
    total_net_cost = 0.0
    completed_profit = 0.0
    cancellation_leakage = 0.0
    margin_forgone_on_cancelled = 0.0

    completed_bookings = 0
    cancelled_bookings = 0

    for booking in bookings:

        sell_amount = float(booking["sell_amount"])
        net_amount = float(booking["net_amount"])
        fees = float(booking["fees"])
        cancel_penalty = float(booking.get("cancel_penalty", 0))

        if booking["is_canceled"]:
            cancelled_bookings += 1
            cancellation_leakage += cancel_penalty
            # Margin the deal would have earned had it completed. Kept out of
            # gross_profit on purpose: a cancelled booking never counts as sales.
            margin_forgone_on_cancelled += sell_amount - net_amount - fees

        else:
            completed_bookings += 1

            gross_sales += sell_amount
            total_net_cost += net_amount

            booking_profit = sell_amount - net_amount - fees
            completed_profit += booking_profit

    gross_profit = completed_profit - cancellation_leakage

    gross_margin = (
        (gross_profit / gross_sales) * 100
        if gross_sales > 0
        else 0
    )

    return {
        "gross_sales": round(gross_sales, 2),
        "total_net_cost": round(total_net_cost, 2),
        "gross_profit": round(gross_profit, 2),
        "gross_margin": round(gross_margin, 2),
        "cancellation_leakage": round(cancellation_leakage, 2),
        "margin_forgone_on_cancelled": round(margin_forgone_on_cancelled, 2),
        "completed_bookings": completed_bookings,
        "cancelled_bookings": cancelled_bookings,
        "total_bookings": len(bookings),
        "currency": "USD",
        "is_sample": True,
    }


def get_profitability_summary(from_date=None, to_date=None):
    """Load bookings and return their filtered profitability summary."""

    bookings = get_bookings()
    bookings = filter_bookings_by_date(bookings, from_date, to_date)

    return calculate_summary(bookings)


def calculate_supplier_ranking(bookings, by="gross_profit", limit=10):
    """Rank suppliers by gross profit or gross margin, best first."""

    if by not in ("gross_profit", "gross_margin"):
        raise ValueError("by must be 'gross_profit' or 'gross_margin'")

    limit = int(limit)
    if limit < 1:
        raise ValueError("limit must be at least 1")

    suppliers = {}

    for booking in bookings:
        supplier_id = booking.get("supplier_id") or "Unknown"
        supplier = suppliers.setdefault(supplier_id, {
            "supplier_id": supplier_id,
            "name": booking.get("supplier_name") or supplier_id,
            "gross_sales": 0.0,
            "total_net_cost": 0.0,
            "completed_profit": 0.0,
            "cancellation_leakage": 0.0,
            "completed_bookings": 0,
            "cancelled_bookings": 0,
        })

        sell_amount = float(booking["sell_amount"])
        net_amount = float(booking["net_amount"])
        fees = float(booking["fees"])
        penalty = float(booking.get("cancel_penalty", 0))

        if booking["is_canceled"]:
            supplier["cancelled_bookings"] += 1
            supplier["cancellation_leakage"] += penalty
        else:
            supplier["completed_bookings"] += 1
            supplier["gross_sales"] += sell_amount
            supplier["total_net_cost"] += net_amount
            supplier["completed_profit"] += sell_amount - net_amount - fees

    results = []
    for supplier in suppliers.values():
        gross_profit = supplier["completed_profit"] - supplier["cancellation_leakage"]
        gross_margin = (
            (gross_profit / supplier["gross_sales"]) * 100
            if supplier["gross_sales"] > 0
            else 0
        )
        results.append({
            "name": supplier["name"],
            "supplier_id": supplier["supplier_id"],
            "gross_sales": round(supplier["gross_sales"], 2),
            "total_net_cost": round(supplier["total_net_cost"], 2),
            "gross_profit": round(gross_profit, 2),
            "gross_margin": round(gross_margin, 2),
            "cancellation_leakage": round(supplier["cancellation_leakage"], 2),
            "completed_bookings": supplier["completed_bookings"],
            "cancelled_bookings": supplier["cancelled_bookings"],
        })

    key = "gross_profit" if by == "gross_profit" else "gross_margin"
    results.sort(key=lambda item: item[key], reverse=True)

    for rank, row in enumerate(results, start=1):
        row["rank"] = rank

    return results[:limit]


def calculate_breakdown(bookings, group_by):
    """Calculate profitability grouped by destination, supplier, package or season."""

    valid_groups = ("destination", "supplier", "package", "season")

    if group_by not in valid_groups:
        raise ValueError(
            f"group_by must be one of: {', '.join(valid_groups)}"
        )

    groups = {}

    for booking in bookings:

        group_name = get_group_name(booking, group_by)

        if group_name not in groups:
            groups[group_name] = {
                "name": group_name,
                "gross_sales": 0.0,
                "total_net_cost": 0.0,
                "completed_profit": 0.0,
                "cancellation_leakage": 0.0,
                "completed_bookings": 0,
                "cancelled_bookings": 0,
            }

        group = groups[group_name]

        sell_amount = float(booking["sell_amount"])
        net_amount = float(booking["net_amount"])
        fees = float(booking["fees"])
        penalty = float(booking.get("cancel_penalty", 0))

        if booking["is_canceled"]:

            group["cancelled_bookings"] += 1
            group["cancellation_leakage"] += penalty

        else:

            group["completed_bookings"] += 1
            group["gross_sales"] += sell_amount
            group["total_net_cost"] += net_amount

            group["completed_profit"] += (
                sell_amount - net_amount - fees
            )

    results = []

    for group in groups.values():

        gross_profit = (
            group["completed_profit"]
            - group["cancellation_leakage"]
        )

        gross_sales = group["gross_sales"]

        gross_margin = (
            (gross_profit / gross_sales) * 100
            if gross_sales > 0
            else 0
        )

        results.append({
            "name": group["name"],
            "gross_sales": round(gross_sales, 2),
            "total_net_cost": round(group["total_net_cost"], 2),
            "gross_profit": round(gross_profit, 2),
            "gross_margin": round(gross_margin, 2),
            "cancellation_leakage": round(
                group["cancellation_leakage"], 2
            ),
            "completed_bookings": group["completed_bookings"],
            "cancelled_bookings": group["cancelled_bookings"],
        })

    return sorted(
        results,
        key=lambda item: item["gross_profit"],
        reverse=True
    )


def calculate_monthly_trend(bookings):
    """Calculate profitability metrics month by month."""

    months = {}

    for booking in bookings:
        date_value = booking.get("date")

        try:
            booking_date = datetime.strptime(
                date_value, "%Y-%m-%d"
            )
        except (ValueError, TypeError):
            continue

        month_key = booking_date.strftime("%Y-%m")
        month_label = booking_date.strftime("%b %Y")

        if month_key not in months:
            months[month_key] = {
                "month": month_key,
                "label": month_label,
                "gross_sales": 0.0,
                "total_net_cost": 0.0,
                "completed_profit": 0.0,
                "cancellation_leakage": 0.0,
                "completed_bookings": 0,
                "cancelled_bookings": 0,
            }

        month = months[month_key]

        sell_amount = float(booking["sell_amount"])
        net_amount = float(booking["net_amount"])
        fees = float(booking["fees"])
        penalty = float(booking.get("cancel_penalty", 0))

        if booking["is_canceled"]:
            month["cancelled_bookings"] += 1
            month["cancellation_leakage"] += penalty

        else:
            month["completed_bookings"] += 1
            month["gross_sales"] += sell_amount
            month["total_net_cost"] += net_amount

            month["completed_profit"] += (
                sell_amount - net_amount - fees
            )

    results = []

    for month in months.values():
        gross_profit = (
            month["completed_profit"]
            - month["cancellation_leakage"]
        )

        gross_sales = month["gross_sales"]

        gross_margin = (
            (gross_profit / gross_sales) * 100
            if gross_sales > 0
            else 0
        )

        results.append({
            "month": month["month"],
            "label": month["label"],
            "gross_sales": round(gross_sales, 2),
            "total_net_cost": round(month["total_net_cost"], 2),
            "gross_profit": round(gross_profit, 2),
            "gross_margin": round(gross_margin, 2),
            "cancellation_leakage": round(
                month["cancellation_leakage"], 2
            ),
            "completed_bookings": month["completed_bookings"],
            "cancelled_bookings": month["cancelled_bookings"],
        })

    return sorted(results, key=lambda item: item["month"])


def calculate_markup_what_if(bookings, markup_percentage):
    """
    Simulate profitability using a proposed markup percentage.

    Markup is calculated on the total net supplier cost.
    """

    total_net_cost = 0.0
    current_gross_sales = 0.0
    total_fees = 0.0
    cancellation_leakage = 0.0
    completed_bookings = 0
    cancelled_bookings = 0

    for booking in bookings:
        net_amount = float(booking["net_amount"])
        sell_amount = float(booking["sell_amount"])
        fees = float(booking["fees"])
        penalty = float(booking.get("cancel_penalty", 0))

        if booking["is_canceled"]:
            cancelled_bookings += 1
            cancellation_leakage += penalty

        else:
            completed_bookings += 1
            total_net_cost += net_amount
            current_gross_sales += sell_amount
            total_fees += fees

    current_markup = (
        ((current_gross_sales - total_net_cost) / total_net_cost) * 100
        if total_net_cost > 0
        else 0
    )

    current_gross_profit = (
        current_gross_sales
        - total_net_cost
        - total_fees
        - cancellation_leakage
    )

    current_gross_margin = (
        (current_gross_profit / current_gross_sales) * 100
        if current_gross_sales > 0
        else 0
    )

    projected_gross_sales = (
        total_net_cost * (1 + markup_percentage / 100)
    )

    projected_gross_profit = (
        projected_gross_sales
        - total_net_cost
        - total_fees
        - cancellation_leakage
    )

    projected_gross_margin = (
        (projected_gross_profit / projected_gross_sales) * 100
        if projected_gross_sales > 0
        else 0
    )

    profit_difference = projected_gross_profit - current_gross_profit

    return {
        "current_markup": round(current_markup, 2),
        "proposed_markup": round(markup_percentage, 2),
        "current_gross_sales": round(current_gross_sales, 2),
        "projected_gross_sales": round(projected_gross_sales, 2),
        "current_gross_profit": round(current_gross_profit, 2),
        "projected_gross_profit": round(projected_gross_profit, 2),
        "current_gross_margin": round(current_gross_margin, 2),
        "projected_gross_margin": round(projected_gross_margin, 2),
        "profit_difference": round(profit_difference, 2),
        "total_net_cost": round(total_net_cost, 2),
        "total_fees": round(total_fees, 2),
        "cancellation_leakage": round(cancellation_leakage, 2),
        "completed_bookings": completed_bookings,
        "cancelled_bookings": cancelled_bookings,
        "currency": "USD",
        "is_sample": True,
    }
