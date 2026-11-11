import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  convertAmount, ensureFxStarted, formatDisplay, formatDisplayCompact, formatDisplayWhole,
  getFxState, rateLabel, subscribeFx,
} from "./fx.js";

/**
 * The one hook every money-showing page uses. It re-renders when the preferred currency or the
 * exchange rates change, and hands back formatters that already convert into that currency.
 *
 *   const { currency, format } = useDisplayCurrency();
 *   format(1234, "USD")        // "INR 108,592"  when the profile prefers INR
 */
export function useDisplayCurrency() {
  const s = useSyncExternalStore(subscribeFx, getFxState, getFxState);
  useEffect(() => { ensureFxStarted(); }, []);
  return useMemo(() => ({
    currency: s.target,
    rates: s.rates,
    source: s.source,
    updatedAt: s.updatedAt,
    rateLabel: rateLabel(s),
    format: (amount, from = "USD") => formatDisplay(amount, from, s),
    formatWhole: (amount, from = "USD") => formatDisplayWhole(amount, from, s),
    formatCompact: (amount, from = "USD") => formatDisplayCompact(amount, from, s),
    convert: (amount, from = "USD", to = s.target) => convertAmount(amount, from, to, s.rates),
    toUsd: (amount) => convertAmount(amount, s.target, "USD", s.rates),
  }), [s]);
}
