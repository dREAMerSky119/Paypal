import { formatDisplayPrice } from "../lib/currency.js";

export default function PriceDisplay({ amount, currency, usdReference, displayCurrency = "USD", compact = false, sourceLabel = "Supplier price" }) {
  const price = formatDisplayPrice({ amount, sourceCurrency: currency, usdReference, displayCurrency, sourceLabel });
  return <span className={`price-display ${compact ? "price-display-compact" : ""}`}>
    <span>{price.formatted}</span>
    <small>{price.note}</small>
  </span>;
}
