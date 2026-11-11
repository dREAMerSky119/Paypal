import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Flag, Leaf, Map as MapIcon, Percent, Search, Table2, X } from "lucide-react";
import { ApiState, Button, PageHeader, Status } from "./ui.jsx";
import { useApi } from "../lib/useApi.js";
import { api } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import PriceDisplay from "./PriceDisplay.jsx";
import { formatMoney, formatPeriod } from "../lib/format.js";
import { destinations } from "../data/destinations.js";
import { featureInfo } from "../data/featureInfo.js";
import {
  BAND_LABELS, FILTER_KEYS, SORT_LABELS, TIER_LABELS, TYPE_LABELS, UNIT_LABELS,
  apiQuery, filtersFromParams, hasActiveFilters, paramsFromFilters,
} from "../lib/inventory.js";
import "../inventory.css";

const InventoryMap = lazy(() => import("./InventoryMap.jsx"));
const RateChart = lazy(() => import("./RateChart.jsx"));

const destName = (slug) => destinations.find((d) => d.slug === slug)?.cardTitle ?? slug;
const PAGE_SIZE = 25;
const INVENTORY_CATEGORIES = [
  { value: "", label: "All", key: "all" },
  { value: "stay", label: TYPE_LABELS.stay, key: "stay" },
  { value: "guide", label: TYPE_LABELS.guide, key: "guide" },
  { value: "transport", label: TYPE_LABELS.transport, key: "transport" },
  { value: "experience", label: TYPE_LABELS.experience, key: "experience" },
];

