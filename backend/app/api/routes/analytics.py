
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.services.profitability import (
    get_bookings,
    get_profitability_summary,
    filter_bookings_by_date,
    calculate_breakdown,
    calculate_monthly_trend,
    calculate_markup_what_if,
)

router = APIRouter()


def get_filtered_bookings(from_date=None, to_date=None):
    """Load bookings and apply the requested date range."""

    try:
        return filter_bookings_by_date(
            get_bookings(),
            from_date,
            to_date,
        )
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@router.get("/profitability/summary")
def profitability_summary(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
):
    try:
        return get_profitability_summary(from_date, to_date)
    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@router.get("/profitability/breakdown")
def profitability_breakdown(
    group_by: str = Query(
        default="destination",
        description="Group by destination, supplier, package or season",
        pattern="^(destination|supplier|package|season)$",
    ),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
):
    bookings = get_filtered_bookings(from_date, to_date)

    try:
        results = calculate_breakdown(
            bookings,
            group_by,
        )

        return {
            "group_by": group_by,
            "total_groups": len(results),
            "results": results,
            "currency": "USD",
            "is_sample": True,
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )


@router.get("/profitability/monthly-trend")
def profitability_monthly_trend(
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
):
    bookings = get_filtered_bookings(from_date, to_date)

    results = calculate_monthly_trend(bookings)

    return {
        "month_count": len(results),
        "results": results,
        "currency": "USD",
        "is_sample": True,
    }


@router.get("/profitability/markup-what-if")
def profitability_markup_what_if(
    markup_percentage: float = Query(
        default=15,
        ge=0,
        le=100,
        description="Proposed markup percentage (0 to 100)",
    ),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
):
    bookings = get_filtered_bookings(from_date, to_date)

    results = calculate_markup_what_if(
        bookings,
        markup_percentage,
    )

    return results
