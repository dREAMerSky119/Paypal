import { Link } from "react-router-dom";
import { Info } from "lucide-react";

// Shown on every workspace page: nothing in this build is a live rate, booking or forecast.
export default function SampleDataBanner() {
  return (
    <div className="sample-data-banner" data-testid="sample-data-banner">
      <Info size={14} aria-hidden="true" />
      <p>
        <strong>Sample data.</strong> Rates, bookings, forecasts and scores here are seeded or simulated, not live.{" "}
        <Link to="/attribution">Sources and attribution</Link>
      </p>
    </div>
  );
}
