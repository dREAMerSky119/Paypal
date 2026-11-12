import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Clock3, Compass, Leaf, MapPin, Sparkles } from "lucide-react";
import { destinations, getDestination } from "../data/destinations";
import { useApi } from "../lib/useApi.js";
import "../destination.css";

const photo = (id, width = 1200) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=85`;

function Reveal({ children, className = "", delay = 0 }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>;
}

function DestinationNotFound() {
  return <main className="destination-not-found"><Link className="back-link" to="/home"><ArrowLeft size={15}/> Back to Wayfare</Link><span className="eyebrow">A LITTLE OFF THE MAP</span><h1>We couldn't find<br/><em>that place.</em></h1><p>That destination isn't in our collection yet. Explore the places we have gathered so far.</p><div className="not-found-links">{destinations.map(destination => <Link key={destination.slug} to={`/destinations/${destination.slug}`}>{destination.cardTitle}<ArrowUpRight size={14}/></Link>)}</div></main>;
}

function AttractionCard({ attraction, index, slug }) {
  return <motion.article className="attraction-card" initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }} transition={{ duration: 0.55, delay: index * 0.07, ease: [0.22, 1, 0.36, 1] }}><div className="attraction-image"><img src={photo(attraction.image, 700)} alt={attraction.name} loading="lazy" onError={(event) => {event.currentTarget.style.display = "none";}}/><span>{attraction.category}</span></div><div className="attraction-body"><h3>{attraction.name}</h3><p>{attraction.description}</p><div className="attraction-meta"><span><MapPin size={12}/>{attraction.location}</span>{attraction.duration && <span><Clock3 size={12}/>{attraction.duration}</span>}</div><Link className="nearby-chip" to={`/app/related-spots?destination=${slug}&item=${encodeURIComponent(attraction.name)}`}>Nearby stops <ArrowUpRight size={12}/></Link></div></motion.article>;
}

/** Live "And while you're near" suggestions from the related-spots API (Phase D).
 *  Degrades silently: if the API is down or returns nothing, the curated
 *  related-destinations section below still renders as the fallback. */
function NearbySpots({ slug }) {
  const nearby = useApi(`/spots/related?destination=${encodeURIComponent(slug)}&mode=near&limit=6`);
  if (nearby.status === "error") return null;
  const results = nearby.data?.results || [];
  if (!nearby.isLoading && results.length === 0) return null;
  return <section className="nearby-section wrap">
    <div className="detail-section-heading"><div><p className="eyebrow">AND WHILE YOU'RE NEAR</p><h2>Pair it with a <em>nearby stop.</em></h2></div><span className="detail-count">{nearby.data ? `0${results.length} SUGGESTIONS` : "…"}</span></div>
    {nearby.isLoading && <p className="nearby-loading">Finding what pairs well…</p>}
    <div className="nearby-grid">{results.map(r => <article className="nearby-card" key={r.spot_id}><div><strong>{r.name}</strong><p>{r.reason}</p><div className="nearby-credit">{(r.attribution || []).map(a => <a key={a.url} href={a.url} target="_blank" rel="noreferrer">{a.credit} ({a.licence})</a>)}</div></div><Link className="text-link" to={`/app/related-spots?destination=${slug}&item=${encodeURIComponent(r.name)}`}>Compare modes <ArrowUpRight size={14}/></Link></article>)}</div>
    <p className="nearby-note">Distances are straight-line estimates on sample data · text via Wikipedia and Wikivoyage, CC BY-SA</p>
  </section>;
}

export default function DestinationDetails() {
  const { slug } = useParams();
  const destination = getDestination(slug);
  if (!destination) return <DestinationNotFound/>;
  const related = destination.related.map(getDestination).filter(Boolean);
  const destinationLabel = destination.name === destination.country ? destination.name : `${destination.name}, ${destination.country}`;

  return <main className="destination-page">
    <header className="destination-nav"><Link to="/home" className="brand"><span className="brand-mark"><Compass size={15}/></span><span>wayfare<span className="brand-period">.</span></span></Link><nav><Link to="/home">Home</Link><a href="#attractions">Discover</a><Link to="/app">Agent workspace</Link></nav><Link className="destination-nav-cta" to={`/app/ai-studio?destination=${destination.slug}`}>Plan a journey <ArrowUpRight size={14}/></Link></header>
    <section className="destination-hero"><img src={photo(destination.heroImage, 2400)} alt={destinationLabel} onError={(event) => {event.currentTarget.style.display = "none";}}/><div className="destination-hero-overlay"/><div className="destination-hero-content"><Link className="destination-back" to="/home"><ArrowLeft size={14}/> ALL DESTINATIONS</Link><p className="eyebrow eyebrow-light">A WAYFARE FIELD NOTE · {destination.country.toUpperCase()}</p><h1>{destination.name}{destination.name !== destination.country && <span>, {destination.country}</span>}</h1><p className="destination-lede">{destination.editorial}</p><div className="destination-hero-facts"><span><CalendarDays size={15}/><small>BEST TIME</small>{destination.bestTime}</span><span><Compass size={15}/><small>GOOD FOR</small>{destination.highlights[0]}</span></div></div></section>
    <div className="destination-content">
      <div className="destination-main-column">
        <Reveal className="destination-intro"><p className="eyebrow">A SENSE OF PLACE</p><h2>Take the time<br/>to <em>look closer.</em></h2><div><p>{destination.introduction}</p><p>{destination.geography}</p><div className="destination-summary"><span><Clock3 size={15}/><small>RECOMMENDED TIME</small><strong>{destination.duration}</strong></span><span><MapPin size={15}/><small>GOOD TO KNOW</small><strong>Plan at an unhurried pace</strong></span></div></div></Reveal>
        <section className="attractions-section" id="attractions"><Reveal className="detail-section-heading"><div><p className="eyebrow">WORTH THE DETOUR</p><h2>Places to <em>linger.</em></h2></div><span className="detail-count">0{destination.attractions.length} PLACES</span></Reveal><div className="attractions-grid">{destination.attractions.map((attraction, index) => <AttractionCard key={attraction.name} attraction={attraction} index={index} slug={destination.slug}/>)}</div></section>
        <NearbySpots slug={destination.slug}/>
        <Reveal className="travel-tips"><div className="tips-heading"><span><Sparkles size={17}/></span><div><p className="eyebrow">A FEW THOUGHTFUL NOTES</p><h2>Before you <em>go.</em></h2></div></div><ul>{destination.tips.map(tip => <li key={tip}>{tip}</li>)}</ul></Reveal>
      </div>
      <aside className="destination-aside"><div className="aside-sticky"><p className="eyebrow">THE WAY THERE</p><h3>Somewhere<br/><em>to begin.</em></h3><p className="aside-intro">Start with what matters to your traveller. Let the rest take shape from there.</p><Link className="button button-primary plan-button" to={`/app/ai-studio?destination=${destination.slug}`}>Plan a trip here <ArrowRight size={16}/></Link><div className="destination-highlights"><span className="eyebrow">A FEW HIGHLIGHTS</span>{destination.highlights.map((highlight, i) => <div key={highlight}><span>0{i + 1}</span>{highlight}</div>)}</div></div></aside>
    </div>
    <section className="experience-band"><div className="wrap experience-layout"><div className="experience-heading"><p className="eyebrow">MEET THE PLACE THROUGH ITS PEOPLE</p><h2>Local by <em>nature.</em></h2><p>Thoughtful experiences shared by the people who know this place best.</p></div><div className="experience-list">{destination.experiences.map((experience, i) => <Reveal key={experience} className="experience-item" delay={i * .05}><span>0{i + 1}</span><p>{experience}</p><ArrowUpRight size={15}/></Reveal>)}</div></div></section>
    <section className="responsible-detail"><div className="wrap responsible-detail-inner"><span className="responsible-detail-icon"><Leaf size={21}/></span><div><p className="eyebrow">TRAVEL WITH CARE</p><h2>Good for the place.<br/><em>Good for the people.</em></h2><p>{destination.responsible}</p></div><div className="responsible-note"><span>THE WAYFARER'S PLEDGE</span><strong>Travel gently.<br/>Leave generously.</strong><Leaf size={22}/></div></div></section>
    {related.length > 0 && <section className="related-section wrap"><div className="detail-section-heading"><div><p className="eyebrow">FOLLOW THE THREAD</p><h2>And while you're <em>near.</em></h2></div><Link className="text-link" to="/home">All destinations <ArrowRight size={15}/></Link></div><div className="related-grid">{related.map((item, i) => <motion.div key={item.slug} initial={{opacity:0,y:16}} whileInView={{opacity:1,y:0}} viewport={{once:true}} transition={{duration:.5,delay:i*.08}}><Link className="related-card" to={`/destinations/${item.slug}`}><img src={photo(item.cardImage, 900)} alt={item.cardTitle} loading="lazy" onError={(event) => {event.currentTarget.style.display = "none";}}/><span>{item.type}</span><div><strong>{item.cardTitle}</strong><ArrowUpRight size={16}/></div></Link></motion.div>)}</div></section>}
    <footer className="destination-footer"><div className="wrap"><Link to="/home" className="brand brand-light"><span className="brand-mark"><Compass size={15}/></span><span>wayfare<span className="brand-period">.</span></span></Link><span>THOUGHTFUL JOURNEYS START HERE.</span><Link to={`/app/ai-studio?destination=${destination.slug}`}>PLAN A JOURNEY <ArrowRight size={14}/></Link></div></footer>
  </main>;
}
