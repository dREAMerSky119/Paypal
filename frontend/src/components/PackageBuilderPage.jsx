import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, CircleAlert, ClipboardList, Hotel, MapPin, Plus, Printer, Save, Search, Sparkles, Trash2, Users, WalletCards } from "lucide-react";
import { api } from "../lib/api.js";
import { destinations } from "../data/destinations.js";
import { PageHeader, Button } from "./ui.jsx";
import "./package-builder.css";

const DRAFT_KEY = "wayfare.package-builder.draft.v1";
const STEPS = ["Trip", "Stay", "Days", "Transfers", "Review"];
const emptyDraft = () => ({ title:"", destination:destinations[0]?.slug || "", start_date:"", nights:4, travellers:2, stays:[], days:[{ day:1, stops:[] }], transfers:{ arrival:"", departure:"" } });
const readDraft = () => { try { const value=JSON.parse(localStorage.getItem(DRAFT_KEY)); return value && typeof value==="object" ? {...emptyDraft(),...value} : emptyDraft(); } catch { return emptyDraft(); } };
const labelFor = (item) => item?.name || item?.title || item?.id || "Inventory item";

export default function PackageBuilderPage() {
  const navigate=useNavigate();
  const [draft,setDraft]=useState(readDraft);
  const [step,setStep]=useState(0);
  const [inventory,setInventory]=useState([]);
  const [inventoryState,setInventoryState]=useState("loading");
  const [search,setSearch]=useState("");
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState("Your changes are saved in this browser as a local draft.");
  const [savedAt,setSavedAt]=useState(null);

  useEffect(()=>{ let active=true; api("/inventory?page_size=100&sort=name").then(data=>{if(active){setInventory(data.items||[]);setInventoryState("ready");}}).catch(()=>{if(active)setInventoryState("error");}); return()=>{active=false;}; },[]);
  useEffect(()=>{ localStorage.setItem(DRAFT_KEY,JSON.stringify(draft)); setSavedAt(new Date()); },[draft]);
  const destination=destinations.find(d=>d.slug===draft.destination);
  const filteredInventory=useMemo(()=>inventory.filter(item=>{
    const matchesDestination=!draft.destination || item.destination===draft.destination;
    const matchesSearch=!search || `${item.name} ${item.supplier_name} ${item.type}`.toLowerCase().includes(search.toLowerCase());
    return matchesDestination && matchesSearch;
  }),[inventory,draft.destination,search]);
  const update=(key,value)=>setDraft(current=>({...current,[key]:value}));
  const addStop=(item)=>{const day=Math.max(1,Number(draft.days.at(-1)?.day)||1);setDraft(current=>({...current,days:current.days.map(d=>d.day===day?{...d,stops:[...d.stops,{kind:"item",item_id:item.id,name:item.name,slot:"morning",type:item.type}]}:d)}));};
  const addDay=()=>setDraft(current=>({...current,days:[...current.days,{day:current.days.length+1,stops:[]}]}));
  const removeStop=(dayIndex,stopIndex)=>setDraft(current=>({...current,days:current.days.map((day,i)=>i===dayIndex?{...day,stops:day.stops.filter((_,j)=>j!==stopIndex)}:day)}));
  const saveDraft=()=>{localStorage.setItem(DRAFT_KEY,JSON.stringify(draft));setNotice("Draft saved in this browser. Server-side saving will be enabled when the package API is connected.");};
  const goStudio=()=>{saveDraft();navigate("/app/itinerary-studio?draft=local");};
  const tripReady=Boolean(draft.destination && draft.start_date && Number(draft.nights)>0 && Number(draft.travellers)>0);
  return <div className="package-page">
    <PageHeader eyebrow="DESIGN A JOURNEY" title={<>Package builder<span className="title-period">.</span></>} description="Bring the right stays, experiences and transfers together into one considered offer." action={<Button to="/app/itinerary-studio?draft=local" variant="outline"><ArrowRight size={15}/> Preview itinerary</Button>}/>
    <div className="pb-toolbar"><div><span className="pb-status-dot"/><span>LOCAL DRAFT</span><small>{savedAt?`Autosaved ${savedAt.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`:"Autosave enabled"}</small></div><button className="pb-button pb-button-quiet" onClick={saveDraft}><Save size={15}/> Save draft</button></div>
    <nav className="pb-steps" aria-label="Package builder steps">{STEPS.map((name,i)=><button key={name} className={`pb-step ${step===i?"is-current":step>i?"is-done":""}`} onClick={()=>setStep(i)}><span>{step>i?<Check size={14}/>:`0${i+1}`}</span>{name}</button>)}</nav>
    <div className="pb-layout">
      <section className="pb-main">
        {step===0 && <div className="pb-panel"><div className="pb-panel-heading"><div><p className="eyebrow">01 / THE FOUNDATIONS</p><h2>Tell us about the trip</h2><p>Start with the destination and the shape of the journey.</p></div><MapPin size={22}/></div>
          <label className="pb-field">Package name<input value={draft.title} onChange={e=>update("title",e.target.value)} placeholder="e.g. A slower week in Kyoto"/></label>
          <label className="pb-field">Destination<select value={draft.destination} onChange={e=>update("destination",e.target.value)}>{destinations.map(d=><option key={d.slug} value={d.slug}>{d.name}</option>)}</select></label>
          <div className="pb-field-grid"><label className="pb-field">Departure date<input type="date" value={draft.start_date} onChange={e=>update("start_date",e.target.value)}/></label><label className="pb-field">Number of nights<input type="number" min="1" max="21" value={draft.nights} onChange={e=>update("nights",e.target.value)}/></label></div>
          <label className="pb-field">Travellers<input type="number" min="1" max="40" value={draft.travellers} onChange={e=>update("travellers",e.target.value)}/></label>
          <div className="pb-inline-note"><CalendarDays size={16}/> Dates are used to select the relevant monthly supplier rates when the quote service is connected.</div>
        </div>}
        {step===1 && <div className="pb-panel"><div className="pb-panel-heading"><div><p className="eyebrow">02 / WHERE YOU'LL STAY</p><h2>Choose accommodation</h2><p>Browse stays for {destination?.name||"your destination"} and add the best fit.</p></div><Hotel size={22}/></div><InventoryPicker items={filteredInventory.filter(i=>i.type==="stay")} state={inventoryState} search={search} setSearch={setSearch} onAdd={item=>update("stays",[...draft.stays,{item_id:item.id,name:item.name,nights:Number(draft.nights)||1}])}/><div className="pb-selected">{draft.stays.length===0?<p>No stays added yet.</p>:draft.stays.map((stay,i)=><div className="pb-selected-row" key={`${stay.item_id}-${i}`}><span><Hotel size={15}/>{stay.name}<small>{stay.nights} nights</small></span><button aria-label={`Remove ${stay.name}`} onClick={()=>update("stays",draft.stays.filter((_,j)=>j!==i))}><Trash2 size={15}/></button></div>)}</div></div>}
        {step===2 && <div className="pb-panel"><div className="pb-panel-heading"><div><p className="eyebrow">03 / THE DAY-BY-DAY</p><h2>Shape each day</h2><p>Add experiences and guides from your supplier inventory. Unpriced destination spots can be added in a later iteration.</p></div><ClipboardList size={22}/></div>
          <InventoryPicker items={filteredInventory.filter(i=>["experience","guide"].includes(i.type))} state={inventoryState} search={search} setSearch={setSearch} onAdd={addStop}/>
          <div className="pb-days">{draft.days.map((day,i)=><article className="pb-day" key={day.day}><header><div><span>DAY {String(day.day).padStart(2,"0")}</span><strong>{draft.start_date?new Date(`${draft.start_date}T12:00:00`).toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"}):"Add a departure date"}</strong></div><small>{day.stops.length} planned {day.stops.length===1?"stop":"stops"}</small></header>{day.stops.length===0?<p className="pb-empty-day">A little breathing room. Add an experience from the inventory above.</p>:day.stops.map((stop,j)=><div className="pb-stop" key={`${stop.item_id}-${j}`}><span className="pb-stop-marker">{j+1}</span><div><strong>{stop.name}</strong><small>{stop.type} · {stop.slot}</small></div><button onClick={()=>removeStop(i,j)} aria-label={`Remove ${stop.name}`}><Trash2 size={14}/></button></div>)}</article>)}</div><button className="pb-add-day" onClick={addDay}><Plus size={15}/> Add another day</button>
        </div>}
        {step===3 && <div className="pb-panel"><div className="pb-panel-heading"><div><p className="eyebrow">04 / ARRIVAL & DEPARTURE</p><h2>Make the transitions easy</h2><p>Choose transfers to and from the airport.</p></div><ArrowRight size={22}/></div><InventoryPicker items={filteredInventory.filter(i=>i.type==="transport")} state={inventoryState} search={search} setSearch={setSearch} onAdd={item=>setDraft(current=>({...current,transfers:{...current.transfers,arrival:item.id,arrival_name:item.name}}))}/><div className="pb-field-grid"><label className="pb-field">Arrival transfer<select value={draft.transfers.arrival} onChange={e=>setDraft(c=>({...c,transfers:{...c.transfers,arrival:e.target.value}}))}><option value="">Not selected</option>{inventory.filter(i=>i.type==="transport"&&i.destination===draft.destination).map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label><label className="pb-field">Departure transfer<select value={draft.transfers.departure} onChange={e=>setDraft(c=>({...c,transfers:{...c.transfers,departure:e.target.value}}))}><option value="">Not selected</option>{inventory.filter(i=>i.type==="transport"&&i.destination===draft.destination).map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label></div><div className="pb-inline-note"><CircleAlert size={16}/> Transfers are optional for this draft. Missing transfers will be flagged by the quote engine when available.</div></div>}
        {step===4 && <div className="pb-panel"><div className="pb-panel-heading"><div><p className="eyebrow">05 / READY TO REVIEW</p><h2>One journey, thoughtfully put together</h2><p>Review your trip details before moving to the itinerary preview.</p></div><Check size={22}/></div><div className="pb-review"><div><span>DESTINATION</span><strong>{destination?.name||"Not selected"}</strong></div><div><span>DEPARTURE</span><strong>{draft.start_date||"Not selected"}</strong></div><div><span>DURATION</span><strong>{draft.nights} nights</strong></div><div><span>TRAVELLERS</span><strong>{draft.travellers} people</strong></div><div><span>ACCOMMODATION</span><strong>{draft.stays.length} stay selections</strong></div><div><span>ITINERARY</span><strong>{draft.days.reduce((n,d)=>n+d.stops.length,0)} planned stops across {draft.days.length} days</strong></div></div><div className="pb-quote-pending"><WalletCards size={20}/><div><strong>Live package quote is not connected yet</strong><p>The backend quote and package APIs are the next integration phase. We won't display an invented price or margin here.</p></div></div><div className="pb-inline-note"><CircleAlert size={16}/> Agency net cost, fees and margin will remain private. The customer itinerary will show only the selling price once pricing is connected.</div></div>}
        <div className="pb-step-actions"><button className="pb-button pb-button-quiet" disabled={step===0} onClick={()=>setStep(s=>s-1)}><ArrowLeft size={15}/> Previous</button><button className="pb-button pb-button-primary" onClick={()=>step===4?goStudio():setStep(s=>Math.min(4,s+1))} disabled={step===0&&!tripReady}>{step===4?"Open itinerary preview":"Continue"} <ArrowRight size={15}/></button></div>
      </section>
      <aside className="pb-aside"><div className="pb-aside-card"><p className="eyebrow">YOUR PACKAGE</p><h3>{draft.title||"Untitled journey"}</h3><p className="pb-aside-destination"><MapPin size={14}/>{destination?.name||"Choose a destination"}</p><div className="pb-aside-facts"><span><CalendarDays size={14}/>{draft.nights||0} nights</span><span><Users size={14}/>{draft.travellers||0} travellers</span></div><div className="pb-aside-progress">{STEPS.map((s,i)=><span key={s} className={i<=step?"active":""}/>)}</div><small>Step {step+1} of 5 · {STEPS[step]}</small><button className="pb-aside-link" onClick={goStudio}>Preview customer itinerary <ArrowRight size={14}/></button></div><div className="pb-aside-note"><Sparkles size={16}/><p><strong>Thoughtful by design</strong><br/>Build the journey first. The quote engine will help validate rates, capacity and margin in the next integration phase.</p></div></aside>
    </div>
  </div>;
}

function InventoryPicker({items,state,search,setSearch,onAdd}) {
  return <div className="pb-picker"><label className="pb-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search suppliers and experiences"/></label>{state==="loading"?<p className="pb-picker-state">Loading supplier inventory…</p>:state==="error"?<p className="pb-picker-state">Could not load inventory. Check that the backend is running.</p>:items.length===0?<p className="pb-picker-state">No matching inventory for this destination.</p>:<div className="pb-picker-list">{items.slice(0,8).map(item=><div className="pb-picker-item" key={item.id}><div><strong>{labelFor(item)}</strong><small>{item.supplier_name} · {item.type} · {item.unit?.replaceAll("_"," ")}</small></div><button onClick={()=>onAdd(item)} aria-label={`Add ${item.name}`}><Plus size={15}/></button></div>)}</div>}</div>;
}
