import { formatDisplayPrice } from "../lib/currency.js";
import { useDisplayCurrency } from "../lib/useDisplayCurrency.js";

/**
 * One price. `displayCurrency` defaults to the user's preferred currency; amounts are converted
 * through the shared exchange-rate layer, and the note under the figure says how.
 */
export default function PriceDisplay({ amount, currency, usdReference, displayCurrency, compact = false, sourceLabel = "Supplier price" }) {
  const fx = useDisplayCurrency();
  const price = formatDisplayPrice({
    amount, sourceCurrency: currency, usdReference, sourceLabel,
    displayCurrency: displayCurrency ?? fx.currency, rates: fx.rates, rateNote: fx.rateLabel,
  });
  return <span className={`price-display ${compact ? "price-display-compact" : ""}`}>
    <span>{price.formatted}</span>
    <small>{price.note}</small>
  </span>;
}
