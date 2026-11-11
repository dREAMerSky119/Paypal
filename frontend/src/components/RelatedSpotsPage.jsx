import { useMemo, useState } from "react";
import { ArrowUpRight, MapPin, Clock3, Compass } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "./ui.jsx";
import { destinations } from "../data/destinations.js";
import "../related-spots.css";

export default function RelatedSpotsPage() {
  const [slug, setSlug] = useState(destinations[0]?.slug || "");
  const destination = destinations.find((d) => d.slug === slug) || destinations[0];
  const related = useMemo(() => (destination?.related || []).map((id) => destinations.find((d) => d.slug === id)).filter(Boolean), [destination]);
  const attractions = destination?.attractions || [];
  return <div className="related-spots-page">
    <PageHeader eyebrow="DISCOVER MORE" title={<>Related <em>spots.</em></>} description="Explore destination highlights and nearby ideas curated in the Wayfare destination guide." />
    <section className="rs-controls"><label htmlFor="rs-destination">Choose a destination</label><select id="rs-destination" value={slug} onChange={(e) => setSlug(e.target.value)}>{destinations.map((d) => <option key={d.slug} value={d.slug}>{d.name}, {d.country}</option>)}</select></section>
    {destination && <><div className="rs-destination-intro"><div><p className="eyebrow">{destination.type}</p><h2>{destination.name}<span>, {destination.country}</span></h2><p>{destination.introduction || destination.editorial}</p></div><div className="rs-best-time"><span>BEST TIME TO VISIT</span><strong>{destination.bestTime}</strong><small>{destination.duration || "Flexible stay"}</small></div></div>
    <section className="rs-section"><div className="rs-heading"><div><p className="eyebrow">LOCAL HIGHLIGHTS</p><h3>Places worth a closer look</h3></div><span>{attractions.length} curated spots</span></div><div className="rs-grid">{attractions.map((spot) => <article className="rs-card" key={spot.name}><div className="rs-card-image" style={{backgroundImage: spot.image ? `url(https://images.unsplash.com/${spot.image}?auto=format&fit=crop&w=900&q=80)` : undefined}}><span>{spot.category || "HIGHLIGHT"}</span></div><div className="rs-card-body"><h4>{spot.name}</h4><p>{spot.description || "A recommended point of interest in this destination."}</p><div className="rs-meta"><span><MapPin size={13}/>{spot.location || destination.name}</span>{spot.duration && <span><Clock3 size={13}/>{spot.duration}</span>}</div></div></article>)}</div></section>
    <section className="rs-section"><div className="rs-heading"><div><p className="eyebrow">FOLLOW THE THREAD</p><h3>Related destinations</h3></div><span>Explore beyond this stop</span></div>{related.length ? <div className="rs-related-grid">{related.map((item) => <Link to={`/destinations/${item.slug}`} className="rs-related-card" key={item.slug}><div><span>{item.type}</span><h4>{item.cardTitle || `${item.name}, ${item.country}`}</h4><p>{item.detail || item.editorial}</p></div><ArrowUpRight size={18}/></Link>)}</div> : <p className="rs-empty">No related destinations are listed for this selection yet.</p>}</section>
    <p className="rs-disclaimer"><Compass size={15}/> These are curated editorial recommendations, not live map-distance or availability results. Confirm local access, opening times and travel times before quoting clients.</p></>}
  </div>;
}
