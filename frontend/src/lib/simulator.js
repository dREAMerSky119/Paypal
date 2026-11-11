// Pure helpers for the market simulator page: scenario state, URL sharing, request
// building and number formatting. No React and no network, so everything is unit-tested.

export const SLIDER_ORDER = ["weather", "fuel", "currency", "visa", "disruption"];
export const COEFFICIENT_KEYS = ["demand_per_unit", "rate_per_unit", "cost_per_unit"];
export const SAVED_KEY = "wayfare.simulator.saved";
export const MAX_SAVED = 12;

/** The scenario the page opens with. It matches the "Heavy monsoon" preset. */
export const DEFAULT_SCENARIO = Object.freeze({
  destination: "kerala-india",
  start: "2027-06",
  months: 3,
  adjustments: { weather: 67 },
  events: [],
  overrides: {},
  preset: "heavy-monsoon",
});

const MINUS = "\u2212";

/** 5 -> "+5.0%", -20.11 -> "\u221220.1%", 0 -> "0.0%". */
export function formatPct(value, { digits = 1, sign = true } = {}) {
  if (value == null || Number.isNaN(Number(value))) return "\u2014";
  const n = Number(value);
  const text = Math.abs(n).toFixed(digits);
  if (Number(text) === 0) return `${(0).toFixed(digits)}%`;
  const prefix = n < 0 ? MINUS : sign ? "+" : "";
  return `${prefix}${text}%`;
}

/** 0.3279 -> "33%" */
export const formatShare = (fraction) => (fraction == null ? "\u2014" : `${Math.round(fraction * 100)}%`);

/** 0.8316 -> "\u00d70.83" */
export const formatMultiplier = (value) => (value == null ? "\u2014" : `\u00d7${Number(value).toFixed(2)}`);

/** 12 -> "+12", -5 -> "\u22125", 0 -> "0" */
export function formatSigned(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "0";
  return `${n < 0 ? MINUS : "+"}${Math.abs(n)}`;
}

/** "positive" | "negative" | "flat" for colouring a change. Tiny moves count as flat. */
export function tone(value, threshold = 0.05) {
  if (value == null || Math.abs(value) < threshold) return "flat";
  return value > 0 ? "positive" : "negative";
}

// ---- months ---------------------------------------------------------------

const monthIndex = (period) => {
  const [y, m] = String(period).split("-").map(Number);
  return y * 12 + (m - 1);
};

export function shiftMonth(period, offset) {
  const index = monthIndex(period) + offset;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

export const windowPeriods = (start, months) => Array.from({ length: months }, (_, i) => shiftMonth(start, i));

/** How many months fit between `start` and the end of the forecast. */
export function maxMonthsFrom(start, available = []) {
  const at = available.indexOf(start);
  return at < 0 ? 0 : available.length - at;
}

// ---- events ---------------------------------------------------------------

export const eventApplies = (event, destination) =>
  event.destination === destination.slug || (event.destination == null && event.country === destination.country);

/** True when any day of the event falls inside the scenario window. */
export function eventTouchesWindow(event, start, months) {
  const first = `${start}-01`;
  const endPeriod = shiftMonth(start, months);
  const last = `${endPeriod}-01`; // exclusive
  return event.start < last && (event.end || event.start) >= first;
}

export function applicableEvents(assumptions, slug, start, months) {
  const destination = assumptions?.destinations?.find((d) => d.slug === slug);
  if (!destination) return [];
  return (assumptions.events ?? []).filter((e) => eventApplies(e, destination) && eventTouchesWindow(e, start, months));
}

// ---- scenario <-> request / URL -------------------------------------------

/** Request body for POST /api/simulator/run. Drops events that no longer apply so the server never 400s on them. */
export function buildRequest(scenario, assumptions) {
  const events = assumptions
    ? applicableEvents(assumptions, scenario.destination, scenario.start, scenario.months)
    : [];
  const allowed = new Set(events.map((e) => e.id));
  const adjustments = {};
  for (const [key, value] of Object.entries(scenario.adjustments ?? {})) {
    if (Number(value) !== 0) adjustments[key] = Number(value);
  }
  const request = {
    destination: scenario.destination,
    start: scenario.start,
    months: scenario.months,
    adjustments,
    events: (scenario.events ?? []).filter((e) => allowed.has(e.id)).map((e) => ({ id: e.id, strength: Number(e.strength) })),
  };
  const overrides = cleanOverrides(scenario.overrides);
  if (overrides) request.overrides = overrides;
  return request;
}

/** Remove empty override groups. Returns null when nothing is overridden. */
export function cleanOverrides(overrides) {
  const out = {};
  for (const [name, changes] of Object.entries(overrides?.types ?? {})) {
    const kept = Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== "" && v != null && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));
    if (Object.keys(kept).length) (out.types ??= {})[name] = kept;
  }
  const globals = Object.fromEntries(Object.entries(overrides?.globals ?? {}).filter(([, v]) => v !== "" && v != null && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));
  if (Object.keys(globals).length) out.globals = globals;
  return Object.keys(out).length ? out : null;
}

