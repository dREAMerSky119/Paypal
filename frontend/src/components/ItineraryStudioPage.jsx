import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, MapPin, Printer, Users, Plane, Hotel, Sparkles, Compass } from "lucide-react";
import { destinations } from "../data/destinations.js";
import { useAuth } from "../context/AuthContext.jsx";
import { PageHeader, Button } from "./ui.jsx";
import "./package-builder.css";

const DRAFT_KEY = "wayfare.package-builder.draft.v1";
function loadDraft() { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null; } catch { return null; } }
function photoUrl(photoId, width = 1200) {
  if (!photoId) return "";
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=85`;
}
function formatDay(start, day) {
  if (!start) return `Day ${day}`;
  const date = new Date(`${start}T12:00:00`);
  date.setDate(date.getDate() + day - 1);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
export default function ItineraryStudioPage() {
  const [params] = useSearchParams();
  const { email, profile, fullName } = useAuth();
  const [draft] = useState(loadDraft);
  const agencyStorageKey = `wayfare.agency.name.v1:${email || "guest"}`;
  const profileBrand = profile?.agencyType === "organisation" ? profile.organisationName : fullName;
  const defaultAgency = profileBrand?.trim() || "Your agency";
  const [agency, setAgency] = useState(() => localStorage.getItem(agencyStorageKey) || defaultAgency);
  const [accent, setAccent] = useState(() => localStorage.getItem("wayfare.agency.accent") || "#29465a");
  const destination = useMemo(() => destinations.find(d => d.slug === draft?.destination), [draft]);
  const hasDraft = params.get("draft") === "local" && draft;
  const highlights = destination?.attractions?.slice(0, 3) || [];
  const saveBrand = () => localStorage.setItem(agencyStorageKey, agency.trim() || defaultAgency);
  const printDocument = () => { saveBrand(); window.print(); };

  return <div className="itinerary-page" style={{ "--itinerary-accent": accent }}>
    <PageHeader eyebrow="THE CUSTOMER VIEW" title={<>Itinerary studio<span className="title-period">.</span></>} description="A calm, considered presentation of the journey your travellers are about to take." action={<Button to="/app/packages" variant="outline"><ArrowLeft size={15}/> Back to package builder</Button>}/>
    <div className="pb-toolbar"><div><span className="pb-status-dot"/><span>PREVIEW MODE</span><small>Customer-ready design · supplier costs stay private</small></div><button className="pb-button pb-button-primary" onClick={printDocument}><Printer size={15}/> Print / Save PDF</button></div>
    {!hasDraft ? <div className="pb-empty-studio"><div><Sparkles size={24}/><h2>Your next journey starts here</h2><p>Create a package first. Your itinerary will appear here as a customer-ready document.</p><Button to="/app/packages">Create a package <ArrowLeft size={15}/></Button></div></div> :
      <div className="itinerary-workspace">
        <aside className="itinerary-brand-editor"><p className="eyebrow">YOUR AGENCY IDENTITY</p><label className="pb-field">Agency name<input value={agency} onChange={e => setAgency(e.target.value)} onBlur={saveBrand}/></label><label className="pb-field">Accent colour<input type="color" value={accent} onChange={e => { setAccent(e.target.value); localStorage.setItem("wayfare.agency.accent", e.target.value); }}/></label><p className="pb-muted">Your brand settings are saved in this browser and appear on the printed itinerary.</p><div className="pb-brand-preview" style={{ background: accent }}><span>YOUR JOURNEY,</span><strong>beautifully arranged.</strong></div></aside>
        <article className="itinerary-paper">
          <header className="itinerary-cover">
            {destination?.heroImage && <div className="itinerary-hero-image"><img src={photoUrl(destination.heroImage, 1800)} alt={`${destination.name} landscape`} /><div className="itinerary-hero-shade"/></div>}
            <div className="itinerary-cover-content"><div className="itinerary-brand" style={{ color: accent }}>{agency || "Your agency"}<span> JOURNEYS, THOUGHTFULLY MADE</span></div><p className="eyebrow">A JOURNEY DESIGNED FOR YOU</p><h2>{draft.title || `A journey through ${destination?.name || "somewhere wonderful"}`}</h2><p className="itinerary-place"><MapPin size={15}/>{destination?.name || "Destination to be confirmed"}{destination?.country ? `, ${destination.country}` : ""}</p><div className="itinerary-meta"><span><CalendarDays size={15}/>{draft.start_date || "Dates to be confirmed"} · {draft.nights} nights</span><span><Users size={15}/>{draft.travellers} travellers</span></div></div>
          </header>
          <section className="itinerary-intro"><p className="eyebrow">THE JOURNEY AT A GLANCE</p><p>{destination?.editorial || destination?.introduction || "Time to discover at an easy pace, with thoughtful places to stay and memorable experiences along the way."}</p></section>
          {highlights.length > 0 && <section className="itinerary-section itinerary-highlights"><div className="itinerary-section-heading"><div><p className="eyebrow">A FEW PLACES TO LOOK FORWARD TO</p><h3><Compass size={17}/> Destination highlights</h3></div></div><div className="itinerary-photo-grid">{highlights.map((spot, i) => <figure className={`itinerary-photo-card itinerary-photo-${i + 1}`} key={spot.name}><img src={photoUrl(spot.image, 700)} alt={spot.name} loading="eager"/><figcaption><strong>{spot.name}</strong><span>{spot.category || destination.name}</span></figcaption></figure>)}</div></section>}
          <section className="itinerary-section"><h3><Hotel size={17}/> Where you'll stay</h3>{draft.stays?.length ? draft.stays.map((stay, i) => <div className="itinerary-row" key={`${stay.item_id}-${i}`}><strong>{stay.name}</strong><span>{stay.nights || draft.nights} nights</span></div>) : <p className="pb-muted">Accommodation details will be added soon.</p>}</section>
          <section className="itinerary-section"><h3><CalendarDays size={17}/> Your days</h3>{(draft.days || []).map(day => <div className="itinerary-day" key={day.day}><div className="itinerary-day-number">DAY {String(day.day).padStart(2, "0")}</div><div><h4>{formatDay(draft.start_date, day.day)}</h4>{day.stops?.length ? day.stops.map((stop, i) => <div className="itinerary-stop" key={`${stop.item_id}-${i}`}><span/>{stop.name}</div>) : <p className="pb-muted">Time to explore at your own pace.</p>}</div></div>)}</section>
          <section className="itinerary-section"><h3><Plane size={17}/> Getting there</h3><div className="itinerary-transfer"><span className="itinerary-transfer-icon"><Plane size={15}/></span><div><small>ARRIVAL · AIRPORT TO STAY</small><strong>{draft.transfers?.arrival_name || "Transfer to be confirmed"}</strong></div></div><div className="itinerary-transfer"><span className="itinerary-transfer-icon itinerary-transfer-return"><Plane size={15}/></span><div><small>DEPARTURE · STAY TO AIRPORT</small><strong>{draft.transfers?.departure_name || "Transfer to be confirmed"}</strong></div></div></section>
          <footer className="itinerary-footer"><div className="itinerary-footer-rule"/><strong>{agency}</strong><p>We look forward to welcoming you on this journey.</p><small>Prepared with care · Final itinerary and selling price will be confirmed by your travel designer.</small></footer>
        </article>
      </div>}
  </div>;
}
