import { formatMoney } from "./format.js";
import { convertAmount } from "./fx.js";

export const CURRENCY_OPTIONS = [
  ["USD", "US dollar (USD)"], ["INR", "Indian rupee (INR)"], ["JPY", "Japanese yen (JPY)"],
  ["MAD", "Moroccan dirham (MAD)"], ["EUR", "Euro (EUR)"], ["GBP", "British pound (GBP)"],
  ["CHF", "Swiss franc (CHF)"], ["IDR", "Indonesian rupiah (IDR)"], ["ISK", "Icelandic króna (ISK)"],
  ["CAD", "Canadian dollar (CAD)"], ["AUD", "Australian dollar (AUD)"], ["SGD", "Singapore dollar (SGD)"],
  ["AED", "UAE dirham (AED)"], ["THB", "Thai baht (THB)"], ["NPR", "Nepalese rupee (NPR)"],
  ["LKR", "Sri Lankan rupee (LKR)"], ["TRY", "Turkish lira (TRY)"], ["MXN", "Mexican peso (MXN)"], ["ZAR", "South African rand (ZAR)"],
];

const NATIONALITY_CURRENCY = new Map([
  ["india", "INR"], ["indian", "INR"], ["japan", "JPY"], ["japanese", "JPY"], ["morocco", "MAD"], ["moroccan", "MAD"],
  ["italy", "EUR"], ["italian", "EUR"], ["greece", "EUR"], ["greek", "EUR"], ["france", "EUR"], ["french", "EUR"], ["germany", "EUR"], ["german", "EUR"],
  ["switzerland", "CHF"], ["swiss", "CHF"], ["indonesia", "IDR"], ["indonesian", "IDR"], ["iceland", "ISK"], ["icelandic", "ISK"],
  ["united kingdom", "GBP"], ["british", "GBP"], ["england", "GBP"], ["united states", "USD"], ["american", "USD"], ["usa", "USD"],
  ["canada", "CAD"], ["canadian", "CAD"], ["australia", "AUD"], ["australian", "AUD"], ["singapore", "SGD"], ["singaporean", "SGD"],
  ["united arab emirates", "AED"], ["emirati", "AED"], ["thailand", "THB"], ["thai", "THB"], ["nepal", "NPR"], ["nepalese", "NPR"],
  ["sri lanka", "LKR"], ["sri lankan", "LKR"], ["turkey", "TRY"], ["turkish", "TRY"], ["mexico", "MXN"], ["mexican", "MXN"], ["south africa", "ZAR"], ["south african", "ZAR"],
]);

export function currencyForNationality(nationality) {
  return NATIONALITY_CURRENCY.get(String(nationality || "").trim().toLocaleLowerCase()) || null;
}

/**
 * Picks what to show for one price.
 *  - same currency            -> the supplier amount as quoted
 *  - target USD               -> the inventory's USD reference when it has one
 *  - other target + `rates`   -> converted through USD at those rates (labelled with `rateNote`)
 *  - other target, no rates   -> the supplier amount, with a note that conversion was not possible
 * We never invent a conversion: if a rate is missing the original amount stays visible.
 */
export function displayPrice({ amount, sourceCurrency, usdReference, displayCurrency = "USD", sourceLabel = "Supplier price", rates, rateNote = "reference rate" }) {
  const source = String(sourceCurrency || "USD").toUpperCase();
  const target = String(displayCurrency || "USD").toUpperCase();
  if (source === target || (source === "USD" && target === "USD")) {
    return { amount: Number(amount), currency: source, note: sourceLabel, converted: false };
  }
  if (target === "USD" && usdReference != null && Number.isFinite(Number(usdReference))) {
    return { amount: Number(usdReference), currency: "USD", note: `USD reference estimate · ${sourceLabel} in ${source}`, converted: true };
  }
  if (rates) {
    const hasRef = usdReference != null && Number.isFinite(Number(usdReference));
    const viaUsd = source === "USD" ? Number(amount) : hasRef ? Number(usdReference) : convertAmount(amount, source, "USD", rates);
    const converted = viaUsd == null ? null : convertAmount(viaUsd, "USD", target, rates);
    if (converted != null) {
      return { amount: converted, currency: target, note: `${sourceLabel.includes(source) ? sourceLabel : `${sourceLabel} in ${source}`} · converted at ${rateNote}`, converted: true };
    }
  }
  return { amount: Number(amount), currency: source, note: `${sourceLabel} in ${source} · ${target} conversion unavailable`, converted: false };
}

export function formatDisplayPrice(input) {
  const selected = displayPrice(input);
  return { ...selected, formatted: formatMoney(selected.amount, selected.currency) };
}