function Select({ label, value, onChange, options, anyLabel }) {
  return <label className="inv-field"><span>{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{anyLabel}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select></label>;
}

function FilterBar({ filters, qInput, setQInput, update }) {
  return <form className="inv-filters" role="search" aria-label="Filter inventory" onSubmit={(e) => e.preventDefault()}>
    <label className="inv-field inv-search"><span>Search</span><div><Search size={14} aria-hidden="true" />
      <input type="search" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="Name, supplier or place" maxLength={100} /></div></label>
    <Select label="Destination" value={filters.destination} onChange={(v) => update({ destination: v })} anyLabel="All destinations" options={destinations.map((d) => [d.slug, d.cardTitle])} />
    <Select label="Tier" value={filters.tier} onChange={(v) => update({ tier: v })} anyLabel="All tiers" options={Object.entries(TIER_LABELS)} />
    <Select label="Net price (USD)" value={filters.band} onChange={(v) => update({ band: v })} anyLabel="Any price" options={Object.entries(BAND_LABELS)} />
    <Select label="Sort" value={filters.sort === "name" ? "" : filters.sort} onChange={(v) => update({ sort: v || "name" })} anyLabel="Name" options={Object.entries(SORT_LABELS).filter(([k]) => k !== "name")} />
    {hasActiveFilters(filters) && <button type="button" className="inv-clear" onClick={() => update({ destination: "", type: "", tier: "", band: "", q: "", sort: "name" }, { replace: false })}><X size={13} /> Clear filters</button>}
  </form>;
}

function EmptyState({ onClear }) {
  return <div className="inv-empty"><strong>Nothing matches these filters.</strong><p>Try a broader search or remove a filter.</p><Button variant="outline" onClick={onClear}>Clear filters</Button></div>;
}

function Slot({ icon: Icon, title, children }) {
  return <div className="inv-slot"><span className="inv-slot-icon"><Icon size={14} aria-hidden="true" /></span><div><strong>{title}</strong><p>{children}</p></div></div>;
}

function ItemDrawer({ id, onClose, displayCurrency }) {
  const item = useApi(`/inventory/${id}`);
  const rates = useApi(`/inventory/${id}/rates`);
  const closeRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => { if (opener instanceof HTMLElement && document.contains(opener)) opener.focus(); };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab") return;
    const f = [...panelRef.current.querySelectorAll("button, [href], summary, select, input")].filter((n) => !n.disabled);
    if (!f.length) return;
    const first = f[0], last = f.at(-1);
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const d = item.data;
  return <div className="inv-overlay" onMouseDown={onClose}>
    <aside className="inv-drawer" role="dialog" aria-modal="true" aria-labelledby="inv-drawer-title" ref={panelRef} onKeyDown={onKeyDown} onMouseDown={(e) => e.stopPropagation()}>
      <header>
        <div><p className="eyebrow">{d ? `${TYPE_LABELS[d.type]} · ${TIER_LABELS[d.tier]}` : "INVENTORY ITEM"}</p><h2 id="inv-drawer-title">{d ? d.name : "Loading…"}</h2>{d && <p className="inv-sub">{d.supplier_name} · {destName(d.destination)}</p>}</div>
        <button type="button" className="icon-button" ref={closeRef} onClick={onClose} aria-label="Close details"><X size={18} /></button>
      </header>
      <ApiState api={item} label="this item" />
      {d && <>
        <dl className="inv-facts">
          <div><dt>Preferred display price</dt><dd><PriceDisplay amount={d.base_net_price} currency={d.currency} usdReference={d.base_net_price_usd} displayCurrency={displayCurrency}/></dd></div>
          <div><dt>USD reference estimate</dt><dd>{formatMoney(d.base_net_price_usd, "USD")}</dd></div>
          <div><dt>Priced</dt><dd>{UNIT_LABELS[d.unit] ?? d.unit ?? "—"}</dd></div>
          <div><dt>Capacity</dt><dd>{d.capacity}</dd></div>
          <div><dt>Sample markup</dt><dd>{d.markup_pct != null ? `${d.markup_pct}%` : "—"}</dd></div>
          <div><dt>Place</dt><dd>{d.responsible?.locality ?? `${d.lat?.toFixed(2)}, ${d.lon?.toFixed(2)}`}</dd></div>
        </dl>
        <section aria-labelledby="inv-rates-title">
          <h3 id="inv-rates-title">Rate calendar <small>preferred display: {displayCurrency}; supplier quote: {d.currency}</small></h3>
          {rates.status === "error" && <ApiState api={rates} label="rates" />}
          {rates.isLoading && <p className="inv-muted">Loading rates…</p>}
          {rates.data?.rates.length === 0 && <p className="inv-muted">No rates recorded for this item.</p>}
          {rates.data?.rates.length > 0 && <>
            <Suspense fallback={<p className="inv-muted">Loading chart…</p>}><RateChart rates={rates.data.rates} currency={d.currency} displayCurrency={displayCurrency} /></Suspense>
            <details className="inv-rate-table"><summary>View as table</summary>
              <div className="inv-scroll"><table><caption className="sr-only">Monthly net rates</caption><thead><tr><th scope="col">Month</th><th scope="col">Preferred / source rate</th><th scope="col">USD reference</th></tr></thead>
                <tbody>{rates.data.rates.map((r) => <tr key={r.period}><th scope="row">{formatPeriod(r.period)}</th><td><PriceDisplay amount={r.net_price} currency={d.currency} usdReference={r.net_price_usd} displayCurrency={displayCurrency}/></td><td>{formatMoney(r.net_price_usd, "USD")}</td></tr>)}</tbody></table></div>
            </details>
          </>}
        </section>
        <section className="inv-slots" aria-label="Coming from other features">
          <Slot icon={Percent} title="Margin">Calculated by Profitability analysis once it ships.</Slot>
          <Slot icon={Leaf} title="Responsible badge">Shown only for verified claims, from Responsible travel.</Slot>
          <Slot icon={Flag} title="Anomaly flag">Raised by Anomaly watch. Not yet scanned, so no flag does not mean clean.</Slot>
        </section>
      </>}
    </aside>
  </div>;
}

function ResultsTable({ data, onOpen, busy, displayCurrency }) {
  return <div className="inv-scroll" aria-busy={busy}>
    <table className="inv-table">
      <caption className="sr-only">Inventory results, page {data.page} of {data.pages}</caption>
      <thead><tr><th scope="col">Item</th><th scope="col">Destination</th><th scope="col">Type</th><th scope="col">Tier</th><th scope="col" className="num">Preferred display price</th><th scope="col" className="num">USD reference</th></tr></thead>
      <tbody>{data.items.map((i) => <tr key={i.id}>
        <th scope="row"><button type="button" className="inv-name" onClick={() => onOpen(i.id)}>{i.name}</button><small>{i.supplier_name}</small></th>
        <td>{destName(i.destination)}</td><td>{TYPE_LABELS[i.type]}</td>
        <td><Status tone={i.tier === "luxury" ? "gold" : i.tier === "mid" ? "blue" : "sage"}>{TIER_LABELS[i.tier]}</Status></td>
        <td className="num"><PriceDisplay amount={i.base_net_price} currency={i.currency} usdReference={i.base_net_price_usd} displayCurrency={displayCurrency}/><small>{UNIT_LABELS[i.unit] ?? ""}</small></td>
        <td className="num">{formatMoney(i.base_net_price_usd, "USD")}</td>
      </tr>)}</tbody>
    </table>
  </div>;
}

function Pager({ data, goTo }) {
  if (data.pages <= 1) return null;
  const from = (data.page - 1) * data.page_size + 1, to = Math.min(data.count, data.page * data.page_size);
  return <nav className="inv-pager" aria-label="Pagination"><span>{from}–{to} of {data.count}</span>
    <div><Button variant="outline" disabled={data.page <= 1} onClick={() => goTo(data.page - 1)}>Previous</Button>
      <span aria-current="page">Page {data.page} of {data.pages}</span>
      <Button variant="outline" disabled={data.page >= data.pages} onClick={() => goTo(data.page + 1)}>Next</Button></div></nav>;
}

function MapView({ filters, onOpen, onClear }) {
  const pts = useApi(`/inventory/points?${apiQuery(filters, { paged: false })}`);
  return <>
    <ApiState api={pts} label="the map" />
    {pts.data?.count === 0 && <EmptyState onClear={onClear} />}
    {pts.data?.count > 0 && <figure className="inv-map-wrap">
      <Suspense fallback={<div className="api-state" role="status"><span className="api-state-pulse" /><div><strong>Loading map</strong></div></div>}><InventoryMap points={pts.data.points} onSelect={onOpen} /></Suspense>
      <figcaption>{pts.data.count} locations. Marker colour shows type: {Object.entries(TYPE_LABELS).map(([k, l]) => <span key={k} className={`inv-legend inv-legend-${k}`}>{l}</span>)} The table view lists the same results.</figcaption>
    </figure>}
  </>;
}

export default function InventoryPage() {
  const { preferredCurrency } = useAuth();
  const info = featureInfo["/app/inventory"];
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const [qInput, setQInput] = useState(filters.q);

  const update = useCallback((patch, { replace = true } = {}) => {
    setParams((prev) => {
      const current = filtersFromParams(prev);
      // Only a change to a filter or the sort sends you back to page 1; opening
      // the drawer, switching view or paging must keep your place.
      const resets = FILTER_KEYS.some((k) => k in patch);
      return paramsFromFilters({ ...current, page: resets ? 1 : current.page, ...patch });
    }, { replace });
  }, [setParams]);

  // Debounce typing; push to the URL only once the user pauses.
  useEffect(() => {
    if (qInput.trim() === filters.q) return undefined;
    const t = setTimeout(() => update({ q: qInput.trim() }), 300);
    return () => clearTimeout(t);
  }, [qInput, filters.q, update]);
  useEffect(() => setQInput(filters.q), [filters.q]);

  const list = useApi(`/inventory?${apiQuery(filters, { pageSize: PAGE_SIZE })}`, { enabled: filters.view === "table" });
  const [categoryCounts, setCategoryCounts] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    
    Promise.allSettled(INVENTORY_CATEGORIES.map(async ({ value, key }) => {
      const query = apiQuery({ ...filters, type: value }, { pageSize: 1 });
      const result = await api(`/inventory?${query}`, { signal: controller.signal });
      return [key, result.count];
    })).then((results) => {
      if (controller.signal.aborted) return;
      setCategoryCounts(Object.fromEntries(results.filter((result) => result.status === "fulfilled").map((result) => result.value)));
    });
    return () => controller.abort();
  }, [filters.destination, filters.tier, filters.band, filters.q]);

  const openItem = (id) => update({ item: id }, { replace: false });
  const closeItem = () => update({ item: "" }, { replace: false });
  const setView = (view) => update({ view }, { replace: false });
  const empty = list.data && list.data.count === 0;
  const clearAll = () => update({ destination: "", type: "", tier: "", band: "", q: "" }, { replace: false });

  return <>
    <PageHeader eyebrow={info.eyebrow} title={<>{info.title}<span className="title-period">.</span></>} description={info.description} action={<Button to={info.action.to} variant="outline">{info.action.label}</Button>} />
    <p className="inv-banner" role="note"><Status tone="gold">Sample data</Status> Supplier names and rates are generated placeholders so the product can be explored. Some rates contain deliberate entry errors for testing Anomaly watch.</p>
    <FilterBar filters={filters} qInput={qInput} setQInput={setQInput} update={update} />
    <div className="inv-category-tabs" role="tablist" aria-label="Inventory categories">
      {INVENTORY_CATEGORIES.map((category) => {
        const count = categoryCounts[category.key] ?? (category.key === "all" || filters.type === category.value ? list.data?.count : null);
        return <button key={category.key} type="button" role="tab" aria-selected={filters.type === category.value} className={filters.type === category.value ? "is-active" : ""} onClick={() => update({ type: category.value }, { replace: false })}><span>{category.label}</span><small>{count ?? "—"}</small></button>;
      })}
    </div>
    <div className="inv-toolbar">
      <p aria-live="polite" className="inv-count">{filters.view === "table" && list.data ? `${list.data.count} ${list.data.count === 1 ? "result" : "results"}` : " "}</p>
      <div className="inv-toggle" role="group" aria-label="View">
        <button type="button" aria-pressed={filters.view === "table"} onClick={() => setView("table")}><Table2 size={14} /> Table</button>
        <button type="button" aria-pressed={filters.view === "map"} onClick={() => setView("map")}><MapIcon size={14} /> Map</button>
      </div>
    </div>

    {filters.view === "table" && <>
      {(list.status === "error" || (list.isLoading && !list.data)) && <ApiState api={list} label="inventory" />}
      {list.data && !empty && <><ResultsTable data={list.data} onOpen={openItem} busy={list.isLoading} displayCurrency={preferredCurrency} /><Pager data={list.data} goTo={(page) => update({ page }, { replace: false })} /></>}
      {empty && <EmptyState onClear={clearAll} />}
    </>}
    {filters.view === "map" && <MapView filters={filters} onOpen={openItem} onClear={clearAll} />}

    <footer className="inv-attribution">Seasonal rate shapes are calibrated from the Hotel Booking Demand dataset (Antonio, Almeida &amp; Nunes, 2019). Place names are placeholders anchored to real localities. Map tiles © OpenStreetMap contributors. Exchange rates are reference assumptions, not live.</footer>
    {filters.item && <ItemDrawer id={filters.item} onClose={closeItem} displayCurrency={preferredCurrency} />}
  </>;
}
