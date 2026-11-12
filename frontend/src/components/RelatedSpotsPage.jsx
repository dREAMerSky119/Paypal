import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Clock3, ExternalLink, MapPin } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiState, PageHeader, Status } from "./ui.jsx";
import { useApi } from "../lib/useApi.js";
import { destinations } from "../data/destinations.js";
import "../related-spots.css";

// The map needs real browser geometry, so it loads only in the browser (never in tests).
const SpotMap = lazy(() => import("./SpotMap.jsx"));

const MODES = [
  { key: "near", label: "Nearby", hint: "Road distance from the anchor spot" },
  { key: "day", label: "Same day", hint: "Close enough to share a day, no two half-day commitments" },
  { key: "similar", label: "Similar", hint: "Shares themes and character, anywhere in the portfolio" },
];

const attributionLine = (list) =>
  list?.length
    ? list.map((a) => <a key={a.url} href={a.url} target="_blank" rel="noreferrer">{a.credit || a.source} ({a.licence})<ExternalLink size={10} /></a>)
    : null;

export default function RelatedSpotsPage() {
  const [params] = useSearchParams();
  // ?destination= and ?item= come from the destination page and the builder.
  const [slug, setSlug] = useState(params.get("destination") || destinations[0]?.slug || "");
  const [mode, setMode] = useState("near");
  const [item, setItem] = useState(params.get("item") || "");
  const destination = destinations.find((d) => d.slug === slug) || destinations[0];

  const query = new URLSearchParams({ destination: slug, mode });
  if (item) query.set("item", item);
  const related = useApi(`/spots/related?${query.toString()}`);
  const results = related.data?.results || [];
  const anchor = related.data?.anchor;

  // Curated fallback: the hand-wired destination links the page shipped with.
  const curated = useMemo(
    () => (destination?.related || []).map((id) => destinations.find((d) => d.slug === id)).filter(Boolean),
    [destination]
  );
  const attractions = destination?.attractions || [];

  return (
    <div className="related-spots-page">
      <PageHeader
        eyebrow="DISCOVER MORE"
        title={<>Related <em>spots.</em></>}
        description="Ranked suggestions for what to pair with a place — by road distance, by a shared day, or by character. Text and distance data credit Wikipedia and Wikivoyage."
      />

      <section className="rs-controls">
        <label htmlFor="rs-destination">Destination</label>
        <select id="rs-destination" value={slug} onChange={(e) => { setSlug(e.target.value); setItem(""); }}>
          {destinations.map((d) => <option key={d.slug} value={d.slug}>{d.name}, {d.country}</option>)}
        </select>
        <label htmlFor="rs-anchor">Anchor spot</label>
        <select id="rs-anchor" value={item} onChange={(e) => setItem(e.target.value)}>
          <option value="">Best known spot</option>
          {attractions.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
        </select>
        <div className="rs-modes" role="tablist" aria-label="Suggestion mode">
          {MODES.map((m) => (
            <button key={m.key} role="tab" aria-selected={mode === m.key} title={m.hint}
              className={`rs-mode ${mode === m.key ? "is-active" : ""}`} onClick={() => setMode(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        <Status tone="gold">Sample data</Status>
      </section>
      <p className="rs-mode-hint">{MODES.find((m) => m.key === mode)?.hint}</p>

      <ApiState api={related} label="related spots" />

      {related.data && (
        <section className="rs-section" aria-live="polite">
          <div className="rs-heading">
            <div>
              <p className="eyebrow">{mode === "similar" ? "SAME SPIRIT, ELSEWHERE" : "WHILE YOU'RE NEAR"}</p>
              <h3>{anchor ? `Around ${anchor.name}` : "Around this destination"}</h3>
            </div>
            <span>{related.data.count} suggestion{related.data.count === 1 ? "" : "s"}</span>
          </div>

          {results.length === 0 && (
            <p className="rs-empty">
              {mode === "similar"
                ? "No spot in the portfolio shares enough character with this one yet."
                : "No spots close enough to suggest here. Try “Similar” for ideas further afield."}
            </p>
          )}

          <div className="rs-grid">
            {results.map((r) => (
              <article className="rs-card" key={r.spot_id}>
                <div className="rs-card-image" style={r.image_id ? { backgroundImage: `url(https://images.unsplash.com/${r.image_id}?auto=format&fit=crop&w=900&q=80)` } : undefined}>
                  <span>{r.category || "SPOT"}</span>
                </div>
                <div className="rs-card-body">
                  <h4>{r.name}</h4>
                  <p>{r.reason}</p>
                  <div className="rs-meta">
                    <span><MapPin size={13} />{r.location_label || r.destination}</span>
                    {r.travel_min != null && <span><Clock3 size={13} />{r.travel_min} min by road</span>}
                  </div>
                  {attributionLine(r.attribution) && (
                    <div className="rs-credit">{attributionLine(r.attribution)}</div>
                  )}
                </div>
              </article>
            ))}
          </div>

          {results.length > 0 && (
            <Suspense fallback={<p className="rs-muted">Loading map…</p>}>
              <SpotMap points={[anchor, ...results].filter((p) => p && p.lat != null && p.lon != null)} />
            </Suspense>
          )}
        </section>
      )}

      <section className="rs-section">
        <div className="rs-heading">
          <div>
            <p className="eyebrow">FOLLOW THE THREAD</p>
            <h3>Related destinations</h3>
          </div>
          <span>Curated fallback · explore beyond this stop</span>
        </div>
        {curated.length ? (
          <div className="rs-related-grid">
            {curated.map((d) => (
              <Link to={`/destinations/${d.slug}`} className="rs-related-card" key={d.slug}>
                <div>
                  <span>{d.type}</span>
                  <h4>{d.cardTitle || `${d.name}, ${d.country}`}</h4>
                  <p>{d.detail || d.editorial}</p>
                </div>
                <ArrowUpRight size={18} />
              </Link>
            ))}
          </div>
        ) : (
          <p className="rs-empty">No related destinations are listed for this selection yet.</p>
        )}
      </section>

      <p className="rs-disclaimer">
        Spot text, where shown, comes from Wikipedia and Wikivoyage under CC BY-SA with contributor credit
        on each card. Distances are straight-line estimates with road-time approximations on sample data —
        confirm local access, opening times and travel times before quoting clients.
      </p>
    </div>
  );
}
