import { useState } from "react";
import { Link2, Package } from "lucide-react";
import { api } from "../lib/api.js";
import { useApi } from "../lib/useApi.js";
import { formatMoney, formatPeriod } from "../lib/format.js";
import { Button, Status } from "./ui.jsx";

const scenarioOf = (request) => ({
  adjustments: request?.adjustments ?? {},
  events: request?.events ?? [],
  ...(request?.overrides ? { overrides: request.overrides } : {}),
});

/** Saves the scenario's inputs on the server and copies a short link (?saved=id). */
export function ShortLink({ request }) {
  const [state, setState] = useState({ busy: false, note: "" });
  const save = async () => {
    setState({ busy: true, note: "" });
    try {
      const created = await api("/simulator/scenarios", {
        method: "POST",
        body: JSON.stringify({ name: `${request.destination} ${request.start}`, request }),
      });
      const link = `${window.location.origin}${created.share_path}`;
      try {
        await navigator.clipboard.writeText(link);
        setState({ busy: false, note: "Short link copied. It reruns this scenario against the current forecast." });
      } catch {
        setState({ busy: false, note: `Short link: ${link}` });
      }
    } catch (error) {
      setState({ busy: false, note: error.detail ?? "Could not save this scenario right now." });
    }
  };
  return <section className="panel sim-card" aria-labelledby="sim-short">
    <h2 id="sim-short" className="sim-h">Short link</h2>
    <p className="sim-muted">Saves only the scenario inputs on the server, so a link works on any device.</p>
    <Button variant="outline" onClick={save} disabled={!request || state.busy}><Link2 size={14} aria-hidden="true" />{state.busy ? "Saving…" : "Save and copy short link"}</Button>
    {state.note && <p className="sim-muted" role="status">{state.note}</p>}
  </section>;
}

/** Margin impact of the current scenario on one saved package. */
export function PackageImpactPanel({ request }) {
  const list = useApi("/packages");
  const [packageId, setPackageId] = useState("");
  const [state, setState] = useState({ busy: false, data: null, error: "" });
  const packages = (list.data?.items ?? []).filter((p) => p.destination_slug === request?.destination);

  const run = async (id) => {
    setPackageId(id);
    if (!id) { setState({ busy: false, data: null, error: "" }); return; }
    setState({ busy: true, data: null, error: "" });
    try {
      const data = await api("/simulator/package-impact", { method: "POST", body: JSON.stringify({ package_id: id, scenario: scenarioOf(request) }) });
      setState({ busy: false, data, error: "" });
    } catch (error) {
      setState({ busy: false, data: null, error: error.detail ?? "Could not apply the scenario to this package." });
    }
  };

  const d = state.data;
  return <section className="panel sim-card" aria-labelledby="sim-pkg">
    <h2 id="sim-pkg" className="sim-h"><Package size={15} aria-hidden="true" /> Apply to a saved package</h2>
    {list.status === "loading" && <p className="sim-muted">Loading saved packages…</p>}
    {list.status === "error" && <p className="sim-muted" role="alert">Could not load saved packages.</p>}
    {list.status === "success" && packages.length === 0 && <p className="sim-muted">No saved packages for this destination yet. Build and save one in the package builder to test it here.</p>}
    {packages.length > 0 && <label className="sim-field"><span>Saved package</span>
      <select value={packageId} onChange={(e) => run(e.target.value)}>
        <option value="">Choose a package</option>
        {packages.map((p) => <option key={p.package_id} value={p.package_id}>{p.title || p.package_id} ({p.start_date})</option>)}
      </select></label>}
    {state.busy && <p className="sim-muted" role="status">Applying the scenario…</p>}
    {state.error && <p className="sim-muted" role="alert">{state.error}</p>}
    {d && <div aria-live="polite">
      <div className="sim-pkg-grid">
        <div><small>Margin now</small><strong>{d.baseline.margin_pct}%</strong><span>{formatMoney(d.baseline.profit_usd, "USD")} profit</span></div>
        <div><small>Margin in scenario</small><strong>{d.scenario.margin_pct}%</strong><span>{formatMoney(d.scenario.profit_usd, "USD")} profit</span></div>
        <div><small>Change</small><strong>{d.delta.margin_points > 0 ? "+" : ""}{d.delta.margin_points} pts</strong><span>{d.delta.profit_usd > 0 ? "+" : ""}{formatMoney(d.delta.profit_usd, "USD")}</span></div>
      </div>
      {d.warnings.map((w) => <p className="sim-muted" key={w}><Status tone="gold">Note</Status> {w}</p>)}
      <table className="sim-pkg-table"><caption className="sr-only">Package impact by month</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">Sell ×</th><th scope="col">Cost ×</th><th scope="col">Profit now</th><th scope="col">Profit scenario</th></tr></thead>
        <tbody>{d.months.map((m) => <tr key={m.period}><th scope="row">{formatPeriod(m.period)}</th><td>{m.sell_multiplier}</td><td>{m.cost_multiplier}</td><td>{formatMoney(m.baseline_profit, "USD")}</td><td>{formatMoney(m.scenario_profit, "USD")}</td></tr>)}</tbody></table>
      {d.nearby_alternatives.length > 0 && <div className="sim-pkg-alt">
        <p><strong>If demand moves elsewhere</strong></p>
        <ul>{d.nearby_alternatives.map((a) => <li key={a.slug}>{a.name} could see about +{a.uplift_pct}%.{a.spots.length > 0 && <> Similar spots there: {a.spots.map((s) => s.name).join(", ")}.</>}</li>)}</ul>
      </div>}
      <p className="sim-muted">{d.basis}</p>
    </div>}
  </section>;
}
