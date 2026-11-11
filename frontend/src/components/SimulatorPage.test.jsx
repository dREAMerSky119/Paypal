import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppRoutes } from "../App.jsx";
import { AuthProvider } from "../context/AuthContext.jsx";
import { seedDemoSession } from "../test/demoSession.js";

// jsdom has no ResizeObserver, which recharts' ResponsiveContainer needs.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };

const slider = (label, min, max, extra = {}) => ({ label, driver: "slider", unit: "units", min, max, default: 0, step: 1,
  demand_per_unit: -0.3, rate_per_unit: 0.1, cost_per_unit: 0, source_note: "Assumption, not a measurement.", ...extra });

const assumptions = {
  is_sample: true,
  disclaimer: "Illustrations only.",
  bounds: { demand: [0.35, 2.5], rate: [0.6, 1.6], cost: [0.6, 1.6] },
  effect_types: {
    weather: slider("Weather shock", 0, 100), fuel: slider("Fuel price", -30, 100), currency: slider("Local currency vs USD", -20, 20),
    visa: slider("Visa and entry policy", -50, 50), disruption: slider("Disruption", 0, 100),
  },
  globals: { spill_share: { value: 0.3, label: "Displaced demand that moves elsewhere", note: "Rest is lost." } },
  events: [{ id: "evt_a", name: "Monsoon onset", type: "weather", destination: "kerala-india", country: "India", start: "2027-06-01", end: "2027-08-31", demand_multiplier: 0.7, rate_multiplier: 0.8, source_note: "Assumption" }],
  fx: [{ currency: "INR", per_usd: 88, annual_volatility: 0.04, source_note: "Reference, not live." }],
  destinations: [
    { slug: "kerala-india", name: "Kerala", country: "India", currency: "INR" },
    { slug: "bali-indonesia", name: "Bali", country: "Indonesia", currency: "IDR" },
  ],
  available_months: ["2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08"],
};
const presets = { count: 2, presets: [
  { id: "heavy-monsoon", label: "Heavy monsoon", destination: "kerala-india", start: "2027-06", months: 3, adjustments: { weather: 67 }, event_types: [], detail: "d" },
  { id: "fuel-plus-20", label: "Fuel +20%", destination: "bali-indonesia", start: "2027-01", months: 3, adjustments: { fuel: 20 }, event_types: [], detail: "d" },
] };
const month = (period, baseline, scenario) => ({ period, baseline, baseline_lower: baseline - 5, baseline_upper: baseline + 5, scenario, scenario_lower: scenario - 4, scenario_upper: scenario + 4,
  demand_multiplier: 0.8, rate_multiplier: 0.83, sell_multiplier: 0.85, cost_multiplier: 0.9, occupancy_baseline: 0.33, occupancy_scenario: 0.26,
  turned_away: 0, capped: false, sales_baseline: 100, sales_scenario: 70, profit_baseline: 14, profit_scenario: 5 });
const result = {
  is_sample: true, destination: assumptions.destinations[0], window: { start: "2027-06", months: 2, end: "2027-07" },
  months: [month("2027-06", 69, 55), month("2027-07", 67, 53.6)],
  summary: { baseline_total: 136, scenario_total: 108.6, demand_change_pct: -20.1, rate_pressure_pct: -16.8, occupancy_baseline: 0.33, occupancy_scenario: 0.26, turned_away_total: 0, peak_month: "2027-06" },
  margin: { basis: "Simulated bookings, 2025-11 to 2026-10.", currency: "USD", baseline: { sales: 200, profit: 28, margin_pct: 14 }, scenario: { sales: 140, profit: 10, margin_pct: 7.1 }, delta: { sales: -60, profit: -18, margin_points: -6.9 } },
  spillover: [{ slug: "bali-indonesia", name: "Bali", similarity: 0.09, uplift_pct: 0.8, reason: "9% similar." }],
  factors: [{ type: "weather", label: "Weather shock", value: 67, demand: 0.799, rate: 0.9, cost: 1 }],
  warnings: [], capped: false,
};

let runs;
function mockApi({ run } = {}) {
  runs = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path.endsWith("/simulator/assumptions")) return new Response(JSON.stringify(assumptions), { status: 200 });
    if (path.endsWith("/simulator/presets")) return new Response(JSON.stringify(presets), { status: 200 });
    if (path.endsWith("/simulator/run")) {
      runs.push(JSON.parse(init.body));
      return run ? run(runs.at(-1)) : new Response(JSON.stringify(result), { status: 200 });
    }
    return new Response("{}", { status: 200 });
  });
}

