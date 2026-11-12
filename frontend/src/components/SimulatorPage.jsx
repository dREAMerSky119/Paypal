import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Link2, Minus, RotateCcw, Save, Trash2 } from "lucide-react";
import { ApiState, Button, PageHeader, Status } from "./ui.jsx";
import { PackageImpactPanel, ShortLink } from "./SimulatorExtras.jsx";
import { api } from "../lib/api.js";
import { useApi } from "../lib/useApi.js";
import { useSimulation } from "../lib/useSimulation.js";
import { formatPeriod } from "../lib/format.js";
import { useDisplayCurrency } from "../lib/useDisplayCurrency.js";
import { featureInfo } from "../data/featureInfo.js";
import {
  COEFFICIENT_KEYS, DEFAULT_SCENARIO, SLIDER_ORDER,
  addSaved, applicableEvents, buildRequest, cleanOverrides, decodeScenario, encodeScenario, fitScenario,
  formatMultiplier, formatPct, formatShare, formatSigned, loadSaved, maxMonthsFrom,
  persistSaved, presetToScenario, tone,
} from "../lib/simulator.js";
import "../simulator.css";

const COEFFICIENT_LABELS = { demand_per_unit: "Demand", rate_per_unit: "Rates", cost_per_unit: "Supplier cost" };
const TONE_ICON = { positive: ArrowUpRight, negative: ArrowDownRight, flat: Minus };

const eventDates = (e) => (e.end && e.end !== e.start ? `${e.start} to ${e.end}` : e.start);
const isUsable = (a) => Array.isArray(a?.destinations) && a?.effect_types && Array.isArray(a?.available_months);

function initialScenario(params) {
  const shared = decodeScenario(params.get("scenario"));
  if (shared) return shared;
  const destination = params.get("destination");
  return destination ? { ...DEFAULT_SCENARIO, destination, preset: null, adjustments: {} } : { ...DEFAULT_SCENARIO };
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const change = row.baseline ? ((row.scenario / row.baseline) - 1) * 100 : 0;
  return <div className="sim-tooltip">
    <strong>{formatPeriod(label)}</strong>
    <span>Baseline <b>{row.baseline.toFixed(1)}</b></span>
    <span>Scenario <b>{row.scenario.toFixed(1)}</b> ({formatPct(change)})</span>
    <span>Likely range {row.scenario_lower.toFixed(1)} to {row.scenario_upper.toFixed(1)}</span>
  </div>;
}

function DemandChart({ months }) {
  const data = months.map((m) => ({ ...m, band: [m.scenario_lower, m.scenario_upper] }));
  const summary = `Demand index by month, baseline versus scenario, ${formatPeriod(months[0].period)} to ${formatPeriod(months.at(-1).period)}.`;
  return <div className="sim-chart" role="img" aria-label={summary}>
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid stroke="#ece9e1" vertical={false} />
        <XAxis dataKey="period" tickFormatter={formatPeriod} tick={{ fontSize: 10, fill: "#5f6b72" }} tickLine={false} axisLine={{ stroke: "#dedbd2" }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 10, fill: "#5f6b72" }} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<ChartTooltip />} />
        <Area dataKey="band" stroke="none" fill="#b98939" fillOpacity={0.16} isAnimationActive={false} />
        <Line dataKey="baseline" name="Baseline" stroke="#526579" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        <Line dataKey="scenario" name="Scenario" stroke="#b98939" strokeWidth={2.5} dot={{ r: 3, fill: "#b98939" }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
    <div className="sim-legend" aria-hidden="true">
      <span><i className="sim-key sim-key-base" />Baseline forecast</span>
      <span><i className="sim-key sim-key-scenario" />Scenario</span>
      <span><i className="sim-key sim-key-band" />Likely range</span>
    </div>
  </div>;
}

function Kpi({ label, value, sub, change }) {
  const t = tone(change);
  const Icon = TONE_ICON[t];
  return <article className={`sim-kpi sim-kpi-${t}`}>
    <span className="sim-kpi-label">{label}</span>
    <strong className="sim-kpi-value">{value}</strong>
    <span className="sim-kpi-sub">{change != null && <Icon size={13} aria-hidden="true" />}{sub}</span>
  </article>;
}

