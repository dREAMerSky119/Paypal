
import csv
import json
from pathlib import Path

# Locate the project folders
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent

# Input and output files
INPUT_FILE = SCRIPT_DIR / "data" / "wayfare_master.csv"
OUTPUT_FILE = BACKEND_DIR / "app" / "data" / "bookings.json"


def build_bookings():
    bookings = []

    with INPUT_FILE.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)

        for row in reader:

            # Keep only booking records
            if row["record_type"] != "booking":
                continue

            # Extract additional booking information
            attrs = json.loads(row["attrs_json"] or "{}")

            booking = {
                "id": row["record_id"],
                "item_id": row["parent_id"],
                "trip_id": row["related_id"],
                "destination": row["destination_slug"],
                "channel": row["category"],
                "type": row["subtype"],
                "tier": row["tier"],
                "date": row["date"],
                "month": row["period"],
                "currency": row["currency"],
                "net_amount": float(row["price_net"]),
                "sell_amount": float(row["price_sell"]),
                "fees": float(row["fees"]),
                "quantity": float(row["quantity"]),
                "nights": float(row["nights"]),
                "lead_time_days": float(row["lead_time_days"]),
                "is_canceled": float(row["is_canceled"] or 0) == 1.0,
                "supplier_id": attrs.get("supplier_id"),
                "cancel_penalty": float(
                    attrs.get("cancel_penalty_usd", 0)
                ),
                "data_origin": row["data_origin"],
            }

            bookings.append(booking)

    # Save the extracted booking records
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    with OUTPUT_FILE.open("w", encoding="utf-8") as file:
        json.dump(bookings, file, indent=2)

    print("Booking data created successfully!")
    print(f"Total bookings: {len(bookings)}")
    print(f"Output file: {OUTPUT_FILE}")


if __name__ == "__main__":
    build_bookings()
