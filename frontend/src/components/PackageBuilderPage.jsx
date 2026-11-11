import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, Check, CircleAlert, ClipboardList, Hotel, MapPin, Plus, Save, Search, Sparkles, Trash2, Users, WalletCards, Plane, RotateCcw } from "lucide-react";
import { api } from "../lib/api.js";
import { destinations } from "../data/destinations.js";
import { PageHeader, Button } from "./ui.jsx";
import "./package-builder.css";

const DRAFT_KEY = "wayfare.package-builder.draft.v1";
const STEPS = ["Trip", "Stay", "Days", "Transfers", "Review"];
const makeDays = (nights) => Array.from({ length: Math.max(1, Math.min(22, Number(nights) + 1 || 1)) }, (_, i) => ({ day: i + 1, stops: [] }));
const emptyDraft = () => ({ title: "", destination: destinations[0]?.slug || "", start_date: "", nights: 4, travellers: 2, stays: [], days: makeDays(4), transfers: { arrival: "", departure: "", arrival_name: "", departure_name: "" } });
const readDraft = () => {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (!value || typeof value !== "object") return emptyDraft();
    const draft = { ...emptyDraft(), ...value };
    draft.stays = Array.isArray(draft.stays) ? draft.stays : [];
    draft.transfers = { ...emptyDraft().transfers, ...(draft.transfers || {}) };
    const savedDays = Array.isArray(draft.days) ? draft.days : [];
    const savedByDay = new Map(savedDays.map(day => [Number(day.day), day]));
    draft.days = makeDays(draft.nights).map(day => ({ ...day, stops: Array.isArray(savedByDay.get(day.day)?.stops) ? savedByDay.get(day.day).stops : [] }));
    return draft;
  } catch { return emptyDraft(); }
};
const labelFor = (item) => item?.name || item?.title || item?.id || "Inventory item";

