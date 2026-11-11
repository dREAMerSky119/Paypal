import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdvisorPage from "./AdvisorPage.jsx";

// The real SDK would try to load paypal.com; a stub keeps these tests about the advisor page.
vi.mock("@paypal/react-paypal-js", async () => {
  const React = await import("react");
  return {
    PayPalScriptProvider: ({ children }) => React.createElement("div", null, children),
    PayPalButtons: () => React.createElement("button", { type: "button" }, "PayPal"),
  };
});

const proposal = {
  destination: "kyoto-japan", nights: 3, travellers: 2, budget_usd: 1500, within_budget: true,
  totals: { sell_usd: 1400, per_person_usd: 700, net_usd: 1100, margin_usd: 300, margin_pct: 21.4 },
  lines: [
    { item_id: "item_0021", name: "Test stay", type: "stay", day: null, qty_label: "1 room(s) × 3 night(s)", sell_usd: 900 },
    { item_id: "item_0027", name: "Tea class", type: "experience", day: 1, qty_label: "2 traveller(s)", sell_usd: 200 },
  ],
  checks: [{ level: "info", message: "Sample data. Prices are generated, not live availability." }],
};

const CONFIG = { configured: true, client_id: "sandbox-client", environment: "sandbox", currency: "USD", deposit_pct: 30 };
const AGENT = { mode: "gemini", steps: [{ tool: "build_proposal", ok: true, note: "$1,400.00 total" }, { tool: "create_checkout", ok: false, note: "customer has not asked to pay" }] };
let agentExtras;

beforeEach(() => {
  agentExtras = {};
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init = {}) => {
    if (new URL(url).pathname === "/api/payments/config") return new Response(JSON.stringify(CONFIG), { status: 200 });
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify(
      /kyoto/i.test(body.message)
        ? { reply: "Here is a plan.", constraints: { destination: "kyoto-japan" }, missing: [], proposal, checkout: null, ...agentExtras }
        : { reply: "Which destination?", constraints: {}, missing: ["destination"], proposal: null, checkout: null }), { status: 200 });
  });
});

const ask = (text) => {
  fireEvent.change(screen.getByLabelText(/describe your trip/i), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: /send/i }));
};

const view = (path = "/app/ai-studio") => render(<MemoryRouter initialEntries={[path]}><AdvisorPage /></MemoryRouter>);

describe("AdvisorPage", () => {
  it("shows a proposal with item ids and totals", async () => {
    view();
    fireEvent.change(screen.getByLabelText(/describe your trip/i), { target: { value: "3 nights in Kyoto" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Test stay")).toBeInTheDocument();
    expect(screen.getByText(/item_0027/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /proposed itinerary/i })).toBeInTheDocument();
  });

  it("asks a clarifying question without a proposal", async () => {
    view();
    fireEvent.change(screen.getByLabelText(/describe your trip/i), { target: { value: "plan something" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText("Which destination?")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /proposed itinerary/i })).not.toBeInTheDocument();
  });

  it("shows an error state when the server fails", async () => {
    globalThis.fetch.mockResolvedValue(new Response("x", { status: 500 }));
    view();
    fireEvent.change(screen.getByLabelText(/describe your trip/i), { target: { value: "kyoto" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not plan that/i);
  });

  it("pre-fills from ?destination=", () => {
    view("/app/ai-studio?destination=kyoto-japan");
    expect(screen.getByLabelText(/describe your trip/i).value).toMatch(/kyoto/i);
  });

  it("talks to the agent endpoint", async () => {
    view();
    ask("3 nights in Kyoto");
    await screen.findByText("Test stay");
    const [url, init] = globalThis.fetch.mock.calls.find(([u]) => new URL(u).pathname.startsWith("/api/advisor"));
    expect(new URL(url).pathname).toBe("/api/advisor/agent");
    expect(JSON.parse(init.body).message).toBe("3 nights in Kyoto");
  });

  it("offers approve-and-pay under a proposal, and not under a clarifying question", async () => {
    view();
    ask("plan something");
    await screen.findByText("Which destination?");
    expect(screen.queryByRole("region", { name: /approve and pay/i })).not.toBeInTheDocument();
    ask("3 nights in Kyoto");
    expect(await screen.findByRole("region", { name: /approve and pay/i })).toBeInTheDocument();
    expect(await screen.findByText("PayPal")).toBeInTheDocument();
  });

  it("keeps the pay card on the newest proposal only", async () => {
    view();
    ask("3 nights in Kyoto");
    await screen.findByText("Test stay");
    ask("make it 4 nights in Kyoto");
    await waitFor(() => expect(screen.getAllByRole("region", { name: /proposed itinerary/i })).toHaveLength(2));
    expect(screen.getAllByRole("region", { name: /approve and pay/i })).toHaveLength(1);
  });

  it("shows what the agent did, including a step it was not allowed to take", async () => {
    agentExtras = { agent: AGENT };
    view();
    ask("3 nights in Kyoto");
    const summary = await screen.findByText(/agent steps \(2\)/i);
    fireEvent.click(summary);
    expect(screen.getByText(/built proposal: \$1,400\.00 total/i)).toBeInTheDocument();
    expect(screen.getByText(/opened deposit checkout: customer has not asked to pay \(not done\)/i)).toBeInTheDocument();
  });

  it("hides the agent trace in rule-based mode", async () => {
    agentExtras = { agent: { mode: "rules", steps: [] } };
    view();
    ask("3 nights in Kyoto");
    await screen.findByText("Test stay");
    expect(screen.queryByText(/agent steps/i)).not.toBeInTheDocument();
  });

  it("states that the AI plans and PayPal charges", () => {
    view();
    expect(screen.getByRole("note")).toHaveTextContent(/AI plans, PayPal sandbox charges/i);
  });
});