export function presetToScenario(preset, assumptions) {
  const events = preset.event_types?.length
    ? applicableEvents(assumptions, preset.destination, preset.start, preset.months)
        .filter((e) => preset.event_types.includes(e.type))
        .map((e) => ({ id: e.id, strength: 100 }))
    : [];
  return {
    destination: preset.destination,
    start: preset.start,
    months: preset.months,
    adjustments: { ...preset.adjustments },
    events,
    overrides: {},
    preset: preset.id,
  };
}

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

/** Compact string for the `?scenario=` link. */
export function encodeScenario(scenario) {
  const { preset, ...rest } = scenario;
  return JSON.stringify({ ...rest, ...(preset ? { preset } : {}) });
}

/** Parse a `?scenario=` value. Returns null for anything malformed rather than throwing. */
export function decodeScenario(text) {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    if (!isObject(raw) || typeof raw.destination !== "string" || !/^\d{4}-\d{2}$/.test(raw.start ?? "")) return null;
    const months = Number(raw.months);
    if (!Number.isInteger(months) || months < 1 || months > 12) return null;
    const adjustments = {};
    if (isObject(raw.adjustments)) {
      for (const [k, v] of Object.entries(raw.adjustments)) if (Number.isFinite(Number(v))) adjustments[k] = Number(v);
    }
    const events = Array.isArray(raw.events)
      ? raw.events.filter((e) => isObject(e) && typeof e.id === "string" && Number.isFinite(Number(e.strength))).map((e) => ({ id: e.id, strength: Number(e.strength) }))
      : [];
    return {
      destination: raw.destination, start: raw.start, months, adjustments, events,
      overrides: isObject(raw.overrides) ? raw.overrides : {},
      preset: typeof raw.preset === "string" ? raw.preset : null,
    };
  } catch {
    return null;
  }
}

/** Keep a scenario valid for the current forecast window (start in range, months fit). */
export function fitScenario(scenario, assumptions) {
  const available = assumptions?.available_months ?? [];
  if (!available.length) return scenario;
  const start = available.includes(scenario.start) ? scenario.start : available[0];
  const months = Math.min(scenario.months, maxMonthsFrom(start, available));
  const slug = assumptions.destinations?.some((d) => d.slug === scenario.destination) ? scenario.destination : assumptions.destinations?.[0]?.slug ?? scenario.destination;
  return { ...scenario, start, months: Math.max(1, months), destination: slug };
}

// ---- saved scenarios (browser only, per person) ----------------------------

export function loadSaved(storage = globalThis.localStorage) {
  try {
    const list = JSON.parse(storage?.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((s) => s && typeof s.name === "string" && decodeScenario(JSON.stringify(s.scenario))) : [];
  } catch {
    return [];
  }
}

export function persistSaved(list, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SAVED_KEY, JSON.stringify(list.slice(0, MAX_SAVED)));
    return true;
  } catch {
    return false; // private mode or quota: saving is a convenience, never an error
  }
}

export function addSaved(list, name, scenario) {
  const clean = String(name ?? "").trim().slice(0, 60);
  if (!clean) return list;
  const rest = list.filter((s) => s.name.toLowerCase() !== clean.toLowerCase());
  return [{ name: clean, scenario }, ...rest].slice(0, MAX_SAVED);
}