export default function PackageBuilderPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(readDraft);
  const [step, setStep] = useState(0);
  const [inventory, setInventory] = useState([]);
  const [inventoryState, setInventoryState] = useState("loading");
  const [search, setSearch] = useState("");
  const [activeDay, setActiveDay] = useState(1);
  const [savedAt, setSavedAt] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setInventoryState("loading");
    api(`/inventory?destination=${encodeURIComponent(draft.destination)}&page_size=100&sort=name`, { signal: controller.signal })
      .then(data => { setInventory(data.items || []); setInventoryState("ready"); })
      .catch(error => { if (error.name !== "AbortError") setInventoryState("error"); });
    return () => controller.abort();
  }, [draft.destination]);

  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setSavedAt(new Date());
  }, [draft]);

  const destination = destinations.find(d => d.slug === draft.destination);
  const stays = useMemo(() => inventory.filter(i => i.type === "stay" && matchesSearch(i, search)), [inventory, search]);
  const experiences = useMemo(() => inventory.filter(i => ["experience", "guide"].includes(i.type) && matchesSearch(i, search)), [inventory, search]);
  const transports = useMemo(() => inventory.filter(i => i.type === "transport" && matchesSearch(i, search)), [inventory, search]);

  const update = (key, value) => setDraft(current => ({ ...current, [key]: value }));
  const startNewPackage = () => {
    const fresh = emptyDraft();
    setDraft(fresh);
    setStep(0);
    setSearch("");
    setActiveDay(1);
    setNotice("Started a fresh package. Previous package selections have been cleared.");
    localStorage.setItem(DRAFT_KEY, JSON.stringify(fresh));
  };
  const changeDestination = (slug) => {
    setDraft(current => ({ ...current, destination: slug, stays: [], days: makeDays(current.nights), transfers: emptyDraft().transfers }));
    setSearch("");
    setActiveDay(1);
  };
  const changeNights = (value) => {
    const nights = Math.max(1, Math.min(21, Number(value) || 1));
    setDraft(current => {
      const next = makeDays(nights);
      const previous = new Map((current.days || []).map(day => [day.day, day]));
      return { ...current, nights, days: next.map(day => ({ ...day, stops: previous.get(day.day)?.stops || [] })) };
    });
    setActiveDay(current => Math.min(current, nights + 1));
  };
  const addStay = item => {
    setDraft(current => {
      if (current.stays.some(stay => stay.item_id === item.id)) return current;
      return { ...current, stays: [...current.stays, { item_id: item.id, name: item.name, nights: Number(current.nights) || 1 }] };
    });
  };
  const addStop = item => {
    setDraft(current => ({
      ...current,
      days: current.days.map(day => day.day === activeDay
        ? { ...day, stops: [...day.stops, { kind: "item", item_id: item.id, name: item.name, slot: day.stops.length < 2 ? (day.stops.length === 0 ? "morning" : "afternoon") : "evening", type: item.type }] }
        : day)
    }));
  };
  const removeStop = (dayNo, stopIndex) => setDraft(current => ({
    ...current, days: current.days.map(day => day.day === dayNo ? { ...day, stops: day.stops.filter((_, index) => index !== stopIndex) } : day)
  }));
  const setTransfer = (leg, itemId) => {
    const item = inventory.find(i => i.id === itemId);
    setDraft(current => ({ ...current, transfers: { ...current.transfers, [leg]: itemId, [`${leg}_name`]: item?.name || "" } }));
  };
  const saveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    setNotice("Draft saved in this browser. Server-side saving will be enabled when package APIs are connected.");
  };
  const goStudio = () => { saveDraft(); navigate("/app/itinerary-studio?draft=local"); };
  const tripReady = Boolean(draft.destination && draft.start_date && Number(draft.nights) > 0 && Number(draft.travellers) > 0);

  const moveStep = next => { setStep(next); setSearch(""); };
  return <div className="package-page">
    <PageHeader eyebrow="DESIGN A JOURNEY" title={<>Package builder<span className="title-period">.</span></>} description="Bring the right stays, experiences and transfers together into one considered offer." action={<div className="pb-header-actions"><button className="pb-button pb-button-quiet" onClick={startNewPackage}><RotateCcw size={14}/> New package</button><Button to="/app/itinerary-studio?draft=local" variant="outline"><ArrowRight size={15}/> Preview itinerary</Button></div>}/>
    <div className="pb-toolbar"><div><span className="pb-status-dot"/><span>LOCAL DRAFT</span><small>{savedAt ? `Autosaved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Autosave enabled"}</small></div><button className="pb-button pb-button-quiet" onClick={saveDraft}><Save size={15}/> Save draft</button></div>
    {notice && <p className="pb-notice" role="status">{notice}</p>}
    <nav className="pb-steps" aria-label="Package builder steps">{STEPS.map((name, i) => <button key={name} className={`pb-step ${step === i ? "is-current" : step > i ? "is-done" : ""}`} onClick={() => moveStep(i)}><span>{step > i ? <Check size={14}/> : `0${i + 1}`}</span>{name}</button>)}</nav>
    <div className="pb-layout">
      <section className="pb-main">
        {step === 0 && <div className="pb-panel"><div className="pb-panel-heading"><div><p className="eyebrow">01 / THE FOUNDATIONS</p><h2>Tell us about the trip</h2><p>Start with the destination and the shape of the journey.</p></div><MapPin size={22}/></div>
          <label className="pb-field">Package name<input value={draft.title} onChange={e => update("title", e.target.value)} placeholder="e.g. A slower week in Kyoto"/></label>
          <label className="pb-field">Destination<select value={draft.destination} onChange={e => changeDestination(e.target.value)}>{destinations.map(d => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select></label>
          <div className="pb-field-grid"><label className="pb-field">Departure date<input type="date" value={draft.start_date} onChange={e => update("start_date", e.target.value)}/></label><label className="pb-field">Number of nights<input type="number" min="1" max="21" value={draft.nights} onChange={e => changeNights(e.target.value)}/></label></div>
          <label className="pb-field">Travellers<input type="number" min="1" max="40" value={draft.travellers} onChange={e => update("travellers", e.target.value)}/></label>
          <div className="pb-inline-note"><CalendarDays size={16}/> Your day plan now creates one card for every trip day, including the departure day.</div>
        </div>}
        {step === 1 && <div className="pb-panel"><div className="pb-panel-heading"><div><p className="eyebrow">02 / WHERE YOU'LL STAY</p><h2>Choose accommodation</h2><p>Browse stays for {destination?.name || "your destination"} and add the best fit.</p></div><Hotel size={22}/></div>
          <InventoryPicker items={stays} state={inventoryState} search={search} setSearch={setSearch} onAdd={addStay} actionLabel="Add stay"/>
          <div className="pb-selected"><div className="pb-selected-heading"><strong>Selected stays</strong><small>{draft.stays.length} selected</small></div>{draft.stays.length === 0 ? <p>No stays added to this package yet.</p> : draft.stays.map((stay, i) => <div className="pb-selected-row" key={`${stay.item_id}-${i}`}><span><Hotel size={15}/>{stay.name}<small>{stay.nights} nights</small></span><button aria-label={`Remove ${stay.name}`} onClick={() => update("stays", draft.stays.filter((_, j) => j !== i))}><Trash2 size={15}/></button></div>)}</div>
        </div>}
        {step === 2 && <div className="pb-panel"><div className="pb-panel-heading"><div><p className="eyebrow">03 / THE DAY-BY-DAY</p><h2>Shape each day</h2><p>Every trip day is listed below. Select a day, then add an experience or guide to that day.</p></div><ClipboardList size={22}/></div>
          <InventoryPicker items={experiences} state={inventoryState} search={search} setSearch={setSearch} onAdd={addStop} actionLabel={`Add to day ${activeDay}`}/>
          <div className="pb-day-selector"><label className="pb-field">Add selected experiences to<select value={activeDay} onChange={e => setActiveDay(Number(e.target.value))}>{draft.days.map(day => <option key={day.day} value={day.day}>Day {day.day}</option>)}</select></label><span>{draft.days.length} trip days generated from {draft.nights} nights</span></div>
          <div className="pb-days">{draft.days.map((day, i) => <article className={`pb-day ${activeDay === day.day ? "pb-day-active" : ""}`} key={day.day}><header><button className="pb-day-heading-button" onClick={() => setActiveDay(day.day)}><span>DAY {String(day.day).padStart(2, "0")}</span><strong>{dayDate(draft.start_date, day.day)}</strong></button><small>{day.stops.length} planned {day.stops.length === 1 ? "stop" : "stops"}</small></header>{day.stops.length === 0 ? <p className="pb-empty-day">A little breathing room. Select this day above and add an experience.</p> : day.stops.map((stop, j) => <div className="pb-stop" key={`${stop.item_id}-${j}`}><span className="pb-stop-marker">{j + 1}</span><div><strong>{stop.name}</strong><small>{stop.type} · {stop.slot}</small></div><button onClick={() => removeStop(day.day, j)} aria-label={`Remove ${stop.name}`}><Trash2 size={14}/></button></div>)}</article>)}</div>
        </div>}
        {step === 3 && <div className="pb-panel"><div className="pb-panel-heading"><div><p className="eyebrow">04 / ARRIVAL & DEPARTURE</p><h2>Make the transitions easy</h2><p>Choose each transfer separately. Your selections are saved against the right leg.</p></div><Plane size={22}/></div>
          <div className="pb-transfer-grid">
            <TransferCard leg="arrival" title="Arrival transfer" subtitle="Airport → first stay" icon="arrival" items={transports} selected={draft.transfers.arrival} onChange={value => setTransfer("arrival", value)}/>
            <TransferCard leg="departure" title="Departure transfer" subtitle="Last stay → airport" icon="departure" items={transports} selected={draft.transfers.departure} onChange={value => setTransfer("departure", value)}/>
          </div>
          <div className="pb-inline-note"><CircleAlert size={16}/> Choose independently: adding an arrival vehicle will not overwrite your departure transfer.</div>
        </div>}
        {step === 4 && <div className="pb-panel"><div className="pb-panel-heading"><div><p className="eyebrow">05 / READY TO REVIEW</p><h2>One journey, thoughtfully put together</h2><p>Review your trip details before moving to the itinerary preview.</p></div><Check size={22}/></div>
          <div className="pb-review"><div><span>DESTINATION</span><strong>{destination?.name || "Not selected"}</strong></div><div><span>DEPARTURE</span><strong>{draft.start_date || "Not selected"}</strong></div><div><span>DURATION</span><strong>{draft.nights} nights · {draft.days.length} days</strong></div><div><span>TRAVELLERS</span><strong>{draft.travellers} people</strong></div><div><span>ACCOMMODATION</span><strong>{draft.stays.length} stay selections</strong></div><div><span>ITINERARY</span><strong>{draft.days.reduce((n, d) => n + d.stops.length, 0)} planned stops</strong></div><div><span>ARRIVAL</span><strong>{draft.transfers.arrival_name || "Not selected"}</strong></div><div><span>DEPARTURE</span><strong>{draft.transfers.departure_name || "Not selected"}</strong></div></div>
          <div className="pb-quote-pending"><WalletCards size={20}/><div><strong>Live package quote is not connected yet</strong><p>The backend quote and package APIs are the next integration phase. We won't display an invented price or margin here.</p></div></div>
          <div className="pb-inline-note"><CircleAlert size={16}/> Agency net cost, fees and margin remain private. The customer itinerary will show only the selling price once pricing is connected.</div>
        </div>}
        <div className="pb-step-actions"><button className="pb-button pb-button-quiet" disabled={step === 0} onClick={() => moveStep(step - 1)}><ArrowLeft size={15}/> Previous</button><button className="pb-button pb-button-primary" onClick={() => step === 4 ? goStudio() : moveStep(Math.min(4, step + 1))} disabled={step === 0 && !tripReady}>{step === 4 ? "Open itinerary preview" : "Continue"} <ArrowRight size={15}/></button></div>
      </section>
      <aside className="pb-aside"><div className="pb-aside-card"><p className="eyebrow">YOUR PACKAGE</p><h3>{draft.title || "Untitled journey"}</h3><p className="pb-aside-destination"><MapPin size={14}/>{destination?.name || "Choose a destination"}</p><div className="pb-aside-facts"><span><CalendarDays size={14}/>{draft.nights || 0} nights</span><span><Users size={14}/>{draft.travellers || 0} travellers</span></div><div className="pb-aside-progress">{STEPS.map((s, i) => <span key={s} className={i <= step ? "active" : ""}/>)}</div><small>Step {step + 1} of 5 · {STEPS[step]}</small><button className="pb-aside-link" onClick={goStudio}>Preview customer itinerary <ArrowRight size={14}/></button></div><div className="pb-aside-note"><Sparkles size={16}/><p><strong>Thoughtful by design</strong><br/>Every day has its own space. Add activities to the selected day rather than stacking everything into one.</p></div></aside>
    </div>
  </div>;
}

function matchesSearch(item, search) {
  return !search || `${item.name || ""} ${item.supplier_name || ""} ${item.type || ""}`.toLowerCase().includes(search.toLowerCase());
}
function dayDate(start, day) {
  if (!start) return day === 1 ? "Departure day" : "Day date will appear here";
  const date = new Date(`${start}T12:00:00`);
  date.setDate(date.getDate() + day - 1);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}
function InventoryPicker({ items, state, search, setSearch, onAdd, actionLabel }) {
  return <div className="pb-picker"><label className="pb-search"><Search size={15}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search suppliers and experiences"/></label>
    {state === "loading" ? <p className="pb-picker-state">Loading supplier inventory…</p> : state === "error" ? <p className="pb-picker-state">Could not load inventory. Check that the backend is running.</p> : items.length === 0 ? <p className="pb-picker-state">No matching inventory for this destination.</p> : <div className="pb-picker-list">{items.slice(0, 12).map(item => <div className="pb-picker-item" key={item.id}><div><strong>{labelFor(item)}</strong><small>{item.supplier_name} · {item.type} · {item.unit?.replaceAll("_", " ")}</small></div><button onClick={() => onAdd(item)} aria-label={`Add ${item.name}`} title={actionLabel}><Plus size={15}/></button></div>)}</div>}
  </div>;
}
function TransferCard({ title, subtitle, items, selected, onChange, leg }) {
  const chosen = items.find(item => item.id === selected);
  return <section className="pb-transfer-card"><div className="pb-transfer-icon"><Plane size={18}/></div><div className="pb-transfer-copy"><span>{leg === "arrival" ? "INBOUND JOURNEY" : "OUTBOUND JOURNEY"}</span><h3>{title}</h3><p>{subtitle}</p></div><label className="pb-field">{title}<select value={selected || ""} onChange={e => onChange(e.target.value)}><option value="">Choose a transport option</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{chosen ? <div className="pb-transfer-selected"><Check size={14}/><span>{chosen.name}</span><button onClick={() => onChange("")}>Clear</button></div> : <p className="pb-transfer-hint">No transfer selected yet</p>}</section>;
}
