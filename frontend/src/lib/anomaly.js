// Pure helpers for Anomaly watch (feature #9). No React, no fetch: the page and
// the inventory/package flags share these so labels never drift apart.

export const SEVERITIES = ["high", "medium", "low"];

export const SEVERITY_LABELS = { high: "High", medium: "Medium", low: "Low" };
export const SEVERITY_TONES = { high: "gold", medium: "blue", low: "sage" };

export const KIND_LABELS = { rate: "Rate", text: "Text", supplier: "Supplier" };

/** Plain-language names for the machine codes the detector returns. */
export const CODE_LABELS = {
  zero_price: "Zero price",
  negative_price: "Negative price",
  not_a_number: "Not a number",
  below_penny: "Below one cent",
  ten_x: "10× peers",
  hundred_x: "100× peers",
  digit_too_many: "Extra digit",
  tenth_x: "A tenth of peers",
  digit_dropped: "Missing digit",
  currency_slip: "Currency slip",
  missing_field: "Missing field",
  duplicate_supplier: "Duplicate supplier",
  near_duplicate_supplier: "Near-duplicate supplier",
  text_typo: "Possible typo",
  text_split_word: "Split word",
  peer_z_outlier: "Off its peers",
  history_z_outlier: "Off its own history",
  ml_outlier: "Model outlier",
};

export const STATUS_LABELS = { open: "Open", resolved: "Resolved", all: "All" };

export const FILTER_DEFAULTS = { severity: "", kind: "", status: "open", q: "", page: 1 };

/** URLSearchParams -> filter object. Unknown values fall back to the defaults. */
export function filtersFromParams(params) {
  const get = (key) => (params.get(key) || "").trim();
  const page = Number.parseInt(get("page"), 10);
  const severity = get("severity");
  const kind = get("kind");
  const status = get("status");
  return {
    severity: SEVERITIES.includes(severity) ? severity : "",
    kind: Object.hasOwn(KIND_LABELS, kind) ? kind : "",
    status: Object.hasOwn(STATUS_LABELS, status) ? status : "open",
    q: get("q").slice(0, 100),
    page: Number.isInteger(page) && page > 0 ? page : 1,
    item: get("item"),
  };
}

/** Filter object -> URLSearchParams, leaving defaults out so links stay short. */
export function paramsFromFilters(filters) {
  const params = new URLSearchParams();
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.status && filters.status !== "open") params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.item) params.set("item", filters.item);
  return params;
}

/** Filter object -> the backend query string. */
export function apiQuery(filters, { pageSize = 25 } = {}) {
  const params = new URLSearchParams();
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.status) params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  params.set("page", String(filters.page || 1));
  params.set("page_size", String(pageSize));
  return params.toString();
}

/** Anomaly keys contain colons, which are legal in a path but must be encoded. */
export function anomalyPath(id, suffix = "resolve") {
  return `/anomalies/${encodeURIComponent(id)}/${suffix}`;
}

/** "1 item" / "3 items" without a ternary in the markup. */
export function plural(count, one, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

/** A one-line summary of the badges the feed and the inventory rows share. */
export function flagLabel(flag) {
  if (!flag || !flag.count) return "";
  const codes = (flag.codes || []).slice(0, 2).map((code) => CODE_LABELS[code] || code);
  return codes.length ? codes.join(" · ") : plural(flag.count, "flag");
}

/** Severity of the worst flag in a list, for sorting or a single badge. */
export function worstSeverity(severities = []) {
  return SEVERITIES.find((severity) => severities.includes(severity)) || null;
}
