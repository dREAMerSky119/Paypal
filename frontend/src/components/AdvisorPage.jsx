import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
<<<<<<< HEAD
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { Button, PageHeader, Status } from "./ui.jsx";
import { api } from "../lib/api.js";
import { destinations } from "../data/destinations.js";
import { featureInfo } from "../data/featureInfo.js";
import { useAuth } from "../context/AuthContext.jsx";
import PriceDisplay from "./PriceDisplay.jsx";
import "../advisor.css";

const SUGGESTIONS = [
  "3 nights in Kyoto for 2, around $1500, love food and craft",
  "5 nights in Kerala for 4, relaxed pace, mid-range",
  "Luxury week in Iceland for a couple",
  "4 days in Bali on a budget, interested in culture",
];

const TYPE_LABEL = { stay: "Stay", experience: "Experience", guide: "Guide", transport: "Transfer" };

function Proposal({ p, displayCurrency }) {
  const t = p.totals;
  const money = (amount, sourceLabel = "USD itinerary estimate") => <PriceDisplay amount={amount} currency="USD" usdReference={amount} displayCurrency={displayCurrency} sourceLabel={sourceLabel} compact />;
=======
import { ArrowUp, Plus, RotateCcw, Sparkles, MapPin, Image as ImageIcon, X } from "lucide-react";
import { PageHeader } from "./ui.jsx";
import { api } from "../lib/api.js";
import { formatMoney } from "../lib/format.js";
import { destinations } from "../data/destinations.js";
import { featureInfo } from "../data/featureInfo.js";
import "../advisor.css";

const SUGGESTIONS = [
  "Plan 3 nights in Kyoto for 2, around $1500, with food and craft",
  "What local guides and experiences do you recommend in Kerala?",
  "Suggest a relaxed 5-day trip in Bali",
  "How can I make a group itinerary more budget friendly?",
];

const TYPE_LABEL = { stay: "Stay", experience: "Experience", guide: "Local guide", transport: "Transfer" };

function Proposal({ p }) {
  const t = p.totals;
>>>>>>> fe70b5b (Add updated project files final one)
  const days = [...new Set(p.lines.filter((l) => l.day).map((l) => l.day))].sort((a, b) => a - b);
  const base = p.lines.filter((l) => !l.day);
  const Row = ({ l }) => (
    <li className="adv-line">
      <span className="adv-line-type">{TYPE_LABEL[l.type] || l.type}</span>
      <span className="adv-line-name"><strong>{l.name}</strong><small>{l.qty_label} · {l.item_id}</small></span>
<<<<<<< HEAD
      <span className="adv-line-price"><PriceDisplay amount={l.sell_usd} currency="USD" usdReference={l.sell_usd} displayCurrency={displayCurrency} sourceLabel="USD itinerary estimate" compact/></span>
=======
      <span className="adv-line-price">{formatMoney(l.sell_usd)}</span>
>>>>>>> fe70b5b (Add updated project files final one)
    </li>
  );
  return (
    <section className="adv-proposal" aria-label="Proposed itinerary">
      <header>
        <p className="eyebrow">PROPOSAL · {p.nights} NIGHTS · {p.travellers} TRAVELLER{p.travellers === 1 ? "" : "S"}</p>
        <div className="adv-totals">
<<<<<<< HEAD
          <div><span>Sell price</span><strong>{money(t.sell_usd)}</strong></div>
          <div><span>Per person</span><strong>{money(t.per_person_usd)}</strong></div>
          <div><span>Net cost</span><strong>{money(t.net_usd)}</strong></div>
          <div><span>Margin</span><strong>{money(t.margin_usd)} <em>({t.margin_pct}%)</em></strong></div>
          {p.budget_usd != null && <div><span>Budget</span><strong>{money(p.budget_usd, "USD budget")} <em>{p.within_budget ? "· within" : "· over"}</em></strong></div>}
=======
          <div><span>Sell price</span><strong>{formatMoney(t.sell_usd)}</strong></div>
          <div><span>Per person</span><strong>{formatMoney(t.per_person_usd)}</strong></div>
          <div><span>Net cost</span><strong>{formatMoney(t.net_usd)}</strong></div>
          <div><span>Margin</span><strong>{formatMoney(t.margin_usd)} <em>({t.margin_pct}%)</em></strong></div>
          {p.budget_usd != null && <div><span>Budget</span><strong>{formatMoney(p.budget_usd)} <em>{p.within_budget ? "· within" : "· over"}</em></strong></div>}
>>>>>>> fe70b5b (Add updated project files final one)
        </div>
      </header>
      <h3>Stay and transfers</h3>
      <ul className="adv-lines">{base.map((l) => <Row key={l.item_id} l={l} />)}</ul>
      {days.map((d) => (
        <div key={d}><h3>Day {d}</h3><ul className="adv-lines">{p.lines.filter((l) => l.day === d).map((l) => <Row key={l.item_id} l={l} />)}</ul></div>
      ))}
      <ul className="adv-checks">{p.checks.map((c, i) => <li key={i} className={`adv-check adv-check-${c.level}`}>{c.message}</li>)}</ul>
    </section>
  );
}

<<<<<<< HEAD
export default function AdvisorPage() {
  const { preferredCurrency } = useAuth();
=======

function photoUrl(id, width = 720) {
  return id ? `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=82` : "";
}

function RecommendationCard({ item, destination, expanded, onToggle }) {
  const image = photoUrl(destination?.heroImage || destination?.cardImage, 720);
  return (
    <article className="adv-recommend-card">
      {image ? <img src={image} alt={`${destination?.name || item.destination} travel`} loading="lazy" /> : <div className="adv-image-fallback"><ImageIcon size={20} /></div>}
      <div className="adv-recommend-copy">
        <div className="adv-card-kicker">{TYPE_LABEL[item.type] || item.type} · {item.tier}</div>
        <h4>{item.name}</h4>
        <p>{item.locality || destination?.cardTitle || item.destination}</p>
        <div className="adv-card-bottom">
          <strong>{item.price != null ? `${item.currency} ${Number(item.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "Price not listed"}</strong>
          <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "See more about"} ${item.name}`}>
            {expanded ? <X size={15} /> : <Plus size={16} />} <span>{expanded ? "Less" : "See more"}</span>
          </button>
        </div>
        {expanded && <div className="adv-card-details">
          <p><b>Supplier:</b> {item.supplier || "Not listed in inventory"}</p>
          <p><b>Price basis:</b> {item.unit || "Refer to supplier for unit details"}</p>
          <p><b>Source:</b> Wayfare {item.data_origin === "imported" ? "imported" : "sample"} inventory. This is not live availability or a confirmed quote.</p>
          <p><b>Inventory ID:</b> {item.id}</p>
        </div>}
      </div>
    </article>
  );
}

function PlaceCard({ place, destination, expanded, onToggle }) {
  const attraction = destination?.attractions?.find((a) => a.name === place.name);
  const image = photoUrl(attraction?.image || destination?.heroImage, 640);
  return (
    <article className="adv-place-card">
      {image ? <img src={image} alt={place.name} loading="lazy" /> : <div className="adv-image-fallback"><MapPin size={20} /></div>}
      <div className="adv-recommend-copy">
        <div className="adv-card-kicker">{place.category || "PLACE"} · {place.location || destination?.name}</div>
        <h4>{place.name}</h4>
        {place.description && <p>{place.description}</p>}
        <div className="adv-card-bottom">
          <small>{place.duration || "Add to your itinerary"}</small>
          <button type="button" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "See more about"} ${place.name}`}>
            {expanded ? <X size={15} /> : <Plus size={16} />} <span>{expanded ? "Less" : "See more"}</span>
          </button>
        </div>
        {expanded && <div className="adv-card-details"><p>Suggested destination highlight from Wayfare's destination guide. Check local opening times and access conditions before confirming the itinerary.</p></div>}
      </div>
    </article>
  );
}

function AssistantExtras({ message, expandedId, setExpandedId }) {
  const all = [...(message.recommendations || []), ...(message.places || [])];
  if (!all.length) return null;
  const destinationSlug = message.proposal?.destination || message.constraints?.destination ||
    message.recommendations?.[0]?.destination;
  const destination = destinations.find((d) => d.slug === destinationSlug);
  return <section className="adv-discover">
    {message.recommendations?.length > 0 && <>
      <div className="adv-section-heading"><div><span>FROM YOUR INVENTORY</span><h3>Recommended for this trip</h3></div><small>{message.recommendations.length} matches</small></div>
      <div className="adv-recommend-grid">{message.recommendations.map((item) => <RecommendationCard key={item.id} item={item} destination={destination} expanded={expandedId === item.id} onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)} />)}</div>
    </>}
    {message.places?.length > 0 && <>
      <div className="adv-section-heading adv-place-heading"><div><span>EXPLORE THE DESTINATION</span><h3>Places worth adding</h3></div></div>
      <div className="adv-recommend-grid">{message.places.map((place) => <PlaceCard key={place.name} place={place} destination={destination} expanded={expandedId === `place:${place.name}`} onToggle={() => setExpandedId(expandedId === `place:${place.name}` ? null : `place:${place.name}`)} />)}</div>
    </>}
  </section>;
}

export default function AdvisorPage() {
>>>>>>> fe70b5b (Add updated project files final one)
  const info = featureInfo["/app/ai-studio"];
  const [params] = useSearchParams();
  const hint = destinations.find((d) => d.slug === params.get("destination"));
  const [messages, setMessages] = useState([]);
  const [constraints, setConstraints] = useState(null);
  const [input, setInput] = useState(hint ? `Plan a trip to ${hint.name} for 2 travellers, 4 nights` : "");
  const [busy, setBusy] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState(null);
<<<<<<< HEAD
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "nearest" }); }, [messages, busy]);

  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput(""); setBusy(true); setError(null); setWaking(false);
    const timer = setTimeout(() => setWaking(true), 3500);
    try {
      const res = await api("/advisor/plan", {
        method: "POST",
        body: JSON.stringify({ message, constraints, destination: hint?.slug ?? null }),
      });
      setConstraints(res.constraints);
      setMessages((m) => [...m, { role: "advisor", text: res.reply, proposal: res.proposal }]);
=======
  const [expandedId, setExpandedId] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" }); }, [messages, busy]);

  async function send(text) {
    const content = text.trim();
    if (!content || busy) return;
    const nextMessages = [
      ...messages.map((m) => ({ role: m.role === "user" ? "user" : "model", content: m.text })),
      { role: "user", content },
    ];
    setMessages((current) => [...current, { role: "user", text: content }]);
    setInput(""); setBusy(true); setError(null); setWaking(false); setExpandedId(null);
    const timer = setTimeout(() => setWaking(true), 3500);
    try {
      const res = await api("/advisor/chat", {
        method: "POST",
        body: JSON.stringify({ messages: nextMessages.slice(-20), constraints }),
      });
      setConstraints(res.constraints || constraints);
      setMessages((current) => [...current, {
        role: "advisor", text: res.reply, proposal: res.proposal,
        recommendations: res.recommendations || [], places: res.places || [],
        constraints: res.constraints || constraints, mode: res.mode,
      }]);
>>>>>>> fe70b5b (Add updated project files final one)
    } catch (e) {
      setError(e.detail || (e.kind === "network" ? "We could not reach the server." : e.kind === "timeout" ? "The server did not respond in time." : "Something went wrong."));
    } finally {
      clearTimeout(timer); setBusy(false); setWaking(false);
    }
  }

<<<<<<< HEAD
  function reset() { setMessages([]); setConstraints(null); setError(null); setInput(""); }

  return (
    <>
      <PageHeader eyebrow={info.eyebrow} title={<>{info.title}<span className="title-period">.</span></>} description={info.description}
        action={<Button to={info.action.to} variant="outline">{info.action.label}</Button>} />
      
      <div className="adv-shell">
        <div className="adv-chat" aria-live="polite">
          {messages.length === 0 && (
            <div className="adv-empty">
              <Sparkles size={22} />
              <p>Describe the trip: destination, nights, travellers, budget and what they enjoy.</p>
              <div className="adv-chips">{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)}>{s}</button>)}</div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`adv-msg adv-${m.role}`}>
              <p>{m.text}</p>
              {m.proposal && <Proposal p={m.proposal} displayCurrency={preferredCurrency} />}
            </div>
          ))}
          {busy && <div className="adv-msg adv-advisor" role="status"><p>{waking ? "Waking the server — the free host sleeps when idle, this can take up to a minute…" : "Planning…"}</p></div>}
          {error && <div className="api-state api-state-error" role="alert"><div><strong>Could not plan that</strong><p>{error}</p></div></div>}
          <div ref={endRef} />
        </div>
        <form className="adv-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
          <label className="sr-only" htmlFor="adv-input">Describe your trip</label>
          <input id="adv-input" value={input} maxLength={600} onChange={(e) => setInput(e.target.value)} placeholder="e.g. 4 nights in Jaipur for 3, around $1200, culture and food" autoComplete="off" />
          <button type="submit" className="button button-primary adv-send" disabled={busy || !input.trim()} aria-label="Send"><ArrowUp size={16} /></button>
          {messages.length > 0 && <button type="button" className="button button-outline adv-reset" onClick={reset}><RotateCcw size={14} /> New plan</button>}
        </form>
      </div>
    </>
  );
=======
  function reset() { setMessages([]); setConstraints(null); setError(null); setInput(""); setExpandedId(null); }

  return <>
    <PageHeader eyebrow={info.eyebrow} title={<>{info.title}<span className="title-period">.</span></>} description="One assistant for everyday travel questions, tailored advice and inventory-backed trip planning." />
    <div className="adv-studio">
      <div className="adv-studio-top"><div className="adv-online"><span /> WAYFARE AI · TRAVEL ADVISOR</div>
        {messages.length > 0 && <button type="button" className="adv-new-chat" onClick={reset}><RotateCcw size={14} /> New chat</button>}
      </div>
      <div className="adv-chat" aria-live="polite">
        {messages.length === 0 && <div className="adv-empty">
          <div className="adv-orb"><Sparkles size={26} /></div>
          <span className="adv-welcome-kicker">YOUR TRAVEL PLANNING PARTNER</span>
          <h2>Where would you like<br />to go next?</h2>
          <p>Ask anything, explore destinations, find local guides or build a complete trip from your Wayfare inventory.</p>
          <div className="adv-chips">{SUGGESTIONS.map((s) => <button key={s} type="button" onClick={() => send(s)}>{s}<ArrowUp size={13} /></button>)}</div>
        </div>}
        {messages.map((m, i) => <div key={i} className={`adv-msg adv-${m.role}`}>
          <div className="adv-msg-label">{m.role === "user" ? "YOU" : <><Sparkles size={12} /> WAYFARE AI</>}</div>
          <p>{m.text}</p>
          {m.proposal && <Proposal p={m.proposal} />}
          {m.role === "advisor" && <AssistantExtras message={m} expandedId={expandedId} setExpandedId={setExpandedId} />}
        </div>)}
        {busy && <div className="adv-msg adv-advisor" role="status"><div className="adv-msg-label"><Sparkles size={12} /> WAYFARE AI</div><p>{waking ? "Waking the server — this can take up to a minute on the free host…" : "Thinking through your request…"}</p></div>}
        {error && <div className="api-state api-state-error" role="alert"><div><strong>Could not reach your advisor</strong><p>{error}</p><button type="button" className="adv-retry" onClick={() => send(messages.at(-1)?.text || input)}>Try again</button></div></div>}
        <div ref={endRef} />
      </div>
      <form className="adv-form" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <label className="sr-only" htmlFor="adv-input">Message your AI travel advisor</label>
        <input id="adv-input" value={input} maxLength={4000} onChange={(e) => setInput(e.target.value)} placeholder="Ask about a destination, plan a trip, or find a local guide…" autoComplete="off" />
        <button type="submit" className="button button-primary adv-send" disabled={busy || !input.trim()} aria-label="Send message"><ArrowUp size={17} /></button>
      </form>
      <div className="adv-disclaimer">AI suggestions use Wayfare's committed sample inventory where available. Prices and availability must be confirmed with suppliers.</div>
    </div>
  </>;
>>>>>>> fe70b5b (Add updated project files final one)
}
