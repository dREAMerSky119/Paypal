import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Filter, Info, RefreshCw,
  Search, ShieldAlert, ShieldCheck, Wrench, X, XCircle, ScanLine,
} from "lucide-react";

import { api } from "../lib/api.js";
import { useApi } from "../lib/useApi.js";
import { ApiState, Button, PageHeader, Status } from "./ui.jsx";
import { formatMoney, formatPeriod } from "../lib/format.js";
import { destinations } from "../data/destinations.js";
import {
  CODE_LABELS, KIND_LABELS, SEVERITIES, SEVERITY_LABELS, SEVERITY_TONES, STATUS_LABELS,
  anomalyPath, apiQuery, flagLabel, filtersFromParams, paramsFromFilters, plural,
} from "../lib/anomaly.js";
import "../anomalies.css";

const PAGE_SIZE = 20;
const destName = (slug) => destinations.find((d) => d.slug === slug)?.cardTitle ?? slug ?? "—";

function FilterBar({ filters, update, counts }) {
  const select = (key, label, options, anyLabel) => (
    <label className="an-field"><span>{label}</span>
      <select value={filters[key]} onChange={(event) => update({ [key]: event.target.value })}>
        <option value="">{anyLabel}</option>
        {options.map(([value, text]) => (
          <option key={value} value={value}>{text}</option>
        ))}
      </select>
    </label>
  );

  return <form className="an-filters" role="search" aria-label="Filter anomalies"
               onSubmit={(event) => event.preventDefault()}>
    <label className="an-field an-search"><span>Search</span>
      <div><Search size={14} aria-hidden="true" />
        <input type="search" value={filters.q} maxLength={100} placeholder="Item, month or reason"
               onChange={(event) => update({ q: event.target.value })} /></div></label>
    {select("severity", "Severity", SEVERITIES.map((s) => [s, `${SEVERITY_LABELS[s]} (${counts[s] ?? 0})`]), "Any severity")}
    {select("kind", "Kind", Object.entries(KIND_LABELS), "Any kind")}
    {select("status", "Status", Object.entries(STATUS_LABELS), "Any status")}
    {(filters.severity || filters.kind || filters.q || filters.status !== "open") &&
      <button type="button" className="an-clear"
              onClick={() => update({ severity: "", kind: "", q: "", status: "open", page: 1 })}>
        <X size={13} /> Clear filters</button>}
  </form>;
}

function SeverityBadge({ severity }) {
  return <Status tone={SEVERITY_TONES[severity] ?? "sage"}>{SEVERITY_LABELS[severity] ?? severity}</Status>;
}

function CodeChips({ codes, limit = 3 }) {
  const shown = (codes || []).slice(0, limit);
  const rest = (codes || []).length - shown.length;
  return <span className="an-codes">{shown.map((code) =>
    <code key={code} title={code}>{CODE_LABELS[code] ?? code}</code>)}
    {rest > 0 && <code title={(codes || []).slice(limit).map((c) => CODE_LABELS[c] ?? c).join(", ")}>+{rest}</code>}</span>;
}

function AnomalyRow({ entry, onOpen }) {
  const isPrice = entry.kind === "rate";
  return <tr className={entry.resolved ? "is-resolved" : undefined}>
    <th scope="row">
      <button type="button" className="an-name" onClick={() => onOpen(entry.key)}>{entry.item_name || "—"}</button>
      <small>{KIND_LABELS[entry.kind]}{entry.item_id ? ` · ${entry.item_id}` : ""}{entry.resolved ? " · resolved" : ""}</small>
    </th>
    <td>{isPrice ? destName(entry.destination) : "—"}</td>
    <td>{isPrice && entry.period ? formatPeriod(entry.period) : "—"}</td>
    <td className="num">{entry.price_usd != null ? formatMoney(entry.price_usd, "USD") : "—"}</td>
    <td className="num">{entry.expected_usd != null ? formatMoney(entry.expected_usd, "USD") : "—"}</td>
    <td className="num">{entry.ratio != null ? `${entry.ratio.toFixed(2)}×` : "—"}</td>
    <td><SeverityBadge severity={entry.severity} /></td>
    <td><CodeChips codes={entry.codes} /></td>
  </tr>;
}

