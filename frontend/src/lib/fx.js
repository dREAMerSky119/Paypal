import { formatMoney } from "./format.js";

/**
 * Exchange-rate layer shared by every feature that shows money.
 *
 * Rates are "units of currency per 1 USD". Two sources, in order of preference:
 *   1. live   – fetched in the browser from a free, keyless rates API and cached for 12 h;
 *   2. reference – the bundled table below (the backend's own simulator assumptions where
 *      they exist). It is an indicative fallback, NOT a live market rate, and the UI says so.
 *
 * Amounts are always converted via USD, so a conversion never depends on a currency pair
 * that is not in the table. If a code is missing the caller gets `null` and shows the
 * original amount in its own currency instead of inventing a number.
 */

export const REFERENCE_PER_USD = Object.freeze({
  USD: 1,
  EUR: 0.92, JPY: 150, MAD: 9.9, INR: 88, IDR: 16300, ISK: 138, // match backend simulator_assumptions.json
  GBP: 0.78, CHF: 0.88, CAD: 1.37, AUD: 1.52, SGD: 1.3, AED: 3.6725,
  THB: 34.5, NPR: 140.8, LKR: 300, TRY: 42, MXN: 18.5, ZAR: 18,
});

const ENDPOINT = "https://open.er-api.com/v6/latest/USD";
const CACHE_KEY = "wayfare.fx.v1";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const upper = (code, fallback = "USD") => String(code || fallback).trim().toUpperCase();

export const isSupportedCurrency = (code) => Object.hasOwn(REFERENCE_PER_USD, upper(code));

/** amount in `from` -> amount in `to`, or null when either rate is unknown. */
export function convertAmount(amount, from = "USD", to = "USD", rates = REFERENCE_PER_USD) {
  const n = Number(amount);
  if (amount == null || amount === "" || !Number.isFinite(n)) return null;
  const f = upper(from), t = upper(to);
  if (f === t) return n;
  const rf = Number(rates?.[f]), rt = Number(rates?.[t]);
  if (!(rf > 0) || !(rt > 0)) return null;
  return (n / rf) * rt;
}

/** Validates an open.er-api.com style payload. Returns { rates, updatedAt } or null. */
export function parseLiveRates(payload) {
  if (!payload || payload.result !== "success" || typeof payload.rates !== "object" || payload.rates === null) return null;
  const rates = {};
  for (const code of Object.keys(REFERENCE_PER_USD)) {
    const value = Number(payload.rates[code]);
    if (code === "USD") { rates.USD = 1; continue; }
    if (!(value > 0) || !Number.isFinite(value)) return null; // partial payloads are rejected, never half-applied
    rates[code] = value;
  }
  const unix = Number(payload.time_last_update_unix);
  return { rates, updatedAt: Number.isFinite(unix) && unix > 0 ? unix * 1000 : Date.now() };
}

// ---------------------------------------------------------------- store ---

let state = Object.freeze({ target: "USD", rates: REFERENCE_PER_USD, source: "reference", updatedAt: null });
const listeners = new Set();
let started = false;

const emit = () => listeners.forEach((fn) => fn());
const set = (patch) => { state = Object.freeze({ ...state, ...patch }); emit(); };

export const getFxState = () => state;
export function subscribeFx(listener) { listeners.add(listener); return () => listeners.delete(listener); }

/** The user's preferred display currency (set from their profile). Unknown codes fall back to USD. */
export function setDisplayCurrency(code) {
  const next = isSupportedCurrency(code) ? upper(code) : "USD";
  if (next !== state.target) set({ target: next });
}

export function applyLiveRates(parsed) {
  if (parsed) set({ rates: Object.freeze(parsed.rates), source: "live", updatedAt: parsed.updatedAt });
}

function readCache(storage, now) {
  try {
    const raw = JSON.parse(storage?.getItem(CACHE_KEY) || "null");
    const parsed = parseLiveRates(raw?.payload);
    if (!parsed || !Number.isFinite(raw.savedAt)) return null;
    return { parsed, fresh: now - raw.savedAt < CACHE_TTL_MS };
  } catch { return null; }
}

/**
 * Loads cached live rates, and refreshes them if the cache is stale. Never throws: any failure
 * (offline, blocked, bad payload) leaves the previous rates, or the reference table, in place.
 */
export async function refreshRates({ fetchImpl, storage, now = Date.now() } = {}) {
  const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  const cached = readCache(store, now);
  if (cached) applyLiveRates(cached.parsed);
  if (cached?.fresh) return true;
  const doFetch = fetchImpl ?? (typeof fetch === "function" ? fetch : null);
  if (!doFetch) return Boolean(cached);
  try {
    const res = await doFetch(ENDPOINT, { headers: { Accept: "application/json" } });
    if (!res.ok) return Boolean(cached);
    const payload = await res.json();
    const parsed = parseLiveRates(payload);
    if (!parsed) return Boolean(cached);
    applyLiveRates(parsed);
    try { store?.setItem(CACHE_KEY, JSON.stringify({ savedAt: now, payload })); } catch { /* storage may be unavailable */ }
    return true;
  } catch { return Boolean(cached); }
}

const liveRatesEnabled = () => {
  const env = import.meta.env ?? {};
  return env.MODE !== "test" && env.VITE_FX_LIVE !== "false";
};

/** Starts the one-off rate refresh. Safe to call from many components. */
export function ensureFxStarted() {
  if (started) return;
  started = true;
  if (liveRatesEnabled()) refreshRates();
}

// ----------------------------------------------------------- formatting ---

export function rateLabel(s = state) {
  if (s.source === "live" && s.updatedAt) {
    const d = new Date(s.updatedAt);
    return `live rate · updated ${d.getDate()} ${d.toLocaleString("en", { month: "short" })} ${d.getFullYear()}`;
  }
  return "reference rate (not live)";
}

/** "USD 1,200" style, converted into the display currency. Falls back to the source currency. */
export function formatDisplay(amount, from = "USD", s = state) {
  const converted = convertAmount(amount, from, s.target, s.rates);
  return converted == null ? formatMoney(amount, from) : formatMoney(converted, s.target);
}

/** "$1,200" style with no decimals (analytics tables). */
export function formatDisplayWhole(amount, from = "USD", s = state) {
  const converted = convertAmount(amount ?? 0, from, s.target, s.rates);
  const [value, currency] = converted == null ? [Number(amount) || 0, upper(from)] : [converted, s.target];
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value || 0);
  } catch { return `${currency} ${Math.round(value || 0).toLocaleString("en-US")}`; }
}

/** "$1.2k" / "₹1.2M" style for chart axes. */
export function formatDisplayCompact(amount, from = "USD", s = state) {
  const converted = convertAmount(amount ?? 0, from, s.target, s.rates);
  const [value, currency] = converted == null ? [Number(amount) || 0, upper(from)] : [converted, s.target];
  if (currency === "USD") {
    const a = Number(value) || 0;
    if (Math.abs(a) >= 1000000) return `$${(a / 1000000).toFixed(1)}M`;
    if (Math.abs(a) >= 1000) return `$${(a / 1000).toFixed(1)}k`;
    return `$${a.toFixed(0)}`;
  }
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
  } catch { return `${currency} ${Math.round(value || 0)}`; }
}
