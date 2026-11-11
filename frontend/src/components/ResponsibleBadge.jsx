import { BadgeCheck, Leaf, Repeat2 } from "lucide-react";
import "../responsible-travel.css";

/** One badge component for every surface (inventory, packages, responsible page).
 *  It renders only when the server says the badge was earned from verified claims. */
export function ResponsibleBadge({ badge, size = "sm" }) {
  if (!badge) return null;
  return <span className={`rb-badge rb-${size}`} title={`${badge.label}: ${badge.score}/100 from verified claims only`}>
    <BadgeCheck size={size === "sm" ? 11 : 14} aria-hidden="true" />{badge.label}
  </span>;
}

/** Detail-view only: self-reported and unverified claims as labelled text. Never a badge. */
export function SelfReportedLines({ claims }) {
  if (!claims?.length) return null;
  return <div className="rb-selfreported">
    <p className="rb-selfreported-title">Claims not counted toward the score</p>
    <ul>{claims.map((claim, i) => <li key={`${claim.label}-${i}`}>
      <span className={`rb-tag rb-tag-${claim.status}`}>{claim.status.replace("_", " ")}</span> {claim.label}: {claim.claim}
    </li>)}</ul>
  </div>;
}

/** Package impact card: responsible score, carbon estimate and swap suggestions from the quote. */
export function ImpactCard({ checks, onSwap }) {
  const score = checks?.responsible_score;
  const carbon = checks?.carbon;
  const swaps = checks?.swap_suggestions || [];
  if (!score && !carbon) return null;
  return <section className="rb-impact" aria-label="Responsible travel impact">
    <header><Leaf size={14} aria-hidden="true" /><strong>Responsible travel</strong><span className="rb-sample">SAMPLE DATA</span></header>
    {score && <div className="rb-impact-row">
      <div className="rb-impact-score">{score.score == null ? "Not yet verified" : <>{Math.round(score.score)}<small>/100</small></>}</div>
      <div>
        {score.badge ? <ResponsibleBadge badge={score.badge} size="md" /> : null}
        <p>{score.message}</p>
        <small>{score.note}</small>
      </div>
    </div>}
    {carbon && <div className="rb-impact-row">
      <div className="rb-impact-score">{Math.round(carbon.per_traveller_kg)}<small> kg CO2e pp</small></div>
      <div>
        <p>About {Math.round(carbon.total_kg)} kg for the group: stays {Math.round(carbon.components_kg.accommodation)} kg, ground travel {Math.round(carbon.components_kg.ground_between_stops)} kg.</p>
        <small>Not included: {carbon.not_included.join(", ")}. {carbon.assumptions}</small>
      </div>
    </div>}
    {swaps.length > 0 && <div className="rb-swaps">
      <p className="rb-swaps-title"><Repeat2 size={13} aria-hidden="true" /> Partner swap ideas</p>
      {swaps.map((swap) => <div className="rb-swap" key={`${swap.from.item_id}-${swap.to.item_id}`}>
        <div>
          <strong>{swap.from.name}</strong> → <strong>{swap.to.name}</strong>
          <p>{swap.reason}</p>
          <small>{swap.delta_sell_usd === 0 ? "Same price" : `${swap.delta_sell_usd > 0 ? "+" : "−"}${Math.abs(swap.delta_sell_usd)} USD sell (${swap.delta_pct > 0 ? "+" : ""}${swap.delta_pct}%)`}</small>
        </div>
        {onSwap && <button type="button" className="rb-swap-button" onClick={() => onSwap(swap)}>Swap</button>}
      </div>)}
    </div>}
  </section>;
}

/** "How this score works" panel, copy comes from the server so it always matches the logic. */
export function ScoreExplainer({ explainer }) {
  if (!explainer) return null;
  return <details className="rb-explainer">
    <summary>{explainer.title}</summary>
    <ol>{explainer.steps.map((step) => <li key={step}>{step}</li>)}</ol>
    <p className="rb-explainer-not">What this is not</p>
    <ul>{explainer.not_this.map((line) => <li key={line}>{line}</li>)}</ul>
  </details>;
}
