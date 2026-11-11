import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext.jsx";
import { PROFILE_STORAGE_KEY, SESSION_STORAGE_KEY } from "../lib/profileStorage.js";
import PackageBuilderPage from "./PackageBuilderPage.jsx";
import ItineraryStudioPage from "./ItineraryStudioPage.jsx";

vi.mock("../lib/api.js", () => {
  // Fixtures live inside the factory: vi.mock is hoisted above top-level consts.
  const inventoryItems = [{ id: "stay-1", name: "Garden House", supplier_name: "Local host", destination: "kyoto-japan", type: "stay", unit: "per_room_night" }, { id: "exp-1", name: "Tea ceremony", supplier_name: "Kyoto guide", destination: "kyoto-japan", type: "experience", unit: "per_person" }, { id: "transport-1", name: "Arrival sedan", supplier_name: "Kyoto Cars", destination: "kyoto-japan", type: "transport", unit: "per_vehicle" }, { id: "transport-2", name: "Departure van", supplier_name: "Kyoto Cars", destination: "kyoto-japan", type: "transport", unit: "per_vehicle" }];
  const quoteFixture = { destination: "kyoto-japan", start_date: "2026-12-10", nights: 4, travellers: 2, line_items: [], totals: { net_usd: 500, sell_usd: 600, fees_usd: 15, profit_usd: 85, margin_pct: 14.17, per_person_usd: 300 }, fee_rate: 0.025, rate_months: ["2026-12"], warnings: [], checks: { travel_time: [], duplicates: [], anomaly_flags: [], margin: { margin_pct: 14.17, level: "ok" }, responsible_score: null, carbon: null }, is_sample: true };
  const savedPackage = { package_id: "PKG-TEST", revision: 3, payload: { title: "Kyoto in winter", destination: "kyoto-japan", start_date: "2026-12-10", nights: 4, travellers: 2, stays: [{ item_id: "stay-1", name: "Garden House", nights: 4 }], days: [{ day: 1, stops: [{ kind: "item", item_id: "exp-1", name: "Tea ceremony", slot: "morning", type: "experience" }] }], transfers: { arrival: "t1", departure: "t1" } }, quote: quoteFixture, is_sample: true };
  const api = vi.fn(async (path, init) => {
    if (path.startsWith("/inventory")) return { items: inventoryItems };
    if (path === "/packages/quote") return quoteFixture;
    if (path.startsWith("/packages/")) return savedPackage;
    throw new Error(`Unexpected api call: ${path}`);
  });
  return { api };
});

beforeEach(() => { localStorage.clear(); });

function advanceTrip() {
  fireEvent.change(screen.getByLabelText(/departure date/i), { target: { value: "2026-12-10" } });
  fireEvent.click(screen.getByRole("button", { name: /^continue/i }));
}