function Controls({ scenario, assumptions, update, result, applyPreset, presets }) {
  const { effect_types: types, destinations, available_months: months } = assumptions;
  const maxMonths = Math.max(1, maxMonthsFrom(scenario.start, months));
  const events = applicableEvents(assumptions, scenario.destination, scenario.start, scenario.months);
  const chosen = new Map(scenario.events.map((e) => [e.id, e.strength]));
  const effectOf = (type) => result?.factors?.find((f) => f.type === type && !f.event_id);

  const setAdjustment = (name, value) => update({ adjustments: { ...scenario.adjustments, [name]: Number(value) } });
  const toggleEvent = (id, on) => update({ events: on ? [...scenario.events, { id, strength: 100 }] : scenario.events.filter((e) => e.id !== id) });
  const setStrength = (id, strength) => update({ events: scenario.events.map((e) => (e.id === id ? { ...e, strength: Number(strength) } : e)) });

  return <div className="sim-controls">
    <section className="panel sim-card" aria-labelledby="sim-presets">
      <h2 id="sim-presets" className="sim-h">Start from a preset</h2>
      <div className="sim-chips">
        {presets.map((p) => <button key={p.id} type="button" className="sim-chip" aria-pressed={scenario.preset === p.id} onClick={() => applyPreset(p)} title={p.detail}>{p.label}</button>)}
      </div>
      {presets.length === 0 && <p className="sim-muted">Presets are not available right now. You can still build a scenario below.</p>}
    </section>

    <section className="panel sim-card" aria-labelledby="sim-where">
      <h2 id="sim-where" className="sim-h">Where and when</h2>
      <label className="sim-field"><span>Destination</span>
        <select value={scenario.destination} onChange={(e) => update({ destination: e.target.value, events: [] })}>
          {destinations.map((d) => <option key={d.slug} value={d.slug}>{d.name}, {d.country}</option>)}
        </select></label>
      <div className="sim-row">
        <label className="sim-field"><span>Starts</span>
          <select value={scenario.start} onChange={(e) => update({ start: e.target.value })}>
            {months.map((m) => <option key={m} value={m}>{formatPeriod(m)}</option>)}
          </select></label>
        <label className="sim-field"><span>Months</span>
          <select value={scenario.months} onChange={(e) => update({ months: Number(e.target.value) })}>
            {Array.from({ length: maxMonths }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
      </div>
    </section>

    <section className="panel sim-card" aria-labelledby="sim-conditions">
      <div className="sim-h-row">
        <h2 id="sim-conditions" className="sim-h">Conditions</h2>
        <button type="button" className="sim-link" onClick={() => update({ adjustments: {} })}><RotateCcw size={12} aria-hidden="true" />Reset sliders</button>
      </div>
      {SLIDER_ORDER.filter((name) => types[name]).map((name) => {
        const spec = types[name];
        const value = Number(scenario.adjustments[name] ?? 0);
        const effect = effectOf(name);
        return <div className="sim-slider" key={name}>
          <div className="sim-slider-top"><label htmlFor={`sim-${name}`}>{spec.label}</label><output htmlFor={`sim-${name}`}>{formatSigned(value)}</output></div>
          <input id={`sim-${name}`} type="range" min={spec.min} max={spec.max} step={spec.step ?? 1} value={value}
            aria-valuetext={`${spec.label}: ${formatSigned(value)}`} onChange={(e) => setAdjustment(name, e.target.value)} />
          <p className="sim-slider-note">{spec.unit}. {effect ? `Demand ${formatMultiplier(effect.demand)}, rates ${formatMultiplier(effect.rate)}.` : "No effect at zero."}</p>
        </div>;
      })}
    </section>

    <section className="panel sim-card" aria-labelledby="sim-events">
      <h2 id="sim-events" className="sim-h">Festivals and events in this window</h2>
      {events.length === 0
        ? <p className="sim-muted">No curated events fall in this window for this destination. Try a different start month.</p>
        : <ul className="sim-events">{events.map((e) => {
          const on = chosen.has(e.id);
          return <li key={e.id}>
            <label className="sim-check"><input type="checkbox" checked={on} onChange={(ev) => toggleEvent(e.id, ev.target.checked)} />
              <span><strong>{e.name}</strong><small>{eventDates(e)}. Demand {formatMultiplier(e.demand_multiplier)}, rates {formatMultiplier(e.rate_multiplier)}</small></span></label>
            {on && <label className="sim-strength"><span>Strength</span>
              <input type="number" min="0" max="200" step="10" value={chosen.get(e.id)} onChange={(ev) => setStrength(e.id, ev.target.value)} aria-label={`Strength of ${e.name} in percent`} /><span>%</span></label>}
          </li>;
        })}</ul>}
    </section>
  </div>;
}

function Results({ result }) {
  const fx = useDisplayCurrency();
  const { summary, margin, spillover, factors, months, window: win } = result;
  const margin_text = margin ? `, margin ${formatPct(margin.delta.margin_points)} points` : "";
  return <>
    <p className="sr-only" role="status">{`Scenario updated: demand ${formatPct(summary.demand_change_pct)}, rates ${formatPct(summary.rate_pressure_pct)}${margin_text}.`}</p>
    <div className="sim-kpis">
      <Kpi label="Demand vs baseline" value={formatPct(summary.demand_change_pct)} change={summary.demand_change_pct} sub={`Index ${summary.baseline_total.toFixed(0)} to ${summary.scenario_total.toFixed(0)}`} />
      <Kpi label="Rate pressure" value={formatPct(summary.rate_pressure_pct)} change={summary.rate_pressure_pct} sub="Average market rate move" />
      <Kpi label="Occupancy (proxy)" value={`${formatShare(summary.occupancy_baseline)} to ${formatShare(summary.occupancy_scenario)}`} change={(summary.occupancy_scenario - summary.occupancy_baseline) * 100} sub="Estimated from the demand index" />
      {margin
        ? <Kpi label="Margin impact" value={`${formatPct(margin.delta.margin_points)} pts`.replace("%", "")} change={margin.delta.margin_points}
          sub={`${fx.format(margin.delta.profit, "USD")} profit, ${margin.baseline.margin_pct.toFixed(1)}% to ${margin.scenario.margin_pct.toFixed(1)}%`} />
        : <Kpi label="Margin impact" value="Not available" sub="No simulated bookings for this destination" />}
    </div>

    {result.warnings?.length > 0 && <ul className="sim-warnings" role="status">{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}

    <section className="panel sim-card" aria-labelledby="sim-chart-h">
      <div className="sim-h-row"><h2 id="sim-chart-h" className="sim-h">Baseline versus scenario</h2><span className="sim-muted">{formatPeriod(win.start)} to {formatPeriod(win.end)}</span></div>
      <DemandChart months={months} />
      <details className="sim-details">
        <summary>View as a table</summary>
        <div className="sim-table-wrap"><table className="sim-table">
          <caption className="sr-only">Monthly demand, rates, occupancy and profit for the scenario</caption>
          <thead><tr><th scope="col">Month</th><th scope="col">Baseline</th><th scope="col">Scenario</th><th scope="col">Rates</th><th scope="col">Occupancy</th><th scope="col">Profit change</th></tr></thead>
          <tbody>{months.map((m) => <tr key={m.period}>
            <th scope="row">{formatPeriod(m.period)}</th><td>{m.baseline.toFixed(1)}</td><td>{m.scenario.toFixed(1)}</td>
            <td>{formatPct((m.rate_multiplier - 1) * 100)}</td><td>{formatShare(m.occupancy_baseline)} to {formatShare(m.occupancy_scenario)}</td>
            <td>{m.profit_scenario != null ? fx.format(m.profit_scenario - m.profit_baseline, "USD") : "\u2014"}</td>
          </tr>)}</tbody>
        </table></div>
      </details>
    </section>

    <div className="sim-two">
      <section className="panel sim-card" aria-labelledby="sim-spill">
        <h2 id="sim-spill" className="sim-h">Where displaced demand could go</h2>
        {spillover.length === 0
          ? <p className="sim-muted">Nothing is displaced in this scenario, so no similar destination gains or loses. Try a disruption or a stronger shock.</p>
          : <ul className="sim-spill">{spillover.map((s) => <li key={s.slug}><div><strong>{s.name}</strong><small>{s.reason}</small></div><span className="sim-spill-value">{formatPct(s.uplift_pct)}</span></li>)}</ul>}
        <p className="sim-foot">Share of lost demand that moves elsewhere is an assumption. Related destinations come from the related-spots data.</p>
      </section>

      <section className="panel sim-card" aria-labelledby="sim-factors">
        <h2 id="sim-factors" className="sim-h">What is driving the result</h2>
        {factors.length === 0
          ? <p className="sim-muted">No conditions are active. The scenario equals the baseline forecast.</p>
          : <ul className="sim-factors">{factors.map((f, i) => <li key={`${f.type}-${f.label}-${i}`}>
            <strong>{f.label}</strong>
            <span>Demand {formatMultiplier(f.demand)}, rates {formatMultiplier(f.rate)}{f.cost !== 1 ? `, cost ${formatMultiplier(f.cost)}` : ""}</span>
            {f.inside_window === false && <small>Outside the window, no effect</small>}
          </li>)}</ul>}
      </section>
    </div>
    <p className="sim-foot">{margin?.basis}</p>
  </>;
}

function AssumptionsPanel({ assumptions, scenario, update }) {
  const { effect_types: types, globals } = assumptions;
  const overrides = scenario.overrides ?? {};
  const hasOverrides = cleanOverrides(overrides) !== null;

  const setCoefficient = (name, key, value) => {
    const next = { ...(overrides.types?.[name] ?? {}), [key]: value };
    if (value === "" || Number(value) === types[name][key]) delete next[key];
    update({ overrides: { ...overrides, types: { ...overrides.types, [name]: next } } }, { keepPreset: true });
  };
  const setGlobal = (key, value) => {
    const next = { ...(overrides.globals ?? {}), [key]: value };
    if (value === "" || Number(value) === globals[key].value) delete next[key];
    update({ overrides: { ...overrides, globals: next } }, { keepPreset: true });
  };

  return <section className="panel sim-card" aria-labelledby="sim-assume">
    <div className="sim-h-row">
      <h2 id="sim-assume" className="sim-h">Assumptions</h2>
      {hasOverrides && <button type="button" className="sim-link" onClick={() => update({ overrides: {} }, { keepPreset: true })}><RotateCcw size={12} aria-hidden="true" />Reset to defaults</button>}
    </div>
    <p className="sim-muted">Every number below is an assumption, not a measurement. Change any of them to see how sensitive the result is. Changes travel with the shared link.</p>
    <details className="sim-details" open>
      <summary>Effect of each condition (percent change per slider unit)</summary>
      <div className="sim-table-wrap"><table className="sim-table sim-assume">
        <caption className="sr-only">Editable effect coefficients</caption>
        <thead><tr><th scope="col">Condition</th>{COEFFICIENT_KEYS.map((k) => <th scope="col" key={k}>{COEFFICIENT_LABELS[k]}</th>)}</tr></thead>
        <tbody>{SLIDER_ORDER.filter((n) => types[n]).map((name) => <tr key={name}>
          <th scope="row">{types[name].label}<small>{types[name].source_note}</small></th>
          {COEFFICIENT_KEYS.map((key) => <td key={key}><input type="number" step="0.05" min="-3" max="3" aria-label={`${types[name].label}: ${COEFFICIENT_LABELS[key]}`}
            value={overrides.types?.[name]?.[key] ?? types[name][key]} onChange={(e) => setCoefficient(name, key, e.target.value)} /></td>)}
        </tr>)}</tbody>
      </table></div>
    </details>
    <details className="sim-details">
      <summary>How effects combine</summary>
      <ul className="sim-globals">{Object.entries(globals).map(([key, spec]) => <li key={key}>
        <label><span>{spec.label}</span><small>{spec.note}</small></label>
        <input type="number" step="0.05" aria-label={spec.label} value={overrides.globals?.[key] ?? spec.value} onChange={(e) => setGlobal(key, e.target.value)} />
      </li>)}</ul>
      <p className="sim-foot">Stacked effects are capped: demand stays between x{assumptions.bounds.demand[0]} and x{assumptions.bounds.demand[1]}, and never goes negative.</p>
    </details>
    <details className="sim-details">
      <summary>Currency reference (not live)</summary>
      <ul className="sim-fx">{assumptions.fx.map((f) => <li key={f.currency}><strong>{f.currency}</strong><span>{f.per_usd} per USD, volatility {Math.round(f.annual_volatility * 100)}% a year</span></li>)}</ul>
      <p className="sim-foot">{assumptions.fx[0]?.source_note}</p>
    </details>
  </section>;
}

function SavedScenarios({ scenario, assumptions, onLoad }) {
  const [saved, setSaved] = useState(() => loadSaved());
  const [name, setName] = useState("");
  const [note, setNote] = useState("");

  const save = () => {
    const next = addSaved(saved, name, scenario);
    if (next === saved) return;
    setSaved(next);
    setNote(persistSaved(next) ? `Saved \u201c${name.trim()}\u201d.` : "Saved for this visit only. Your browser blocked storage.");
    setName("");
  };
  const remove = (n) => { const next = saved.filter((s) => s.name !== n); setSaved(next); persistSaved(next); };
  const describe = (s) => assumptions.destinations.find((d) => d.slug === s.scenario.destination)?.name ?? s.scenario.destination;

  return <section className="panel sim-card" aria-labelledby="sim-saved">
    <h2 id="sim-saved" className="sim-h">Saved scenarios</h2>
    <div className="sim-save">
      <label className="sim-field"><span>Name this scenario</span><input type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="e.g. Monsoon downside" /></label>
      <Button variant="outline" onClick={save} disabled={!name.trim()}><Save size={14} aria-hidden="true" />Save</Button>
    </div>
    {note && <p className="sim-muted" role="status">{note}</p>}
    {saved.length === 0 ? <p className="sim-muted">Saved scenarios stay in this browser. Use Copy link to share one with a teammate.</p>
      : <ul className="sim-saved">{saved.map((s) => <li key={s.name}>
        <button type="button" className="sim-saved-load" onClick={() => onLoad(s.scenario)}><strong>{s.name}</strong><small>{describe(s)}, {s.scenario.months} {s.scenario.months === 1 ? "month" : "months"} from {formatPeriod(s.scenario.start)}</small></button>
        <button type="button" className="sim-icon" onClick={() => remove(s.name)} aria-label={`Delete ${s.name}`}><Trash2 size={14} aria-hidden="true" /></button>
      </li>)}</ul>}
  </section>;
}

export default function SimulatorPage() {
  const info = featureInfo["/app/simulator"];
  const [params, setParams] = useSearchParams();
  const assumptionsApi = useApi("/simulator/assumptions");
  const presetsApi = useApi("/simulator/presets");
  const [raw, setRaw] = useState(() => initialScenario(params));
  const [copied, setCopied] = useState("");

  const assumptions = isUsable(assumptionsApi.data) ? assumptionsApi.data : null;
  const presets = Array.isArray(presetsApi.data?.presets) ? presetsApi.data.presets : [];
  const scenario = useMemo(() => (assumptions ? fitScenario(raw, assumptions) : raw), [raw, assumptions]);
  const request = useMemo(() => (assumptions ? buildRequest(scenario, assumptions) : null), [scenario, assumptions]);
  const run = useSimulation(request, { enabled: Boolean(request) });

  // A short link (?saved=id) loads the stored inputs once the assumptions are ready.
  const savedId = params.get("saved");
  const [loadedId, setLoadedId] = useState("");
  const [savedError, setSavedError] = useState("");
  useEffect(() => {
    if (!assumptions || !savedId || loadedId === savedId) return;
    setLoadedId(savedId);
    api(`/simulator/scenarios/${encodeURIComponent(savedId)}`)
      .then((found) => setRaw((current) => fitScenario({ ...current, ...found.request, preset: null }, assumptions)))
      .catch((error) => setSavedError(error.status === 404 ? "That saved scenario link was not found." : "Could not load that saved scenario."));
  }, [assumptions, savedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the address bar in step so the page URL is always a shareable link.
  const encoded = encodeScenario(scenario);
  useEffect(() => {
    if (!assumptions || params.get("scenario") === encoded) return;
    if (savedId && loadedId !== savedId) return; // let the saved scenario load first
    setParams(new URLSearchParams({ scenario: encoded }), { replace: true });
    // `params` is read only to skip a redundant write; `encoded` is what changes.
  }, [encoded, assumptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (patch, { keepPreset = false } = {}) =>
    setRaw({ ...scenario, ...patch, preset: keepPreset ? scenario.preset : null });
  const applyPreset = (preset) => setRaw(presetToScenario(preset, assumptions));
  const loadScenario = (saved) => setRaw(fitScenario(saved, assumptions));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied("Link copied. Anyone with it sees this scenario.");
    } catch {
      setCopied("Could not copy automatically. Copy the address from your browser instead.");
    }
  };

  const invalidShape = assumptionsApi.status === "success" && !assumptions;

  return <div className="sim-page">
    <PageHeader eyebrow={info.eyebrow} title={info.title} description={info.description}
      action={assumptions && <Button variant="outline" onClick={copyLink}><Link2 size={14} aria-hidden="true" />Copy link</Button>} />
    <div className="sim-notice" role="note"><Status tone="gold">Sample data</Status><p>Scenarios are illustrations built from editable assumptions on top of a synthetic demand forecast. They are not predictions of real demand, prices or profit.</p></div>
    {copied && <p className="sim-muted" role="status">{copied}</p>}
    {savedError && <p className="sim-muted" role="alert">{savedError}</p>}

    <ApiState api={assumptionsApi} label="the simulator" />
    {invalidShape && <div className="api-state api-state-error" role="alert"><div><strong>Could not load the simulator</strong><p>The server sent an unexpected response. Try again in a moment.</p></div><Button variant="outline" onClick={assumptionsApi.reload}>Try again</Button></div>}

    {assumptions && <div className="sim-layout">
      <div className="sim-side">
        <Controls scenario={scenario} assumptions={assumptions} update={update} result={run.data} applyPreset={applyPreset} presets={presets} />
        <SavedScenarios scenario={scenario} assumptions={assumptions} onLoad={loadScenario} />
        <ShortLink request={request} />
      </div>
      <div className="sim-main" aria-busy={run.loading}>
        {run.waking && <div className="api-state" role="status"><span className="api-state-pulse" /><div><strong>Waking the server</strong><p>The free hosting plan sleeps when idle, so the first run can take up to a minute.</p></div></div>}
        {run.error && <div className="api-state api-state-error" role="alert"><div><strong>Could not run this scenario</strong><p>{run.error.detail ?? (run.error.kind === "network" ? "We could not reach the server." : "The server returned an error.")}</p></div><Button variant="outline" onClick={run.retry}>Try again</Button></div>}
        {!run.data && run.loading && !run.waking && <div className="api-state" role="status"><span className="api-state-pulse" /><div><strong>Running the scenario</strong></div></div>}
        {run.data && <div className={run.loading ? "sim-stale" : ""}><Results result={run.data} /></div>}
        {run.data && <PackageImpactPanel request={request} />}
        <AssumptionsPanel assumptions={assumptions} scenario={scenario} update={update} />
        <p className="sim-foot"><ArrowRight size={12} aria-hidden="true" /> Baseline comes from the <Link to="/app/forecast">demand forecast</Link>. Margin uses simulated bookings from the <Link to="/app/analytics">profitability analysis</Link>.</p>
      </div>
    </div>}
  </div>;
}
