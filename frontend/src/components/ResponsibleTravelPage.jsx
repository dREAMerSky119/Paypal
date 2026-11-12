import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowDownRight, ArrowRight, BedDouble, ChevronDown,
  Compass, Leaf, MapPin, Search, Sparkles, Calculator, Users,
} from "lucide-react";
import { ApiState, PageHeader } from "./ui.jsx";
import PriceDisplay from "./PriceDisplay.jsx";
import { useApi } from "../lib/useApi.js";
import { api } from "../lib/api.js";
import { destinations } from "../data/destinations.js";
import "../responsible-travel.css";

function StayCard({ stay, index }) {
  return (
    <article className={`rt-stay-card ${index % 3 === 0 ? "rt-stay-card-featured" : ""}`}>
      <div className="rt-stay-image-wrap">
        <img src={stay.image_url} alt={stay.image_alt} loading={index < 3 ? "eager" : "lazy"} />
        <span className="rt-image-index">{String(index + 1).padStart(2, "0")}</span>
        
      </div>
      <div className="rt-stay-content">
        <div className="rt-stay-kicker">
          <span>{stay.kind_label}</span>
          <span className="rt-stay-dot" />
          <span>{stay.tier || "Stay"}</span>
        </div>
        <h3>{stay.name}</h3>
        <p className="rt-stay-location"><MapPin size={13} /> {stay.locality ? `${stay.locality}, ` : ""}{stay.destination_name}</p>
        <p className="rt-stay-note">{stay.editorial_note}</p>
        <div className="rt-stay-bottom">
          <div>
            <span className="rt-price-label">Indicative net rate</span>
            <strong><PriceDisplay amount={stay.price} currency={stay.currency} usdReference={stay.price_usd} compact /><small> / room night</small></strong>
          </div>
          <span className="rt-capacity"><Users size={13} /> Up to {stay.capacity || 2}</span>
        </div>
      </div>
    </article>
  );
}

const EMPTY = { flight_km: 0, rail_km: 0, road_km: 0, hotel_nights: 0, travellers: 1 };

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
  return <section className="rt-carbon-section" id="carbon-estimator">
    <div className="rt-section-head">
      <div>
        <span className="rt-kicker">TRIP IMPACT ESTIMATOR</span>
        <h2>Carbon emissions calculator</h2>
        <p>Estimate the footprint of transport and accommodation in one trip.</p>
      </div>
      <div className="rt-carbon-icon"><Calculator size={20}/></div>
    </div>
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

function CarbonQuickAccess() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const section = document.getElementById("carbon-estimator");
    if (!section || !("IntersectionObserver" in window)) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0.12 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  if (!visible) return null;
  return (
    <a
      className="rt-carbon-quick-access"
      href="#carbon-estimator"
      aria-label="Jump to the trip carbon calculator"
      onClick={(event) => {
        event.preventDefault();
        document.getElementById("carbon-estimator")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      <span className="rt-carbon-quick-icon"><Calculator size={17} /></span>
      <span className="rt-carbon-quick-copy"><strong>Plan a lighter trip</strong><small>Estimate your carbon footprint</small></span>
      <ArrowDownRight size={16} className="rt-carbon-quick-arrow" />
    </a>
  );
}

export default function ResponsibleTravelPage() {
  const staysApi = useApi("/responsible/partners");
  const stays = staysApi.data?.items || [];
  const [query, setQuery] = useState("");
  const [destination, setDestination] = useState("all");
  const [kind, setKind] = useState("all");

  const filtered = useMemo(() => stays.filter((stay) => {
    const matchesDestination = destination === "all" || stay.destination === destination;
    const matchesKind = kind === "all" || stay.kind === kind;
    const text = `${stay.name} ${stay.destination_name} ${stay.locality || ""} ${stay.kind_label}`.toLowerCase();
    const matchesQuery = !query.trim() || query.toLowerCase().split(/\s+/).every((word) => text.includes(word));
    return matchesDestination && matchesKind && matchesQuery;
  }), [stays, destination, kind, query]);

  const kinds = useMemo(() => [...new Map(stays.map((stay) => [stay.kind, stay.kind_label])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [stays]);

  return (
    <div className="rt-page">
      <div className="rt-page-topline"><span>WAYFARE / DISCOVER</span><span>CURATED FOR THE CURIOUS <Sparkles size={12} /></span></div>
      <PageHeader
        eyebrow="STAYS WITH A SENSE OF PLACE"
        title="The art of staying well."
        description="Find a beautiful base for the places you want to experience. Browse characterful stays, then shape the journey around them."
      />
      <section className="rt-editorial-hero">
        <div className="rt-editorial-copy">
          <span className="rt-hero-number">01 / FIND YOUR PLACE</span>
          <h2>A place to stay.<br /><em>A journey to remember.</em></h2>
          <p>Discover distinctive stays, beautiful hideaways and character-filled spaces that make every destination worth exploring.</p>
          <a href="#stays" className="rt-hero-link">EXPLORE THE COLLECTION <ArrowDownRight size={15} /></a>
        </div>
        <div className="rt-editorial-image">
          <img src="https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1800&q=90" alt="A serene tropical villa surrounded by lush green landscape" />
          <div className="rt-editorial-image-caption"><span>THE WAYFARE EDIT</span><span>PLACES TO PAUSE, MOMENTS TO KEEP</span></div>
        </div>
        <div className="rt-hero-vertical">A MORE CONSIDERED WAY TO WANDER</div>
      </section>

      <section className="rt-stays-section" id="stays">
        <div className="rt-section-heading">
          <div><p className="rt-eyebrow"><span /> THE STAY COLLECTION</p><h2>Find your <em>somewhere.</em></h2></div>
          <p className="rt-section-aside">A considered collection of places to stay, selected to inspire the shape of your next journey.</p>
        </div>
        <div className="rt-filter-bar">
          <label className="rt-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stays, places, neighbourhoods…" /></label>
          <label className="rt-select-wrap"><MapPin size={14} /><select value={destination} onChange={(e) => setDestination(e.target.value)}><option value="all">All destinations</option>{destinations.map((d) => <option key={d.slug} value={d.slug}>{d.cardTitle}</option>)}</select><ChevronDown size={14} /></label>
          <label className="rt-select-wrap"><BedDouble size={14} /><select value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All stay styles</option>{kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={14} /></label>
          <span className="rt-result-count">{filtered.length} STAYS</span>
        </div>
        <ApiState api={staysApi} label="the stay collection" />
                {staysApi.data && filtered.length > 0 && <div className="rt-stay-grid">{filtered.map((stay, index) => <StayCard key={stay.id} stay={stay} index={index} />)}</div>}
        {staysApi.data && filtered.length === 0 && <div className="rt-empty"><Compass size={24} /><h3>No stays found just yet.</h3><p>Try another destination or clear your search.</p><button type="button" onClick={() => { setQuery(""); setDestination("all"); setKind("all"); }}>Clear filters</button></div>}
        <div className="rt-collection-end"><span>END OF THE COLLECTION</span><span>MORE PLACES, MORE STORIES <ArrowRight size={13} /></span></div>
      </section>

      <CarbonCalculator />

      <section className="rt-closing-note">
        <span className="rt-eyebrow"><span /> TRAVEL, THOUGHTFULLY</span>
        <p>Not every journey needs to be hurried. Sometimes the best part is choosing a place, arriving slowly, and letting the destination meet you there.</p>
        <span className="rt-closing-mark">W.</span>
      </section>
      <CarbonQuickAccess />
    </div>
  );
}
