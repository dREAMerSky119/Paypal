
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, BadgeCheck, Calculator, CheckCircle2, ExternalLink,
  Leaf, MapPin, RefreshCw, ShieldCheck, Users,
} from "lucide-react";
import { api } from "../lib/api.js";
import "../responsible-travel.css";

const EMPTY = { flight_km: 0, rail_km: 0, road_km: 0, hotel_nights: 0, travellers: 1 };
const WEIGHT_LABELS = [
  ["local_ownership", "Local ownership"],
  ["certification", "Certifications"],
  ["community_benefit", "Community benefit"],
  ["environmental", "Environmental practices"],
];

function formatKind(kind) {
  return String(kind || "partner").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function PartnerCard({ partner, onOpen }) {
  const scored = partner.score !== null && partner.score !== undefined;
  return (
    <article className="rt-partner-card">
      <div className="rt-partner-top">
        <div className="rt-partner-icon"><Users size={17}/></div>
        <span className="rt-sample-tag">SAMPLE DATA</span>
      </div>
      <div className="rt-partner-kind">{formatKind(partner.kind)} · {partner.locality || "Local area"}</div>
      <h3>{partner.name}</h3>
      <div className="rt-partner-scoreline">
        {scored ? <>
          <strong>{Number(partner.score).toFixed(0)}<small>/100</small></strong>
          <span className="rt-verified-label"><CheckCircle2 size={13}/> {partner.verified_claim_count} verified claims</span>
        </> : <>
          <strong className="rt-no-score">—</strong>
          <span className="rt-pending-label">Not yet verified</span>
        </>}
      </div>
      {scored && <div className="rt-score-track"><span style={{ width: `${Math.min(100, partner.score)}%` }}/></div>}
      <div className="rt-partner-meta">
        <span>{formatKind(partner.ownership)}</span>
        <span>{partner.pending_claim_count} pending claims</span>
      </div>
      <button className="rt-details-button" type="button" onClick={() => onOpen(partner)}>
        View scoring breakdown <ExternalLink size={13}/>
      </button>
    </article>
  );
}

function ScoreBreakdown({ partner, onClose }) {
  if (!partner) return null;
  return <div className="rt-modal-backdrop" role="presentation" onClick={onClose}>
    <section className="rt-score-modal" role="dialog" aria-modal="true" aria-label="Partner score breakdown" onClick={(e) => e.stopPropagation()}>
      <button className="rt-modal-close" onClick={onClose} aria-label="Close">×</button>
      <span className="rt-kicker">PARTNER SCORECARD · SAMPLE DATA</span>
      <h2>{partner.name}</h2>
      <div className="rt-modal-score">{partner.score == null ? "Not yet verified" : `${partner.score}/100`}</div>
      <p className="rt-modal-note">Only claims marked <b>verified</b> contribute points. Self-reported and unverified claims remain visible but contribute zero.</p>
      {WEIGHT_LABELS.map(([key, label]) => <div className="rt-breakdown-row" key={key}>
        <span>{label}</span><b>{partner.category_breakdown?.[key] || 0}/{({local_ownership:35,certification:30,community_benefit:20,environmental:15})[key]}</b>
      </div>)}
      <div className="rt-claim-list">
        {partner.claims.map((claim) => <div className="rt-claim" key={claim.id}>
          <div><b>{claim.label}</b><p>{claim.claim}</p></div>
          <div className="rt-claim-status">
            <span className={`rt-status rt-status-${claim.status}`}>{claim.status.replace("_", " ")}</span>
            <strong>{claim.points} pts</strong>
          </div>
        </div>)}
      </div>
      <p className="rt-modal-disclaimer">Illustrative sample score calculated from the supplied wayfare_master.csv. This is not an independent real-world audit or certification.</p>
    </section>
  </div>;
}

function CarbonCalculator() {
  const [values, setValues] = useState(EMPTY);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fields = [
    ["flight_km", "Flight distance", "Passenger-km", 50000],
    ["rail_km", "Rail distance", "Passenger-km", 50000],
    ["road_km", "Road distance", "Passenger-km", 50000],
    ["hotel_nights", "Hotel nights", "Room-nights", 365],
    ["travellers", "Travellers", "People", 20],
  ];
  const setValue = (key, raw) => {
    setValues((old) => ({ ...old, [key]: raw }));
    setResult(null); setError("");
  };
  const submit = async (event) => {
    event.preventDefault();
    setError(""); setResult(null);
    // Catch empty, invalid and out-of-range values in the UI before sending.
    for (const [key, label, , max] of fields) {
      const number = Number(values[key]);
      const min = key === "travellers" ? 1 : 0;
      if (values[key] === "" || !Number.isFinite(number) || number < min || number > max) {
        setError(`${label} must be a number between ${min.toLocaleString()} and ${max.toLocaleString()}.`);
        return;
      }
    }
    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Number(value)]));
      const data = await api("/responsible/carbon", { method: "POST", body: JSON.stringify(payload) });
      setResult(data);
    } catch (err) {
      setError(err.detail || (err.status === 400 ? "Please check your trip values." : err.message) || "Unable to calculate this estimate.");
    } finally { setBusy(false); }
  };
  return <section className="rt-carbon-section">
    <div className="rt-section-head"><div><span className="rt-kicker">TRIP IMPACT ESTIMATOR</span><h2>Carbon emissions calculator</h2><p>Estimate the footprint of transport and accommodation in one trip.</p></div><div className="rt-carbon-icon"><Calculator size={20}/></div></div>
    <form className="rt-carbon-form" onSubmit={submit} noValidate>
      {fields.map(([key, label, unit, max]) => <label className="rt-field" key={key}>
        <span>{label}</span>
        <input type="number" min={key === "travellers" ? 1 : 0} max={max} step="1" value={values[key]}
          onChange={(e) => setValue(key, e.target.value)} inputMode="numeric" required/>
        <small>{unit} · max {max.toLocaleString()}</small>
      </label>)}
      <button className="rt-calculate" type="submit" disabled={busy}>{busy ? "Calculating…" : "Calculate emissions"}</button>
    </form>
    {error && <div className="rt-alert rt-carbon-error"><AlertCircle size={17}/><span>{error}</span></div>}
    {result && <div className="rt-carbon-result">
      <div className="rt-carbon-total"><span>Estimated trip footprint</span><b>{result.total_kg.toLocaleString()} kg CO₂e</b><small>{result.per_traveller_kg.toLocaleString()} kg CO₂e per traveller</small></div>
      <div className="rt-carbon-breakdown">{Object.entries(result.components_kg).map(([key, value]) => <div key={key}><span>{key.replaceAll("_", " ")}</span><b>{value.toLocaleString()} kg</b></div>)}</div>
      <p className="rt-assumptions">{result.assumptions}</p>
    </div>}
    <p className="rt-disclaimer">Approximate planning estimate, not an audited footprint. Emission factors are transparent proxy averages, not country-specific official factors. Enter distance in passenger-km.</p>
  </section>;
}

