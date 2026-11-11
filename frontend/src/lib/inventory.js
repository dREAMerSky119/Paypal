// Pure helpers for the inventory page: URL <-> filters <-> API query.

export const TYPE_LABELS = { stay: "Stays", guide: "Guides", experience: "Experiences", transport: "Transport" };
export const TIER_LABELS = { budget: "Budget", mid: "Mid-range", luxury: "Luxury" };
export const BAND_LABELS = { under_30: "Under $30", "30_75": "$30 to $75", "75_150": "$75 to $150", over_150: "Over $150" };
export const SORT_LABELS = { name: "Name", price_asc: "Price, low to high", price_desc: "Price, high to low" };
export const UNIT_LABELS = {
  per_room_night: "per room night", per_person: "per person", per_guide_day: "per guide day",
  per_guide_half_day: "per guide half-day", per_vehicle: "per vehicle", per_vehicle_day: "per vehicle day",
};
export const TYPE_COLORS = { stay: "#172b40", guide: "#b98939", experience: "#6f8f7a", transport: "#526579" };

export const FILTER_KEYS = ["destination", "type", "tier", "band", "q", "sort"];
const DEFAULTS = { sort: "name", page: 1, view: "table" };

/** URLSearchParams -> normalised filter object. Unknown/garbage values fall back to defaults. */
export function filtersFromParams(params) {
  const get = (k) => (params.get(k) || "").trim();
  const page = Number.parseInt(get("page"), 10);
  return {
    destination: get("destination"),
    type: Object.hasOwn(TYPE_LABELS, get("type")) ? get("type") : "",
    tier: Object.hasOwn(TIER_LABELS, get("tier")) ? get("tier") : "",
    band: Object.hasOwn(BAND_LABELS, get("band")) ? get("band") : "",
    q: get("q").slice(0, 100),
    sort: Object.hasOwn(SORT_LABELS, get("sort")) ? get("sort") : DEFAULTS.sort,
    page: Number.isInteger(page) && page > 0 ? page : DEFAULTS.page,
    view: get("view") === "map" ? "map" : DEFAULTS.view,
    item: get("item"),
  };
}

/** Filters -> URLSearchParams, leaving out defaults so URLs stay short and shareable. */
export function paramsFromFilters(f) {
  const p = new URLSearchParams();
  for (const k of ["destination", "type", "tier", "band", "q"]) if (f[k]) p.set(k, f[k]);
  if (f.sort && f.sort !== DEFAULTS.sort) p.set("sort", f.sort);
  if (f.page && f.page > 1) p.set("page", String(f.page));
  if (f.view === "map") p.set("view", "map");
  if (f.item) p.set("item", f.item);
  return p;
}

/** Filters -> the backend's query string (backend calls the band `price_band`). */
export function apiQuery(f, { paged = true, pageSize = 25 } = {}) {
  const p = new URLSearchParams();
  if (f.destination) p.set("destination", f.destination);
  if (f.type) p.set("type", f.type);
  if (f.tier) p.set("tier", f.tier);
  if (f.band) p.set("price_band", f.band);
  if (f.q) p.set("q", f.q);
  if (paged) {
    p.set("sort", f.sort || DEFAULTS.sort);
    p.set("page", String(f.page || 1));
    p.set("page_size", String(pageSize));
  }
  return p.toString();
}

export const hasActiveFilters = (f) => FILTER_KEYS.some((k) => k !== "sort" && f[k]);
