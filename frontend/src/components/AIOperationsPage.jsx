
import { useRef, useState, useEffect } from "react";
import {
  ArrowUp,
  Bot,
  RotateCcw,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

import { Button, PageHeader, Status } from "./ui.jsx";
import { api } from "../lib/api.js";
import "../ai-operations.css";

const SUGGESTIONS = [
  "Prepare a 5-day Goa corporate package for 40 employees with 20 twin-sharing rooms, airport transfers, meals and sightseeing. Budget ₹12 lakh.",
  "Create a quotation template for a 30-person group tour. Show net cost, 15% margin and per-person selling price.",
  "Give me a supplier comparison checklist for hotels, transport operators and local guides.",
  "Draft a balanced 4-day Jaipur itinerary for a school group of 35 students and 3 teachers.",
];

export default function AIOperationsPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef(null);

  // Scroll to the latest message.
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [messages, busy]);

  // Send a message to the AI assistant.
  async function send(value) {
    const content = value.trim();

    if (!content || busy) return;

    const next = [
      ...messages,
      {
        role: "user",
        content,
      },
    ];

    setMessages(next);
    setInput("");
    setBusy(true);
    setError("");

    try {
      const result = await api("/advisor/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: next,
        }),
      });

      setMessages([
        ...next,
        {
          role: "model",
          content: result.reply || "No response was returned by the assistant.",
        },
      ]);
    } catch (e) {
      console.error("AI Operations API error:", e);

      setError(
        e.detail ||
          (e.kind === "network"
            ? "Could not reach the Wayfare API. Make sure the backend is running."
            : e.kind === "timeout"
            ? "The request took too long. Please try again."
            : "The assistant could not respond.")
      );
    } finally {
      setBusy(false);
    }
  }

  // Start a new conversation.
  function reset() {
    setMessages([]);
    setInput("");
    setError("");
  }

  return (
    <div className="aiops-page">
      <PageHeader
        eyebrow="YOUR AGENCY COPILOT"
        title={
          <>
            AI travel <em>operations.</em>
          </>
        }
        description="A practical assistant for group travel, supplier research, quotation planning and itinerary operations."
        action={
          <Button to="/app/inventory" variant="outline">
            Browse inventory
          </Button>
        }
      />

      <div className="aiops-notice">
        <ShieldCheck size={17} />
        <span>
          <strong>Advisory mode.</strong> The assistant can help prepare plans
          and calculations, but it does not contact suppliers, verify live
          availability, confirm bookings or process payments. Always validate
          quotations before sharing them with clients.
        </span>
      </div>

      <section className="aiops-shell">
        <header className="aiops-chat-head">
          <div className="aiops-avatar">
            <Bot size={20} />
          </div>

          <div>
            <strong>Wayfare Operations Assistant</strong>
            <small>
              <Status tone="sage">Gemini connection</Status>
              {" · B2B travel support"}
            </small>
          </div>

          {messages.length > 0 && (
            <button
              className="aiops-reset"
              onClick={reset}
              type="button"
            >
              <RotateCcw size={14} />
              New chat
            </button>
          )}
        </header>

        <div className="aiops-messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="aiops-welcome">
              <Sparkles size={25} />

              <h2>What are we organising?</h2>

              <p>
                Describe a client requirement. I can help structure the trip,
                identify missing information, calculate indicative costs and
                prepare an agency-ready response.
              </p>

              <div className="aiops-suggestions">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion}
                    onClick={() => send(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <article
              key={index}
              className={`aiops-message aiops-${message.role}`}
            >
              <span>
                {message.role === "user"
                  ? "YOU"
                  : "WAYFARE ASSISTANT"}
              </span>

              <p>{message.content}</p>
            </article>
          ))}

          {busy && (
            <article
              className="aiops-message aiops-model"
              role="status"
            >
              <span>WAYFARE ASSISTANT</span>
              <p>Reviewing your requirements…</p>
            </article>
          )}

          {error && (
            <div className="aiops-error" role="alert">
              <strong>Could not get a response</strong>
              <p>{error}</p>

              {error.toLowerCase().includes("api key") && (
                <small>
                  Add GEMINI_API_KEY to backend/.env and restart the backend.
                </small>
              )}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <form
          className="aiops-form"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <label className="sr-only" htmlFor="aiops-input">
            Message the travel operations assistant
          </label>

          <textarea
            id="aiops-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            maxLength={4000}
            rows={2}
            placeholder="Describe a group booking, quotation or operations task…"
          />

          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="Send message"
          >
            <ArrowUp size={18} />
          </button>
        </form>

        <p className="aiops-footnote">
          AI-generated guidance can be inaccurate. Confirm supplier rates,
          taxes, policies and availability independently.
        </p>
      </section>
    </div>
  );
}