function ResolvePanel({ entry, onResolved, onClose }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(entry.resolution?.status || null);

  const act = async (action) => {
    setError("");
    if (action === "fix" && !note.trim()) {
      setError("Describe the fix, so the next person knows what changed.");
      return;
    }
    setBusy(action);
    try {
      await api(anomalyPath(entry.key, "resolve"), {
        method: "POST",
        body: JSON.stringify({ action, note: note.trim() || null }),
      });
      setDone(action === "accept" ? "accepted" : action === "dismiss" ? "dismissed" : "fixed");
      onResolved();
    } catch (err) {
      setError(err.detail || "Could not save that decision. Check the backend and try again.");
    } finally {
      setBusy("");
    }
  };

  const undo = async () => {
    setBusy("reopen");
    setError("");
    try {
      await api(anomalyPath(entry.key, "reopen"), { method: "POST" });
      setDone(null);
      onResolved();
    } catch (err) {
      setError(err.detail || "Could not reopen this anomaly.");
    } finally {
      setBusy("");
    }
  };

  if (done) {
    return <div className="an-resolve">
      <p className="an-resolved-note"><CheckCircle2 size={16} aria-hidden="true" />
        Recorded as <strong>{done}</strong>. It stays out of the open count and survives a restart.</p>
      <div className="an-resolve-actions">
        <Button variant="outline" onClick={undo} disabled={busy === "reopen"}>
          {busy === "reopen" ? "Reopening…" : "Reopen"}
        </Button>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    </div>;
  }

  return <div className="an-resolve">
    <label className="an-field an-field-wide"><span>Note (required to mark a fix)</span>
      <textarea rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)}
                placeholder="For example: corrected the extra digit with the supplier on 12 Nov" /></label>
    {error && <p className="an-error" role="alert"><AlertTriangle size={15} aria-hidden="true" />{error}</p>}
    <div className="an-resolve-actions">
      <Button onClick={() => act("accept")} disabled={Boolean(busy)}>
        <CheckCircle2 size={15} aria-hidden="true" />{busy === "accept" ? "Saving…" : "Accept as real"}</Button>
      <Button variant="outline" onClick={() => act("dismiss")} disabled={Boolean(busy)}>
        <XCircle size={15} aria-hidden="true" />{busy === "dismiss" ? "Saving…" : "Dismiss"}</Button>
      <Button variant="outline" onClick={() => act("fix")} disabled={Boolean(busy)}>
        <Wrench size={15} aria-hidden="true" />{busy === "fix" ? "Saving…" : "Mark as fixed"}</Button>
    </div>
  </div>;
}

