import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowUp, RotateCcw, Sparkles } from "lucide-react";
import { Button, PageHeader, Status } from "./ui.jsx";
import ApproveAndPay from "./ApproveAndPay.jsx";
import { api } from "../lib/api.js";
import { formatMoney } from "../lib/format.js";
import { destinations } from "../data/destinations.js";
import { featureInfo } from "../data/featureInfo.js";
import "../advisor.css";

const SUGGESTIONS = [
  "3 nights in Kyoto for 2, around $1500, love food and craft",
  "5 nights in Kerala for 4, relaxed pace, mid-range",
  "Luxury week in Iceland for a couple",
  "4 days in Bali on a budget, interested in culture",
];

const TYPE_LABEL = { stay: "Stay", experience: "Experience", guide: "Guide", transport: "Transfer" };

function Proposal({ p }) {
  const t = p.totals;
  const days = [...new Set(p.lines.filter((l) => l.day).map((l) => l.day))].sort((a, b) => a - b);
  const base = p.lines.filter((l) => !l.day);
  const Row = ({ l }) => (
    <li className="adv-line">
      <span className="adv-line-type">{TYPE_LABEL[l.type] || l.type}</span>
      <span className="adv-line-name"><strong>{l.name}</strong><small>{l.qty_label} · {l.item_id}</small></span>
      <span className="adv-line-price">{formatMoney(l.sell_usd)}</span>
    </li>
  );
  return (
    <section className="adv-proposal" aria-label="Proposed itinerary">
      <header>
        <p className="eyebrow">PROPOSAL · {p.nights} NIGHTS · {p.travellers} TRAVELLER{p.travellers === 1 ? "" : "S"}</p>
        <div className="adv-totals">
          <div><span>Sell price</span><strong>{formatMoney(t.sell_usd)}</strong></div>
          <div><span>Per person</span><strong>{formatMoney(t.per_person_usd)}</strong></div>
          <div><span>Net cost</span><strong>{formatMoney(t.net_usd)}</strong></div>
          <div><span>Margin</span><strong>{formatMoney(t.margin_usd)} <em>({t.margin_pct}%)</em></strong></div>
          {p.budget_usd != null && <div><span>Budget</span><strong>{formatMoney(p.budget_usd)} <em>{p.within_budget ? "· within" : "· over"}</em></strong></div>}
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

const TOOL_LABEL = { search_inventory: "Searched inventory", build_proposal: "Built proposal", create_checkout: "Opened deposit checkout" };

function AgentSteps({ agent }) {
  if (!agent || agent.mode !== "gemini" || !agent.steps?.length) return null;
  return (
    <details className="adv-steps">
      <summary>Agent steps ({agent.steps.length})</summary>
      <ol>{agent.steps.map((st, i) => <li key={i} className={st.ok ? "" : "adv-step-skipped"}>{TOOL_LABEL[st.tool] || st.tool}: {st.note}{st.ok ? "" : " (not done)"}</li>)}</ol>
    </details>
  );
}

export default function AdvisorPage() {
  const info = featureInfo["/app/ai-studio"];
  const [params] = useSearchParams();
  const hint = destinations.find((d) => d.slug === params.get("destination"));
  const [messages, setMessages] = useState([]);
  const [constraints, setConstraints] = useState(null);
  const [input, setInput] = useState(hint ? `Plan a trip to ${hint.name} for 2 travellers, 4 nights` : "");
  const [busy, setBusy] = useState(false);
  const [waking, setWaking] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ block: "nearest" }); }, [messages, busy]);

  async function send(text) {
    const message = text.trim();
    if (!message || busy) return;
    setMessages((m) => [...m, { role: "user", text: message }]);
    setInput(""); setBusy(true); setError(null); setWaking(false);
    const timer = setTimeout(() => setWaking(true), 3500);
    try {
      const res = await api("/advisor/agent", {
        method: "POST",
        body: JSON.stringify({ message, constraints, destination: hint?.slug ?? null }),
      });
      setConstraints(res.constraints);
      setMessages((m) => [...m, { role: "advisor", text: res.reply, proposal: res.proposal, constraints: res.constraints, checkout: res.checkout ?? null, agent: res.agent ?? null }]);
    } catch (e) {
      setError(e.detail || (e.kind === "network" ? "We could not reach the server." : e.kind === "timeout" ? "The server did not respond in time." : "Something went wrong."));
    } finally {
      clearTimeout(timer); setBusy(false); setWaking(false);
    }
  }

  // Only the newest proposal can be paid for: an older one has been superseded by a revision.
  const payableIndex = messages.reduce((last, m, i) => (m.role === "advisor" && m.proposal ? i : last), -1);

  function reset() { setMessages([]); setConstraints(null); setError(null); setInput(""); }

  return (
    <>
      <PageHeader eyebrow={info.eyebrow} title={<>{info.title}<span className="title-period">.</span></>} description={info.description}
        action={<Button to={info.action.to} variant="outline">{info.action.label}</Button>} />
      <p className="inv-banner" role="note"><Status tone="gold">Sample data</Status> The AI plans, PayPal sandbox charges. Plans are built only from the generated sample inventory, so every price traces to an inventory item; the AI never sets a price, and nothing is charged until you approve it in PayPal. This is not live availability, and no real money moves.</p>
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
              {m.proposal && <Proposal p={m.proposal} />}
              <AgentSteps agent={m.agent} />
              {i === payableIndex && <ApproveAndPay key={m.checkout?.order_id || `c${i}`} proposal={m.proposal} constraints={m.constraints} checkout={m.checkout} />}
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
}
