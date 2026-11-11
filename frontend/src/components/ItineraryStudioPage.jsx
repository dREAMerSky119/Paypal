import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, MapPin, Printer, Users, Plane, Hotel, Sparkles } from "lucide-react";
import { destinations } from "../data/destinations.js";
import { PageHeader, Button } from "./ui.jsx";
import "./package-builder.css";

const DRAFT_KEY="wayfare.package-builder.draft.v1";
function loadDraft(){try{return JSON.parse(localStorage.getItem(DRAFT_KEY))||null;}catch{return null;}}
export default function ItineraryStudioPage(){
 const [params]=useSearchParams(); const [draft]=useState(loadDraft); const [agency,setAgency]=useState(()=>localStorage.getItem("wayfare.agency.name")||"Northstar Travel"); const [accent,setAccent]=useState(()=>localStorage.getItem("wayfare.agency.accent")||"#29465a");
 const destination=useMemo(()=>destinations.find(d=>d.slug===draft?.destination),[draft]);
 const hasDraft=params.get("draft")==="local"&&draft;
 const saveBrand=()=>{localStorage.setItem("wayfare.agency.name",agency);localStorage.setItem("wayfare.agency.accent",accent);};
 return <div className="itinerary-page" style={{"--itinerary-accent":accent}}>
  <PageHeader eyebrow="THE CUSTOMER VIEW" title={<>Itinerary studio<span className="title-period">.</span></>} description="A calm, considered presentation of the journey your travellers are about to take." action={<Button to="/app/packages" variant="outline"><ArrowLeft size={15}/> Back to package builder</Button>}/>
  <div className="pb-toolbar"><div><span className="pb-status-dot"/><span>PREVIEW MODE</span><small>Customer-safe layout · no supplier costs shown</small></div><button className="pb-button pb-button-primary" onClick={()=>window.print()}><Printer size={15}/> Print / Save PDF</button></div>
  {!hasDraft?<div className="pb-empty-studio"><div><Sparkles size={24}/><h2>Your next journey starts here</h2><p>Create a package first. Your itinerary will appear here as a customer-ready document.</p><Button to="/app/packages">Create a package <ArrowLeft size={15}/></Button></div></div>:
  <div className="itinerary-workspace"><aside className="itinerary-brand-editor"><p className="eyebrow">YOUR AGENCY IDENTITY</p><label className="pb-field">Agency name<input value={agency} onChange={e=>setAgency(e.target.value)} onBlur={saveBrand}/></label><label className="pb-field">Accent colour<input type="color" value={accent} onChange={e=>{setAccent(e.target.value);localStorage.setItem("wayfare.agency.accent",e.target.value);}}/></label><p className="pb-muted">Brand settings are stored in this browser for preview purposes.</p></aside>
   <article className="itinerary-paper"><header className="itinerary-cover"><div className="itinerary-brand" style={{color:accent}}>{agency||"Your agency"}<span> JOURNEYS, THOUGHTFULLY MADE</span></div><p className="eyebrow">A JOURNEY DESIGNED FOR YOU</p><h2>{draft.title||`A journey through ${destination?.name||"somewhere wonderful"}`}</h2><p className="itinerary-place"><MapPin size={15}/>{destination?.name||"Destination to be confirmed"}</p><div className="itinerary-meta"><span><CalendarDays size={15}/>{draft.start_date||"Dates to be confirmed"} · {draft.nights} nights</span><span><Users size={15}/>{draft.travellers} travellers</span></div></header>
    <section className="itinerary-intro"><p className="eyebrow">THE JOURNEY AT A GLANCE</p><p>Time to discover at an easy pace, with thoughtful places to stay and memorable experiences along the way.</p></section>
    <section className="itinerary-section"><h3><Hotel size={17}/> Where you'll stay</h3>{draft.stays?.length?draft.stays.map((stay,i)=><div className="itinerary-row" key={`${stay.item_id}-${i}`}><strong>{stay.name}</strong><span>{stay.nights||draft.nights} nights</span></div>):<p className="pb-muted">Accommodation details will be added soon.</p>}</section>
    <section className="itinerary-section"><h3><CalendarDays size={17}/> Your days</h3>{(draft.days||[]).map(day=><div className="itinerary-day" key={day.day}><div className="itinerary-day-number">DAY {String(day.day).padStart(2,"0")}</div><div><h4>{draft.start_date?new Date(new Date(`${draft.start_date}T12:00:00`).getTime()+(day.day-1)*86400000).toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}):"A day to discover"}</h4>{day.stops?.length?day.stops.map((stop,i)=><div className="itinerary-stop" key={`${stop.item_id}-${i}`}><span/>{stop.name}</div>):<p className="pb-muted">Time to explore at your own pace.</p>}</div></div>)}</section>
    <section className="itinerary-section"><h3><Plane size={17}/> Getting there</h3><div className="itinerary-row"><strong>Arrival transfer</strong><span>{draft.transfers?.arrival_name||"To be confirmed"}</span></div><div className="itinerary-row"><strong>Departure transfer</strong><span>{draft.transfers?.departure_name||"To be confirmed"}</span></div></section>
    <footer className="itinerary-footer"><strong>{agency}</strong><p>We look forward to welcoming you on this journey.</p><small>Preview only · Final itinerary and selling price will be available once package services are connected.</small></footer>
   </article>
  </div>}
 </div>;
}