function AnomalyDrawer({ entry, onClose, onResolved }) {
  const closeRef = useMemo(() => ({ current: null }), []);
  useEffect(() => {
    const opener = document.activeElement;
    closeRef.current?.focus();
    return () => { if (opener instanceof HTMLElement && document.contains(opener)) opener.focus(); };
  }, [closeRef]);
  const onKeyDown = (event) => { if (event.key === "Escape") onClose(); };

  return <div className="an-overlay" onMouseDown={onClose}>
    <aside className="an-drawer" role="dialog" aria-modal="true" aria-labelledby="an-drawer-title"
           onMouseDown={(event) => event.stopPropagation()} onKeyDown={onKeyDown}>
      <header>
        <div>
          <p className="an-eyebrow">{KIND_LABELS[entry.kind]} · {SEVERITY_LABELS[entry.severity]}</p>
          <h2 id="an-drawer-title">{entry.item_name || "Anomaly"}</h2>
          <p className="an-sub">{entry.kind === "rate"
            ? `${destName(entry.destination)}${entry.period ? ` · ${formatPeriod(entry.period)}` : ""}`
            : "Text and supplier checks"}</p>
        </div>
        <button type="button" className="an-icon-button" ref={closeRef} onClick={onClose} aria-label="Close">
          <X size={18} /></button>
      </header>

      {entry.kind === "rate" && <dl className="an-facts">
        <div><dt>Observed</dt><dd>{formatMoney(entry.price_usd, "USD")}</dd></div>
        <div><dt>Expected</dt><dd>{entry.expected_usd != null ? formatMoney(entry.expected_usd, "USD") : "—"}</dd></div>
        <div><dt>Ratio</dt><dd>{entry.ratio != null ? `${entry.ratio.toFixed(3)}×` : "—"}</dd></div>
        <div><dt>Layers</dt><dd>{entry.layers.join(", ")}</dd></div>
      </dl>}

      <section aria-labelledby="an-why">
        <h3 id="an-why">Why this was flagged</h3>
        <p className="an-explain">{entry.explanation}</p>
        <ul className="an-findings">{entry.findings.map((finding, index) => <li key={`${finding.code}-${index}`}>
          <AlertTriangle size={14} aria-hidden="true" />
          <div><strong>{CODE_LABELS[finding.code] ?? finding.code}</strong>
            <span>{finding.detail}</span>
            <small>Layer: {finding.layer}</small></div>
        </li>)}</ul>
      </section>

      <section aria-labelledby="an-decide">
        <h3 id="an-decide">What happens next</h3>
        <ResolvePanel entry={entry} onResolved={onResolved} onClose={onClose} />
      </section>

      <p className="an-disclaimer"><Info size={14} aria-hidden="true" />
        A flag is a prompt to check the entry, not proof of a wrong rate. Accepting records that the
        price is genuinely unusual; dismissing records that the detector was wrong.</p>
    </aside>
  </div>;
}

