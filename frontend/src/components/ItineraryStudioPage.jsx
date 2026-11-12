import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Check, Compass, Hotel, Link2, MapPin, Plane, Printer, Sparkles, Trash2, Users, WalletCards } from "lucide-react";
import { api } from "../lib/api.js";
import { useDisplayCurrency } from "../lib/useDisplayCurrency.js";
import { destinations } from "../data/destinations.js";
import { useAuth } from "../context/AuthContext.jsx";
import { PageHeader, Button, Status } from "./ui.jsx";
import ApproveAndPay from "./ApproveAndPay.jsx";
import "./package-builder.css";
import "../advisor.css";

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
  const fx = useDisplayCurrency();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { email, profile, fullName } = useAuth();
  const [draft] = useState(loadDraft);
  // ?package=<id>: the studio shows the customer view of a saved package.
  const [saved, setSaved] = useState(null);
  const [savedState, setSavedState] = useState(params.get("package") ? "loading" : "none"); // loading | ready | error | none
  const [linkCopied, setLinkCopied] = useState(false);
  const [paidBooking, setPaidBooking] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const agencyStorageKey = `wayfare.agency.name.v1:${email || "guest"}`;
  const profileBrand = profile?.agencyType === "organisation" ? profile.organisationName : fullName;
  const defaultAgency = profileBrand?.trim() || "Your agency";
  const [agency, setAgency] = useState(() => localStorage.getItem(agencyStorageKey) || defaultAgency);
  const [accent, setAccent] = useState(() => localStorage.getItem("wayfare.agency.accent") || "#29465a");
  useEffect(() => {
    const packageId = params.get("package");
    if (!packageId) { setSavedState("none"); return undefined; }
    let active = true;
    setSavedState("loading");
    api(`/packages/${encodeURIComponent(packageId)}`)
      .then(data => { if (active) { setSaved(data); setSavedState("ready"); } })
      .catch(() => { if (active) setSavedState("error"); });
    return () => { active = false; };
  }, [params]);

  // A package that already has a paid deposit shows the confirmation instead of the payment buttons.
  useEffect(() => {
    const packageId = params.get("package");
    if (!packageId) { setPaidBooking(null); return undefined; }
    let active = true;
    api(`/payments/packages/${encodeURIComponent(packageId)}/booking`)
      .then(data => { if (active) setPaidBooking(data?.booking || null); })
      .catch(() => {});
    return () => { active = false; };
  }, [params]);
  const deletePackage = async () => {
    if (!saved?.package_id) return;
    if (!window.confirm(`Delete “${saved.title || "this package"}”? This cannot be undone.`)) return;
    setDeleting(true); setDeleteError("");
    try { await api(`/packages/${encodeURIComponent(saved.package_id)}`, { method: "DELETE" }); navigate("/app/packages"); }
    catch (err) { setDeleteError(err.detail || "The package could not be deleted."); setDeleting(false); }
  };

  const hasDraft = params.get("draft") === "local" && draft;
  const source = savedState === "ready" ? saved : hasDraft ? { payload: draft, quote: null, local: true } : null;
  const trip = source?.payload || null;
  const destination = useMemo(() => destinations.find(d => d.slug === trip?.destination), [trip]);
  const shareUrl = () => {
    const url = `${window.location.origin}/app/itinerary-studio?package=${saved.package_id}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2000);
  };
  const highlights = destination?.attractions?.slice(0, 3) || [];
  const saveBrand = () => localStorage.setItem(agencyStorageKey, agency.trim() || defaultAgency);
  const printDocument = () => { saveBrand(); window.print(); };

  return <div className="itinerary-page" style={{ "--itinerary-accent": accent }}>
    <PageHeader eyebrow="THE CUSTOMER VIEW" title={<>Itinerary studio<span className="title-period">.</span></>} description="A calm, considered presentation of the journey your travellers are about to take." action={<Button to="/app/packages" variant="outline"><ArrowLeft size={15}/> Back to package builder</Button>}/>
    <div className="pb-toolbar"><div><span className="pb-status-dot"/><span>PREVIEW MODE</span><small>Customer-ready design · supplier costs stay private</small></div><div style={{ display: "flex", gap: 8 }}>{savedState === "ready" && <button className="pb-button pb-button-quiet" onClick={shareUrl}>{linkCopied ? <><Check size={15}/> Link copied</> : <><Link2 size={15}/> Copy share link</>}</button>}{savedState === "ready" && <button className="pb-button pb-button-danger" onClick={deletePackage} disabled={deleting}><Trash2 size={15}/> {deleting ? "Deleting…" : "Delete package"}</button>}<button className="pb-button pb-button-primary" onClick={printDocument}><Printer size={15}/> Print / Save PDF</button></div></div>
    {savedState === "loading" ? <div className="pb-empty-studio"><div><Sparkles size={24}/><h2>Loading your journey…</h2></div></div> :
    savedState === "error" ? <div className="pb-empty-studio"><div><Sparkles size={24}/><h2>That package could not be opened</h2><p>It may have been deleted, or the server is still waking up. Try again in a moment.</p><Button to="/app/packages">Back to the package builder <ArrowLeft size={15}/></Button></div></div> :
    !source ? <div className="pb-empty-studio"><div><Sparkles size={24}/><h2>Your next journey starts here</h2><p>Create a package first. Your itinerary will appear here as a customer-ready document.</p><Button to="/app/packages">Create a package <ArrowLeft size={15}/></Button></div></div> :
      <div className="itinerary-workspace">
        <aside className="itinerary-brand-editor"><p className="eyebrow">YOUR AGENCY IDENTITY</p><label className="pb-field">Agency name<input value={agency} onChange={e => setAgency(e.target.value)} onBlur={saveBrand}/></label><label className="pb-field">Accent colour<input type="color" value={accent} onChange={e => { setAccent(e.target.value); localStorage.setItem("wayfare.agency.accent", e.target.value); }}/></label><p className="pb-muted">Your brand settings are saved in this browser and appear on the printed itinerary.</p><div className="pb-brand-preview" style={{ background: accent }}><span>YOUR JOURNEY,</span><strong>beautifully arranged.</strong></div></aside>
        <article className="itinerary-paper">
          <header className="itinerary-cover">
            {destination?.heroImage && <div className="itinerary-hero-image"><img src={photoUrl(destination.heroImage, 1800)} alt={`${destination.name} landscape`} /><div className="itinerary-hero-shade"/></div>}
            <div className="itinerary-cover-content"><div className="itinerary-brand" style={{ color: accent }}>{agency || "Your agency"}<span> JOURNEYS, THOUGHTFULLY MADE</span></div><p className="eyebrow">A JOURNEY DESIGNED FOR YOU</p><h2>{trip.title || `A journey through ${destination?.name || "somewhere wonderful"}`}</h2><p className="itinerary-place"><MapPin size={15}/>{destination?.name || "Destination to be confirmed"}{destination?.country ? `, ${destination.country}` : ""}</p><div className="itinerary-meta"><span><CalendarDays size={15}/>{trip.start_date || "Dates to be confirmed"} · {trip.nights} nights</span><span><Users size={15}/>{trip.travellers} travellers</span></div></div>
          </header>
          <section className="itinerary-intro"><p className="eyebrow">THE JOURNEY AT A GLANCE</p><p>{destination?.editorial || destination?.introduction || "Time to discover at an easy pace, with thoughtful places to stay and memorable experiences along the way."}</p></section>
          {highlights.length > 0 && <section className="itinerary-section itinerary-highlights"><div className="itinerary-section-heading"><div><p className="eyebrow">A FEW PLACES TO LOOK FORWARD TO</p><h3><Compass size={17}/> Destination highlights</h3></div></div><div className="itinerary-photo-grid">{highlights.map((spot, i) => <figure className={`itinerary-photo-card itinerary-photo-${i + 1}`} key={spot.name}><img src={photoUrl(spot.image, 700)} alt={spot.name} loading="eager"/><figcaption><strong>{spot.name}</strong><span>{spot.category || destination.name}</span></figcaption></figure>)}</div></section>}
          {savedState === "ready" && saved.quote?.totals && <section className="itinerary-section itinerary-price"><h3><Sparkles size={17}/> Your investment</h3><div className="itinerary-row"><strong>Price per traveller</strong><span>{fx.format(saved.quote.totals.per_person_usd, "USD")}</span></div><div className="itinerary-row"><strong>Total for {trip.travellers} travellers</strong><span>{fx.format(saved.quote.totals.sell_usd, "USD")}</span></div><small className="pb-muted">Final pricing is confirmed at booking.</small></section>}
          <section className="itinerary-section"><h3><Hotel size={17}/> Where you'll stay</h3>{trip.stays?.length ? trip.stays.map((stay, i) => <div className="itinerary-row" key={`${stay.item_id}-${i}`}><strong>{stay.name}</strong><span>{stay.nights || trip.nights} nights</span></div>) : <p className="pb-muted">Accommodation details will be added soon.</p>}</section>
          <section className="itinerary-section"><h3><CalendarDays size={17}/> Your days</h3>{(trip.days || []).map(day => <div className="itinerary-day" key={day.day}><div className="itinerary-day-number">DAY {String(day.day).padStart(2, "0")}</div><div><h4>{formatDay(trip.start_date, day.day)}</h4>{day.stops?.length ? day.stops.map((stop, i) => <div className="itinerary-stop" key={`${stop.item_id}-${i}`}><span/>{stop.name}</div>) : <p className="pb-muted">Time to explore at your own pace.</p>}</div></div>)}</section>
          <section className="itinerary-section"><h3><Plane size={17}/> Getting there</h3><div className="itinerary-transfer"><span className="itinerary-transfer-icon"><Plane size={15}/></span><div><small>ARRIVAL · AIRPORT TO STAY</small><strong>{trip.transfers?.arrival_name || "Transfer to be confirmed"}</strong></div></div><div className="itinerary-transfer"><span className="itinerary-transfer-icon itinerary-transfer-return"><Plane size={15}/></span><div><small>DEPARTURE · STAY TO AIRPORT</small><strong>{trip.transfers?.departure_name || "Transfer to be confirmed"}</strong></div></div></section>
          <footer className="itinerary-footer"><div className="itinerary-footer-rule"/><strong>{agency}</strong><p>We look forward to welcoming you on this journey.</p><small>{savedState === "ready" ? "" : "Preview · Save the package to share a permanent link. "}Final itinerary and selling price will be confirmed by your travel designer.</small></footer>
        </article>
        <section className="itinerary-payment" aria-label="Payment">
          <div className="itinerary-payment-head"><span className="itinerary-payment-icon"><WalletCards size={18}/></span><div><p className="eyebrow">SECURE YOUR JOURNEY</p><h3>Pay your deposit</h3><p>Download the itinerary as a PDF above, then secure the booking with PayPal (sandbox).</p></div></div>
          {deleteError && <p className="adv-pay-error" role="alert">{deleteError}</p>}
          {savedState !== "ready" ? <p className="adv-pay-note">Save this package from the package builder to unlock payment.</p>
            : paidBooking ? <div className="adv-pay adv-pay-done"><Status tone="sage">Deposit paid</Status><h3>Booking {paidBooking.booking_id}</h3><p>Paid USD {Number(paidBooking.deposit_usd).toFixed(2)} of USD {Number(paidBooking.sell_usd).toFixed(2)}. Balance due: USD {Number(paidBooking.balance_usd).toFixed(2)}.</p></div>
            : saved.quote?.totals?.sell_usd > 0 ? <ApproveAndPay layout="horizontal" packageId={saved.package_id} proposal={{ totals: { sell_usd: saved.quote.totals.sell_usd } }} onPaid={setPaidBooking}/>
            : <p className="adv-pay-note">Add stays or experiences so the package has a price, then come back to pay.</p>}
        </section>
      </div>}
  </div>;
}