export default function ResponsibleTravelPage() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [destination, setDestination] = useState("all");
  const [kind, setKind] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedPartner, setSelectedPartner] = useState(null);

  const load = async () => {
    setLoading(true); setError("");
    try { setOverview(await api("/responsible/partners")); }
    catch (err) { setError(err.detail || err.message || "Unable to load responsible-travel data."); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const visiblePartners = useMemo(() => (overview?.partners || []).filter((p) =>
    (destination === "all" || p.destination_slug === destination) &&
    (kind === "all" || p.kind === kind) &&
    (!search || `${p.name} ${p.locality}`.toLowerCase().includes(search.toLowerCase()))
  ), [overview, destination, kind, search]);

  const selectedDestination = overview?.destinations?.find((d) => d.slug === destination);
  const destinationStats = selectedDestination || null;
  const kindOptions = [...new Set((overview?.partners || []).map((p) => p.kind))].sort();

  return <div className="responsible-page">
    <header className="rt-heading"><div><div className="rt-eyebrow"><Leaf size={14}/> TRAVEL WITH CARE</div><h1>Responsible travel</h1><p>Compare partner impact scores, inspect claim-level evidence and estimate trip emissions.</p></div><div className="rt-data-pill"><ShieldCheck size={15}/> Explainable scoring</div></header>
    {error && <div className="rt-alert"><AlertCircle size={17}/><span>{error}</span><button onClick={load}>Try again</button></div>}
    {loading ? <div className="rt-loading">Loading partner scores…</div> : overview && <>
      <section className="rt-intro-card">
        <div className="rt-intro-icon"><BadgeCheck size={21}/></div>
        <div><strong>How the responsible score works</strong><p>Supplier score = sum of claim points marked verified. Self-reported and unverified claims contribute zero. Destination averages include scored suppliers only; partners without verified claims are labelled “Not yet verified”, not given a misleading zero.</p></div>
        <div className="rt-intro-count"><b>{overview.scored_suppliers}/{overview.total_suppliers}</b><span>scored sample partners</span></div>
      </section>
      <section className="rt-section">
        <div className="rt-section-head"><div><span className="rt-kicker">DESTINATION OVERVIEW</span><h2>Destination responsibility scores</h2><p>Average of partners with at least one verified claim in the sample dataset.</p></div></div>
        <div className="rt-destination-grid">
          {overview.destinations.map((item) => <button key={item.slug} className={`rt-destination-chip ${destination === item.slug ? "active" : ""}`} onClick={() => setDestination(destination === item.slug ? "all" : item.slug)}>
            <span>{item.name}</span><small>{item.average_score == null ? "No verified score" : `${item.average_score}/100`}</small>
          </button>)}
        </div>
      </section>
      {destinationStats && <div className="rt-destination-summary">
        <div><span>Average verified score</span><b>{destinationStats.average_score == null ? "—" : `${destinationStats.average_score}/100`}</b></div>
        <div><span>Sample partners</span><b>{destinationStats.supplier_count}</b></div>
        <div><span>With verified claims</span><b>{destinationStats.scored_supplier_count}</b></div>
        <div><span>Not yet verified</span><b>{destinationStats.not_yet_verified_count}</b></div>
      </div>}
      <section className="rt-section">
        <div className="rt-section-head"><div><span className="rt-kicker">PARTNER INVENTORY</span><h2>{destination === "all" ? "All sample partners" : selectedDestination?.name + " partners"}</h2><p>Open any partner to inspect the claim-by-claim calculation.</p></div></div>
        <div className="rt-partner-filters">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search partner or locality…"/>
          <select value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All partner types</option>{kindOptions.map((value) => <option key={value} value={value}>{formatKind(value)}</option>)}</select>
          {destination !== "all" && <button onClick={() => setDestination("all")}>Clear destination</button>}
        </div>
        <div className="rt-partner-grid">
          {visiblePartners.map((partner) => <PartnerCard key={partner.id} partner={partner} onOpen={setSelectedPartner}/>)}
          {!visiblePartners.length && <p className="rt-empty">No partners match these filters.</p>}
        </div>
      </section>
      <section className="rt-methodology">
        <h3>Scoring weights</h3>
        <div className="rt-weight-grid">{WEIGHT_LABELS.map(([key,label]) => <div key={key}><span>{label}</span><b>{overview.scoring_weights[key]} pts</b></div>)}</div>
        <p>{overview.scoring_logic}</p>
        <p className="rt-sample-warning">Sample-data disclosure: supplier and claim names and statuses come from the supplied CSV. Scores demonstrate the scoring model and should not be represented as independent real-world certifications.</p>
      </section>
      <CarbonCalculator/>
    </>}
    <ScoreBreakdown partner={selectedPartner} onClose={() => setSelectedPartner(null)}/>
  </div>;
}
