
from app.services.profitability import (
    get_bookings,
    calculate_breakdown,
)

bookings = get_bookings()

# Destination breakdown
destinations = calculate_breakdown(
    bookings,
    "destination"
)

print("\nPROFITABILITY BY DESTINATION")
print("-" * 50)

for destination in destinations:
    print(
        destination["name"],
        "| Sales:", destination["gross_sales"],
        "| Profit:", destination["gross_profit"],
        "| Margin:", destination["gross_margin"], "%"
    )

print("\nTotal destinations:", len(destinations))

# Supplier breakdown
suppliers = calculate_breakdown(
    bookings,
    "supplier"
)

print("\nPROFITABILITY BY SUPPLIER")
print("-" * 50)

for supplier in suppliers[:10]:
    print(
        supplier["name"],
        "| Sales:", supplier["gross_sales"],
        "| Profit:", supplier["gross_profit"],
        "| Margin:", supplier["gross_margin"], "%"
    )

print("\nTotal suppliers:", len(suppliers))