export default function SupplierAnomalyPage() {
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const [qInput, setQInput] = useState(filters.q);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState("");

  const update = useCallback((patch) => {
    setParams((previous) => {
      const current = filtersFromParams(previous);
      const resetPage = ["severity", "kind", "status", "q"].some((key) => key in patch);
      return paramsFromFilters({ ...current, page: resetPage ? 1 : current.page, ...patch });
    }, { replace: true });
  }, [setParams]);

  useEffect(() => {
    if (qInput.trim() === filters.q) return undefined;
    const timer = setTimeout(() => update({ q: qInput.trim() }), 300);
    return () => clearTimeout(timer);
  }, [qInput, filters.q, update]);
  useEffect(() => setQInput(filters.q), [filters.q]);

  const feed = useApi(`/anomalies?${apiQuery(filters, { pageSize: PAGE_SIZE })}`);
  const summary = useApi("/anomalies/summary");

  const open = (key) => update({ item: key });
  const close = () => update({ item: "" });
  const selected = feed.data?.items?.find((entry) => entry.key === filters.item);

  const runScan = async () => {
    setScanning(true);
    setScanError("");
    try {
      setScanResult(await api("/anomalies/scan", { method: "POST" }));
      feed.reload();
      summary.reload();
    } catch (err) {
      setScanError(err.detail || "The scan did not finish. Check the backend and try again.");
    } finally {
      setScanning(false);
    }
  };

  const counts = feed.data?.severities ?? summary.data ?? {};
  const total = feed.data?.count ?? 0;

  return <>
    <PageHeader eyebrow="SIGNALS & CHANGES" title={<>Anomaly watch<span className="title-period">.</span></>}
      description="Every rate, name and supplier the detector flags, with the reason in plain language."
      action={<button type="button" className="an-scan" onClick={runScan} disabled={scanning}>
        <ScanLine size={16} aria-hidden="true" />{scanning ? "Scanning…" : "Scan now"}</button>} />

    <p className="an-banner" role="note"><Status tone="gold">Sample data</Status>
      Five per cent of the seeded rates carry deliberate entry errors (an extra digit, a dropped
      digit, a currency slip, a zero or a negative). The detector is measured against those labels.</p>

    {scanResult && <p className="an-scan-note" role="status">
      Scanned {scanResult.rates_checked.toLocaleString()} rates just now: {scanResult.open} open flags
      ({scanResult.by_severity.high} high, {scanResult.by_severity.medium} medium, {scanResult.by_severity.low} low).
    </p>}
    {scanError && <p className="an-error" role="alert"><AlertTriangle size={15} aria-hidden="true" />{scanError}</p>}

    <div className="an-headline">
      <div className="an-headline-count"><ShieldAlert size={20} aria-hidden="true" />
        <strong>{counts.open ?? total}</strong><span>open {plural(counts.open ?? total, "flag")}</span></div>
      <div className="an-headline-meta">
        {SEVERITIES.map((severity) => <span key={severity} className={`an-tally is-${severity}`}>
          <i aria-hidden="true" />{SEVERITY_LABELS[severity]} {counts[severity] ?? 0}</span>)}
        <span className="an-tally"><ShieldCheck size={13} aria-hidden="true" />Resolved {summary.data?.resolved ?? 0}</span>
      </div>
    </div>

    <FilterBar filters={filters} update={update} counts={counts} />

    <div className="an-toolbar">
      <p aria-live="polite" className="an-count">{feed.data
        ? `${total} ${total === 1 ? "match" : "matches"}${filters.status === "open" ? " open" : ""}`
        : " "}</p>
      <span className="an-toolbar-note"><Filter size={13} aria-hidden="true" />
        Sorted by severity, then destination</span>
    </div>

    {(feed.status === "error" || (feed.isLoading && !feed.data)) && <ApiState api={feed} label="the anomaly feed" />}
    {feed.isWaking && <p className="an-muted" role="status"><RefreshCw size={14} aria-hidden="true" />
      Waking the server. On a free plan this can take up to a minute.</p>}

    {feed.data && total === 0 && <div className="an-empty">
      <ShieldCheck size={26} aria-hidden="true" />
      <strong>Nothing open with these filters.</strong>
      <p>{filters.status === "open"
        ? "Either the catalogue is clean or everything here has been decided. Switch Status to All to see resolved items."
        : "Try a different severity, kind or search."}</p>
    </div>}

    {feed.data && total > 0 && <>
      <div className="an-scroll">
        <table className="an-table">
          <caption className="sr-only">Anomalies, page {feed.data.page} of {feed.data.pages}</caption>
          <thead><tr>
            <th scope="col">Item</th><th scope="col">Destination</th><th scope="col">Month</th>
            <th scope="col" className="num">Observed</th><th scope="col" className="num">Expected</th>
            <th scope="col" className="num">Ratio</th><th scope="col">Severity</th><th scope="col">Signals</th>
          </tr></thead>
          <tbody>{feed.data.items.map((entry) => <AnomalyRow key={entry.key} entry={entry} onOpen={open} />)}</tbody>
        </table>
      </div>
      {feed.data.pages > 1 && <nav className="an-pager" aria-label="Pagination">
        <span>{plural(total, "flag")} · page {feed.data.page} of {feed.data.pages}</span>
        <div>
          <Button variant="outline" disabled={feed.data.page <= 1}
                  onClick={() => update({ page: feed.data.page - 1 })}>
            <ChevronLeft size={15} aria-hidden="true" />Previous</Button>
          <Button variant="outline" disabled={feed.data.page >= feed.data.pages}
                  onClick={() => update({ page: feed.data.page + 1 })}>
            Next<ChevronRight size={15} aria-hidden="true" /></Button>
        </div>
      </nav>}
    </>}

    <p className="an-footnote">
      Detection runs in three layers: fixed rules (zero or negative price, 10× and 100× peers, currency
      slips, missing fields), robust statistics (a MAD z-score against comparable rates and against the
      item's own history) and an Isolation Forest as a third, corroborating signal. Text checks compare
      names with the place vocabulary using fuzzy matching. Importing a CSV runs the same scan on the new rows.
    </p>

    {selected && <AnomalyDrawer entry={selected} onClose={close}
      onResolved={() => { feed.reload(); summary.reload(); }} />}
  </>;
}
