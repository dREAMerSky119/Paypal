import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const apiMock = vi.fn();
vi.mock("../lib/api.js", () => ({ api: (...args) => apiMock(...args) }));

import { PackageImpactPanel, ShortLink } from "./SimulatorExtras.jsx";

const request = { destination: "kyoto-japan", start: "2026-12", months: 2, adjustments: { fuel: 20 }, events: [{ id: "evt_001", strength: 100 }] };
const impact = {
  baseline: { margin_pct: 20, profit_usd: 100 }, scenario: { margin_pct: 15, profit_usd: 70 }, delta: { margin_points: -5, profit_usd: -30 },
  months: [{ period: "2026-12", sell_multiplier: 1.1, cost_multiplier: 1.2, baseline_profit: 100, scenario_profit: 70 }],
  warnings: ["Under this scenario the package margin falls below 10%."],
  nearby_alternatives: [{ slug: "osaka", name: "Osaka", uplift_pct: 3.2, spots: [{ name: "Dotonbori" }] }],
  basis: "Assumption-based, sample data.",
};

beforeEach(() => {
  apiMock.mockReset();
  apiMock.mockImplementation((path) => {
    if (path === "/packages") return Promise.resolve({ items: [
      { package_id: "pkg1", title: "Autumn", destination_slug: "kyoto-japan", start_date: "2026-12-02" },
      { package_id: "pkg2", title: "Elsewhere", destination_slug: "bali-indonesia", start_date: "2026-12-02" }] });
    if (path === "/simulator/package-impact") return Promise.resolve(impact);
    if (path === "/simulator/scenarios") return Promise.resolve({ share_path: "/app/simulator?saved=abc123" });
    return Promise.reject(new Error(`unexpected ${path}`));
  });
});

describe("PackageImpactPanel", () => {
  it("lists only packages for the scenario's destination and shows the margin change", async () => {
    render(<PackageImpactPanel request={request} />);
    const select = await screen.findByLabelText("Saved package");
    expect(screen.queryByText(/Elsewhere/)).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: "pkg1" } });
    expect(await screen.findByText("-5 pts")).toBeInTheDocument();
    const call = apiMock.mock.calls.find(([path]) => path === "/simulator/package-impact");
    expect(JSON.parse(call[1].body)).toEqual({ package_id: "pkg1", scenario: { adjustments: { fuel: 20 }, events: request.events } });
    expect(screen.getByText(/margin falls below 10%/)).toBeInTheDocument();
    expect(screen.getByText(/Dotonbori/)).toBeInTheDocument();
  });

  it("shows the server's explanation when the scenario cannot be applied", async () => {
    apiMock.mockImplementation((path) => path === "/packages"
      ? Promise.resolve({ items: [{ package_id: "pkg1", title: "Autumn", destination_slug: "kyoto-japan", start_date: "2026-12-02" }] })
      : Promise.reject({ detail: "start must be one of 2027-01 to 2027-12." }));
    render(<PackageImpactPanel request={request} />);
    fireEvent.change(await screen.findByLabelText("Saved package"), { target: { value: "pkg1" } });
    expect(await screen.findByText(/start must be one of/)).toBeInTheDocument();
  });

  it("explains the empty state when there are no packages for this destination", async () => {
    apiMock.mockResolvedValue({ items: [] });
    render(<PackageImpactPanel request={request} />);
    expect(await screen.findByText(/No saved packages for this destination/)).toBeInTheDocument();
  });
});

describe("ShortLink", () => {
  it("saves the inputs and reports the short link", async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
    render(<ShortLink request={request} />);
    fireEvent.click(screen.getByRole("button", { name: /Save and copy short link/ }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Short link copied/));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("/app/simulator?saved=abc123"));
  });
  it("shows the server's message when saving fails", async () => {
    apiMock.mockRejectedValue({ detail: "Scenario is too large to save." });
    render(<ShortLink request={request} />);
    fireEvent.click(screen.getByRole("button", { name: /Save and copy short link/ }));
    expect(await screen.findByText(/too large to save/)).toBeInTheDocument();
  });
});
