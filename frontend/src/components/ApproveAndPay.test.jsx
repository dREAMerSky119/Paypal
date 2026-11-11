import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

// Stand-in for the PayPal SDK: exposes the props the real button receives so a test can play the
// part of PayPal's popup (call createOrder, then onApprove).
const sdk = vi.hoisted(() => ({ buttons: null }));
vi.mock("@paypal/react-paypal-js", async () => {
  const React = await import("react");
  return {
    PayPalScriptProvider: ({ children, options }) => React.createElement("div", { "data-testid": "sdk", "data-client": options.clientId, "data-intent": options.intent }, children),
    PayPalButtons: (props) => { sdk.buttons = props; return React.createElement("button", { type: "button", disabled: props.disabled }, "PayPal"); },
  };
});

import ApproveAndPay from "./ApproveAndPay.jsx";

const proposal = { totals: { sell_usd: 1000, per_person_usd: 500 } };
const constraints = { destination: "kyoto-japan", nights: 3, travellers: 2 };
const CONFIG = { configured: true, client_id: "sandbox-client", environment: "sandbox", currency: "USD", deposit_pct: 30 };
const ORDER = { booking_id: "WF-ABC", order_id: "ORDER-1", sell_usd: 1000, deposit_usd: 300, balance_usd: 700 };
const BOOKING = { booking_id: "WF-ABC", status: "PAID", sell_usd: 1000, deposit_usd: 300, balance_usd: 700, capture_id: "CAP-9" };

let routes;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  sdk.buttons = null;
  routes = { "GET /api/payments/config": () => json(CONFIG), "POST /api/payments/orders": () => json(ORDER),
    "POST /api/payments/orders/ORDER-1/capture": () => json(BOOKING) };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init = {}) => {
    const path = new URL(url).pathname;
    const handler = routes[`${init.method || "GET"} ${path}`];
    return handler ? handler(init) : json({ detail: "no route" }, 404);
  });
});

const calls = (needle) => globalThis.fetch.mock.calls.filter(([u, i]) => `${i?.method || "GET"} ${new URL(u).pathname}` === needle);
const view = (props = {}) => render(<ApproveAndPay proposal={proposal} constraints={constraints} checkout={null} {...props} />);

describe("ApproveAndPay", () => {
  it("loads the public client id, uses capture intent, and says the assistant cannot take payment", async () => {
    view();
    expect(await screen.findByTestId("sdk")).toHaveAttribute("data-client", "sandbox-client");
    expect(screen.getByTestId("sdk")).toHaveAttribute("data-intent", "capture");
    expect(screen.getByText(/cannot take it/i)).toBeInTheDocument();
    expect(screen.getByText(/USD 300\.00/)).toBeInTheDocument(); // 30% deposit
    expect(screen.getByText(/USD 700\.00/)).toBeInTheDocument();
  });

  it("uses the order the agent already opened and does not create another", async () => {
    view({ checkout: ORDER });
    await screen.findByTestId("sdk");
    let id;
    await act(async () => { id = await sdk.buttons.createOrder(); });
    expect(id).toBe("ORDER-1");
    expect(calls("POST /api/payments/orders")).toHaveLength(0);
    expect(calls("POST /api/payments/orders/ORDER-1/capture")).toHaveLength(0); // opening an order never captures it
  });

  it("creates the order on click when there is none, sends constraints only, and reuses it on retry", async () => {
    view();
    await screen.findByTestId("sdk");
    await act(async () => { await sdk.buttons.createOrder(); });
    await act(async () => { await sdk.buttons.createOrder(); });
    const posts = calls("POST /api/payments/orders");
    expect(posts).toHaveLength(1);
    const sent = JSON.parse(posts[0][1].body);
    expect(Object.keys(sent)).toEqual(["constraints"]); // never an amount
    expect(sent.constraints).toEqual(constraints);
    expect(calls("POST /api/payments/orders/ORDER-1/capture")).toHaveLength(0); // only the buyer's approval captures
  });

  it("captures only after approval and then shows the confirmation", async () => {
    view({ checkout: ORDER });
    await screen.findByTestId("sdk");
    expect(calls("POST /api/payments/orders/ORDER-1/capture")).toHaveLength(0);
    await act(async () => { await sdk.buttons.onApprove({ orderID: "ORDER-1" }); });
    expect(calls("POST /api/payments/orders/ORDER-1/capture")).toHaveLength(1);
    expect(await screen.findByRole("region", { name: /booking confirmed/i })).toHaveTextContent("WF-ABC");
    expect(screen.getByText(/no real money moved/i)).toBeInTheDocument();
    expect(screen.queryByText("PayPal")).not.toBeInTheDocument();
  });

  it("shows the server's reason when capture fails and keeps the button so the buyer can retry", async () => {
    routes["POST /api/payments/orders/ORDER-1/capture"] = () => json({ detail: "Captured amount did not match the deposit" }, 502);
    view({ checkout: ORDER });
    await screen.findByTestId("sdk");
    await act(async () => { await sdk.buttons.onApprove({ orderID: "ORDER-1" }); });
    expect(await screen.findByRole("alert")).toHaveTextContent(/did not match the deposit/i);
    expect(screen.getByText("PayPal")).toBeEnabled();
    expect(screen.queryByRole("region", { name: /booking confirmed/i })).not.toBeInTheDocument();
  });

  it("surfaces a failure to start the payment and lets the next click try again", async () => {
    routes["POST /api/payments/orders"] = () => json({ detail: "PayPal sandbox keys are not configured on the server" }, 503);
    view();
    await screen.findByTestId("sdk");
    await act(async () => { await expect(sdk.buttons.createOrder()).rejects.toBeTruthy(); });
    expect(await screen.findByRole("alert")).toHaveTextContent(/not configured/i);
    routes["POST /api/payments/orders"] = () => json(ORDER);
    await act(async () => { expect(await sdk.buttons.createOrder()).toBe("ORDER-1"); });
  });

  it("explains a cancelled payment without claiming a charge", async () => {
    view({ checkout: ORDER });
    await screen.findByTestId("sdk");
    act(() => sdk.buttons.onCancel());
    expect(await screen.findByRole("alert")).toHaveTextContent(/cancelled.*nothing was charged/i);
  });

  it("renders no buttons when the server has no PayPal keys", async () => {
    routes["GET /api/payments/config"] = () => json({ ...CONFIG, configured: false, client_id: null });
    view();
    expect(await screen.findByText(/keys missing/i)).toBeInTheDocument();
    expect(screen.queryByTestId("sdk")).not.toBeInTheDocument();
  });

  it("shows an error state when payment options cannot be loaded", async () => {
    routes["GET /api/payments/config"] = () => json({}, 500);
    view();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/could not load payment options/i));
    expect(screen.queryByTestId("sdk")).not.toBeInTheDocument();
  });
});