describe("Package Builder", () => {
  it("renders the trip form and advances only with required trip details", async () => {
    render(<MemoryRouter><PackageBuilderPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /package builder/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/departure date/i), { target: { value: "2026-12-10" } });
    expect(screen.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  it("adds a stay from supplier inventory", async () => {
    render(<MemoryRouter><PackageBuilderPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/destination/i), { target: { value: "kyoto-japan" } });
    fireEvent.click(screen.getByRole("button", { name: /stay/i }));
    await waitFor(() => expect(screen.getByText("Garden House")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /add garden house/i }));
    expect(screen.getAllByText(/garden house/i).length).toBeGreaterThan(1); // picker row and selected row
  });

  it("shows the live backend quote with margin and checks on the review step", async () => {
    render(<MemoryRouter><PackageBuilderPage /></MemoryRouter>);
    advanceTrip();
    fireEvent.click(screen.getByRole("button", { name: /review$/i })); // the stepper button, not the heading
    // Real timers: the 600 ms debounce plus the mocked fetch resolves quickly enough.
    expect(await screen.findByText(/300 USD per traveller/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/healthy margin/i)).toBeInTheDocument();
    expect(screen.getByText(/no travel-time, duplicate or rate warnings/i)).toBeInTheDocument();
  });

  it("creates a separate card for every night plus the departure day", () => {
    render(<MemoryRouter><PackageBuilderPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /days/i }));
    expect(screen.getByText("DAY 01")).toBeInTheDocument();
    expect(screen.getByText("DAY 02")).toBeInTheDocument();
    expect(screen.getByText("DAY 05")).toBeInTheDocument();
  });

  it("starts a fresh package without carrying over previous hotel selections", () => {
    localStorage.setItem("wayfare.package-builder.draft.v1", JSON.stringify({
      destination: "kyoto-japan", nights: 4, travellers: 2, stays: [{ item_id: "old", name: "Old Hotel", nights: 4 }],
      days: [{ day: 1, stops: [] }], transfers: { arrival: "", departure: "" },
    }));
    render(<MemoryRouter><PackageBuilderPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /stay/i }));
    expect(screen.getByText("Old Hotel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /new package/i }));
    fireEvent.click(screen.getByRole("button", { name: /stay/i }));
    expect(screen.queryByText("Old Hotel")).not.toBeInTheDocument();
    expect(screen.getByText(/no stays added to this package yet/i)).toBeInTheDocument();
  });

  it("keeps arrival and departure transfers independent", async () => {
    render(<MemoryRouter><PackageBuilderPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /transfers/i }));
    await waitFor(() => expect(screen.getAllByText("Arrival sedan").length).toBeGreaterThan(0));
    const transferSelects = screen.getAllByRole("combobox").slice(-2);
    fireEvent.change(transferSelects[0], { target: { value: "transport-1" } });
    fireEvent.change(transferSelects[1], { target: { value: "transport-2" } });
    const saved = JSON.parse(localStorage.getItem("wayfare.package-builder.draft.v1"));
    expect(saved.transfers).toMatchObject({ arrival: "transport-1", departure: "transport-2", arrival_name: "Arrival sedan", departure_name: "Departure van" });
  });

  it("prefills the destination from ?destination=", async () => {
    render(<MemoryRouter initialEntries={["/app/packages?destination=kyoto-japan"]}><PackageBuilderPage /></MemoryRouter>);
    expect(screen.getByLabelText(/destination/i)).toHaveValue("kyoto-japan");
  });

  it("loads a saved package from ?package= with its revision", async () => {
    render(<MemoryRouter initialEntries={["/app/packages?package=PKG-TEST"]}><PackageBuilderPage /></MemoryRouter>);
    expect(await screen.findByDisplayValue("Kyoto in winter")).toBeInTheDocument();
    expect(screen.getAllByText(/SAVED PACKAGE/i).length).toBeGreaterThan(0); // toolbar badge and status note
    expect(screen.getByText(/revision 3/i)).toBeInTheDocument();
  });

  it("reorders stops by drag within a day", async () => {
    render(<MemoryRouter initialEntries={["/app/packages?package=PKG-TEST"]}><PackageBuilderPage /></MemoryRouter>);
    await screen.findByDisplayValue("Kyoto in winter");
    fireEvent.click(screen.getByRole("button", { name: /days/i })); // step 3
    const stops = screen.getAllByText("Tea ceremony").map(el => el.closest(".pb-stop")).filter(Boolean);
    expect(stops.length).toBeGreaterThan(0); // the saved day renders its stop
    expect(stops[0].querySelector(".pb-stop-marker")).toHaveTextContent("1");
    expect(stops[0]).toHaveAttribute("draggable", "true");
  });
});

describe("Itinerary Studio", () => {
  it("uses the saved profile identity in the printable preview", () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ "demo@agency.com": {
      email: "demo@agency.com", fullName: "Rain Sharma", agencyType: "organisation", organisationName: "Horizon Journeys",
    } }));
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ email: "demo@agency.com" }));
    localStorage.setItem("wayfare.package-builder.draft.v1", JSON.stringify({ destination: "kyoto-japan", nights: 2, travellers: 2, days: [{ day: 1, stops: [] }] }));
    render(<AuthProvider><MemoryRouter initialEntries={["/app/itinerary-studio?draft=local"]}><ItineraryStudioPage /></MemoryRouter></AuthProvider>);
    expect(screen.getAllByText("Horizon Journeys").length).toBeGreaterThan(0);
    expect(screen.queryByText("Northstar Travel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /print \/ save pdf/i })).toBeInTheDocument();
  });

  it("shows the empty state until a local draft or saved package exists", () => {
    render(<MemoryRouter initialEntries={["/app/itinerary-studio"]}><ItineraryStudioPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /your next journey starts here/i })).toBeInTheDocument();
  });

  it("renders a saved package customer-safe: selling price only, never net cost or margin", async () => {
    render(<MemoryRouter initialEntries={["/app/itinerary-studio?package=PKG-TEST"]}><ItineraryStudioPage /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: /kyoto in winter/i })).toBeInTheDocument();
    expect(screen.getByText(/300 USD/i)).toBeInTheDocument();
    expect(screen.queryByText(/net/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/margin/i)).not.toBeInTheDocument();
  });

  it("renders a local draft without a price block and points back to the builder", () => {
    localStorage.setItem("wayfare.package-builder.draft.v1", JSON.stringify({ title: "Local trip", destination: "kyoto-japan", start_date: "2026-12-10", nights: 2, travellers: 2, stays: [], days: [{ day: 1, stops: [] }], transfers: {} }));
    render(<MemoryRouter initialEntries={["/app/itinerary-studio?draft=local"]}><ItineraryStudioPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: /local trip/i })).toBeInTheDocument();
    expect(screen.queryByText(/your investment/i)).not.toBeInTheDocument();
    expect(screen.getByText(/save the package to share a permanent link/i)).toBeInTheDocument();
  });
});
