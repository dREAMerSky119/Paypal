import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppRoutes } from "../App.jsx";
import { AuthProvider } from "../context/AuthContext.jsx";
import { seedDemoSession } from "../test/demoSession.js";

const summary = {
  gross_sales: 395, total_net_cost: 350, gross_profit: 27, gross_margin: 6.84, cancellation_leakage: 8,
  margin_forgone_on_cancelled: 7.25, completed_bookings: 3, cancelled_bookings: 1, total_bookings: 4,
  currency: "USD", is_sample: true,
};
const row = (name, profit) => ({ name, gross_sales: 100, total_net_cost: 80, gross_profit: profit, gross_margin: profit,
  cancellation_leakage: 1, completed_bookings: 2, cancelled_bookings: 1 });
const breakdown = { group_by: "destination", total_groups: 2, results: [row("kyoto-japan", 20), row("iceland", 10)], currency: "USD", is_sample: true };
const trend = { month_count: 2, results: [
  { month: "2025-01", label: "Jan 2025", gross_sales: 100, total_net_cost: 80, gross_profit: 10, gross_margin: 10, cancellation_leakage: 1, completed_bookings: 2, cancelled_bookings: 0 },
  { month: "2025-02", label: "Feb 2025", gross_sales: 120, total_net_cost: 90, gross_profit: 17, gross_margin: 14, cancellation_leakage: 2, completed_bookings: 2, cancelled_bookings: 1 },
], currency: "USD", is_sample: true };
const whatIf = { current_markup: 12.86, proposed_markup: 15, current_gross_sales: 395, projected_gross_sales: 402.5,
  current_gross_profit: 27, projected_gross_profit: 34.5, current_gross_margin: 6.84, projected_gross_margin: 8.57,
  profit_difference: 7.5, total_net_cost: 350, total_fees: 10, cancellation_leakage: 8, completed_bookings: 3,
  cancelled_bookings: 1, currency: "USD", is_sample: true };

let calls;
function mockApi(overrides = {}) {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = new URL(String(url));
    calls.push(u.pathname + u.search);
    const path = u.pathname;
    if (overrides[path]) return new Response(JSON.stringify(overrides[path].body), { status: overrides[path].status });
    const body = path.endsWith("/summary") ? summary
      : path.endsWith("/breakdown") ? breakdown
      : path.endsWith("/monthly-trend") ? trend
      : path.endsWith("/markup-what-if") ? whatIf : {};
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

function visit() {
  seedDemoSession();
  return render(<AuthProvider><MotionConfig reducedMotion="always"><MemoryRouter initialEntries={["/app/analytics"]}><AppRoutes /></MemoryRouter></MotionConfig></AuthProvider>);
}

beforeEach(() => mockApi());
afterEach(() => vi.restoreAllMocks());

describe("ProfitabilityPage", () => {
  it("loads from the planned /analytics endpoints and shows the Sample data label", async () => {
    visit();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/profitability analysis/i);
    expect(await screen.findByText(/illustrative sample data/i)).toBeInTheDocument();
    await waitFor(() => {
      for (const p of ["/api/profitability/summary", "/api/profitability/breakdown",
        "/api/profitability/monthly-trend", "/api/profitability/markup-what-if"]) {
        expect(calls.some((c) => c.startsWith(p))).toBe(true);
      }
    });
    expect(calls.some((c) => c.startsWith("/api/analytics/profitability/"))).toBe(false); // stale paths are not used
  });

  it("re-requests the breakdown when the grouping changes", async () => {
    visit();
    await screen.findByRole("heading", { level: 1 });
    fireEvent.change(screen.getByLabelText(/breakdown by/i), { target: { value: "supplier" } });
    await waitFor(() => expect(calls.some((c) => c.includes("group_by=supplier"))).toBe(true));
  });

  it("passes the reporting period to every endpoint", async () => {
    visit();
    await screen.findByRole("heading", { level: 1 });
    fireEvent.change(screen.getByLabelText(/reporting period/i), { target: { value: "30" } });
    await waitFor(() => {
      for (const p of ["summary", "breakdown", "monthly-trend", "markup-what-if"]) {
        expect(calls.some((c) => c.includes(`/${p}`) && c.includes("from=") && c.includes("to="))).toBe(true);
      }
    });
  });

  it("shows the server's explanation when the API rejects a request", async () => {
    mockApi({ "/api/profitability/summary": { status: 400, body: { detail: "'from' date cannot be later than 'to' date" } } });
    visit();
    expect(await screen.findByText(/cannot be later than/i)).toBeInTheDocument();
  });

  it("shows an error, not a blank page, when the breakdown fails", async () => {
    mockApi({ "/api/profitability/breakdown": { status: 500, body: {} } });
    visit();
    await waitFor(() => expect(screen.getAllByText(/request failed|failed to load/i).length).toBeGreaterThan(0));
  });
});