function visit(path = "/app/simulator") {
  seedDemoSession();
  return render(<AuthProvider><MotionConfig reducedMotion="always"><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></MotionConfig></AuthProvider>);
}

beforeEach(() => { mockApi(); localStorage.clear(); });
afterEach(() => vi.restoreAllMocks());

describe("SimulatorPage", () => {
  it("opens on the heavy monsoon preset and shows results with a Sample data label", async () => {
    visit();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/market simulator/i);
    expect(screen.getByRole("note")).toHaveTextContent(/sample data/i);
    expect(await screen.findByText(/baseline versus scenario/i)).toBeInTheDocument();
    expect(screen.getByText("\u221220.1%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Heavy monsoon" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(runs[0]).toMatchObject({ destination: "kerala-india", start: "2027-06", months: 3, adjustments: { weather: 67 } }));
  });

  it("moving a slider runs the scenario again without reloading the page", async () => {
    visit();
    await screen.findByText(/baseline versus scenario/i);
    fireEvent.change(screen.getByRole("slider", { name: /fuel price/i }), { target: { value: "20" } });
    await waitFor(() => expect(runs.at(-1).adjustments).toEqual({ weather: 67, fuel: 20 }));
    expect(screen.getByText(/baseline versus scenario/i)).toBeInTheDocument(); // results stay on screen meanwhile
    expect(screen.getByRole("button", { name: "Heavy monsoon" })).toHaveAttribute("aria-pressed", "false");
  });

  it("a preset replaces the whole scenario", async () => {
    visit();
    await screen.findByText(/baseline versus scenario/i);
    fireEvent.click(screen.getByRole("button", { name: "Fuel +20%" }));
    await waitFor(() => expect(runs.at(-1)).toMatchObject({ destination: "bali-indonesia", start: "2027-01", adjustments: { fuel: 20 } }));
    expect(runs.at(-1).adjustments.weather).toBeUndefined();
  });

  it("restores a shared scenario from the link", async () => {
    const shared = encodeURIComponent(JSON.stringify({ destination: "bali-indonesia", start: "2027-02", months: 2, adjustments: { visa: 25 }, events: [] }));
    visit(`/app/simulator?scenario=${shared}`);
    await screen.findByText(/baseline versus scenario/i);
    await waitFor(() => expect(runs[0]).toMatchObject({ destination: "bali-indonesia", start: "2027-02", months: 2, adjustments: { visa: 25 } }));
  });

  it("pre-fills the destination from ?destination=", async () => {
    visit("/app/simulator?destination=bali-indonesia");
    await screen.findByText(/baseline versus scenario/i);
    await waitFor(() => expect(runs[0].destination).toBe("bali-indonesia"));
    expect(runs[0].adjustments).toEqual({});
  });

  it("lists events that fall in the window and sends the ones you tick", async () => {
    visit();
    await screen.findByText(/baseline versus scenario/i);
    fireEvent.click(screen.getByRole("checkbox", { name: /monsoon onset/i }));
    await waitFor(() => expect(runs.at(-1).events).toEqual([{ id: "evt_a", strength: 100 }]));
  });

  it("editing an assumption travels with the request, and can be reset", async () => {
    visit();
    await screen.findByText(/baseline versus scenario/i);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Weather shock: Demand" }), { target: { value: "-0.5" } });
    await waitFor(() => expect(runs.at(-1).overrides).toEqual({ types: { weather: { demand_per_unit: -0.5 } } }));
    fireEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
    await waitFor(() => expect(runs.at(-1).overrides).toBeUndefined());
  });

  it("shows the server's reason when a run is rejected", async () => {
    mockApi({ run: () => new Response(JSON.stringify({ detail: "months must be a whole number from 1 to 12." }), { status: 400 }) });
    visit();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/could not run this scenario/i);
    expect(alert).toHaveTextContent(/months must be a whole number/i);
    expect(within(alert).getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("shows a retryable error when the simulator cannot load", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 500 }));
    visit();
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the simulator/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("saves a scenario in this browser and lists it", async () => {
    visit();
    await screen.findByText(/baseline versus scenario/i);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/name this scenario/i), { target: { value: "Monsoon downside" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("button", { name: /^monsoon downside/i })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("wayfare.simulator.saved"))[0].name).toBe("Monsoon downside");
  });
});
