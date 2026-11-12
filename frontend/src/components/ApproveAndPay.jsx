import { useRef, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { ShieldCheck } from "lucide-react";
import { ApiState, Status } from "./ui.jsx";
import { api } from "../lib/api.js";
import { useApi } from "../lib/useApi.js";

// Payment amounts are shown to the cent. The server decides the real amount; this is display only.
const usd = (n) => `USD ${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function errorText(e, fallback) {
  return e?.detail || (e?.kind === "network" ? "We could not reach the server." : e?.kind === "timeout" ? "The server did not respond in time." : fallback);
}

/**
 * The human step. The agent (or the plain advisor) can open a PayPal order, but money only moves when the
 * traveller approves it in the PayPal window and we then call /capture. Nothing here sends an amount:
 * the server prices the trip itself from inventory.
 *
 * `checkout` is the order the agent already opened, if any. Without it, the button creates the order on click.
 */
export default function ApproveAndPay({ proposal, constraints, checkout, packageId, onPaid, layout = "vertical" }) {
  const config = useApi("/payments/config");
  const [state, setState] = useState({ phase: "ready", booking: null, error: null });
  const orderRef = useRef(checkout || null); // reuse one order across cancelled attempts

  if (!config.data) return <section className="adv-pay" aria-label="Approve and pay"><ApiState api={config} label="payment options" /></section>;

  const { configured, client_id: clientId, currency, deposit_pct: pct } = config.data;
  const sell = proposal.totals.sell_usd;
  const deposit = checkout?.deposit_usd ?? Math.round(sell * pct) / 100;
  const balance = checkout?.balance_usd ?? Math.round((sell - deposit) * 100) / 100;

  if (state.phase === "paid") {
    const b = state.booking;
    return (
      <section className="adv-pay adv-pay-done" aria-label="Booking confirmed">
        <Status tone="sage">Deposit paid (sandbox)</Status>
        <h3>Booking {b.booking_id}</h3>
        <p>Paid {usd(b.deposit_usd)} of {usd(b.sell_usd)}. Balance due: {usd(b.balance_usd)}. Payment ID {b.capture_id}.</p>
        <p className="adv-pay-note">Sandbox payment: no real money moved.</p>
      </section>
    );
  }

  async function createOrder() {
    setState((s) => ({ ...s, error: null }));
    try {
      if (!orderRef.current) orderRef.current = packageId
        ? await api("/payments/package-orders", { method: "POST", body: JSON.stringify({ package_id: packageId }) })
        : await api("/payments/orders", { method: "POST", body: JSON.stringify({ constraints }) });
      return orderRef.current.order_id;
    } catch (e) {
      orderRef.current = null;
      setState((s) => ({ ...s, error: errorText(e, "Could not start the payment.") }));
      throw e; // tells the PayPal window to close
    }
  }

  async function onApprove(data) {
    setState((s) => ({ ...s, phase: "capturing", error: null }));
    try {
      const booking = await api(`/payments/orders/${data.orderID}/capture`, { method: "POST" });
      setState({ phase: "paid", booking, error: null });
      onPaid?.(booking);
    } catch (e) {
      // The order stays open on the server and capture is idempotent, so retrying is safe.
      setState({ phase: "ready", booking: null, error: errorText(e, "The payment could not be confirmed.") + " You have not been charged twice; you can try again." });
    }
  }

  return (
    <section className="adv-pay" aria-label="Approve and pay">
      <header>
        <p className="eyebrow">APPROVE AND PAY · PAYPAL SANDBOX</p>
        <div className="adv-totals">
          <div><span>Deposit today ({pct}%)</span><strong>{usd(deposit)}</strong></div>
          <div><span>Balance later</span><strong>{usd(balance)}</strong></div>
          <div><span>Trip total</span><strong>{usd(sell)}</strong></div>
        </div>
      </header>
      {!configured ? (
        <p className="adv-pay-note" role="status">Payments are not set up on the server yet (PayPal sandbox keys missing).</p>
      ) : (
        <>
          <p className="adv-pay-note"><ShieldCheck size={13} /> The assistant can prepare this payment but cannot take it. Nothing is charged until you approve in PayPal. Use a sandbox buyer account; no real money moves.</p>
          {state.phase === "capturing" && <p role="status" className="adv-pay-note">Confirming your payment…</p>}
          <div className="adv-pay-buttons">
            <PayPalScriptProvider options={{ clientId, currency, intent: "capture", components: "buttons" }}>
              <PayPalButtons
                style={{ layout, label: "pay", height: 40, ...(layout === "horizontal" ? { tagline: false } : {}) }}
                disabled={state.phase === "capturing"}
                forceReRender={[clientId, currency]}
                createOrder={createOrder}
                onApprove={onApprove}
                onCancel={() => setState((s) => ({ ...s, error: "Payment cancelled. Nothing was charged." }))}
                onError={() => setState((s) => ({ ...s, error: s.error || "PayPal reported a problem. Nothing was charged." }))}
              />
            </PayPalScriptProvider>
          </div>
        </>
      )}
      {state.error && <p className="adv-pay-error" role="alert">{state.error}</p>}
    </section>
  );
}
