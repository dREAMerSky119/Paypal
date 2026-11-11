import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext.jsx";
import { seedDemoSession } from "../test/demoSession.js";
import AdvisorPage from "./AdvisorPage.jsx";

const proposal = {
  destination: "kyoto-japan", nights: 3, travellers: 2, budget_usd: 1500, within_budget: true,
  totals: { sell_usd: 1400, per_person_usd: 700, net_usd: 1100, margin_usd: 300, margin_pct: 21.4 },
  lines: [
    { item_id: "item_0021", name: "Test stay", type: "stay", day: null, qty_label: "1 room(s) × 3 night(s)", sell_usd: 900 },
    { item_id: "item_0027", name: "Tea class", type: "experience", day: 1, qty_label: "2 traveller(s)", sell_usd: 200 },
  ],
  checks: [{ level: "info", message: "" }],
};

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const body = JSON.parse(init.body);
    return new Response(JSON.stringify(
      /kyoto/i.test(body.message)
        ? { reply: "Here is a plan.", constraints: { destination: "kyoto-japan" }, missing: [], proposal }
        : { reply: "Which destination?", constraints: {}, missing: ["destination"], proposal: null }), { status: 200 });
  });
});

const view = (path = "/app/ai-studio") => {
  seedDemoSession();
  return render(<AuthProvider><MemoryRouter initialEntries={[path]}><AdvisorPage /></MemoryRouter></AuthProvider>);
};

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
});
