import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../context/AuthContext.jsx";
import { PROFILE_STORAGE_KEY, SESSION_STORAGE_KEY } from "../lib/profileStorage.js";
import { AppRoutes } from "../App.jsx";
import { seedDemoSession } from "../test/demoSession.js";
import PackageBuilderPage from "./PackageBuilderPage.jsx";
import ItineraryStudioPage from "./ItineraryStudioPage.jsx";

const inventoryFixture = { count: 4, page: 1, page_size: 100, pages: 1, is_sample: true, items: [
  { id:"stay-1", name:"Garden House", supplier_name:"Local host", destination:"kyoto-japan", type:"stay", unit:"per_room_night" },
  { id:"exp-1", name:"Tea ceremony", supplier_name:"Kyoto guide", destination:"kyoto-japan", type:"experience", unit:"per_person" },
  { id:"transport-1", name:"Arrival sedan", supplier_name:"Kyoto Cars", destination:"kyoto-japan", type:"transport", unit:"per_vehicle" },
  { id:"transport-2", name:"Departure van", supplier_name:"Kyoto Cars", destination:"kyoto-japan", type:"transport", unit:"per_vehicle" },
] };
const overviewFixture = { metrics: [], journeys: [], trend: { labels: [], values: [], summary_value: "", summary_text: "", footnote: "" }, responsible_note: "" };
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const path = String(url);
    const body = path.includes("/api/inventory") ? inventoryFixture : overviewFixture;
    return new Response(JSON.stringify(body), { status: 200 });
  });
});
afterEach(() => vi.restoreAllMocks());

describe("Package Builder", () => {
  it("renders the trip form and advances only with required trip details", () => {
    render(<MemoryRouter><PackageBuilderPage/></MemoryRouter>);
    expect(screen.getByRole("heading", { name:/package builder/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name:/continue/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/departure date/i), { target:{ value:"2026-12-10" } });
    expect(screen.getByRole("button", { name:/continue/i })).toBeEnabled();
  });

  it("creates a separate card for every night plus the departure day", () => {
    render(<MemoryRouter><PackageBuilderPage/></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name:/days/i }));
    expect(screen.getByText("DAY 01")).toBeInTheDocument();
    expect(screen.getByText("DAY 02")).toBeInTheDocument();
    expect(screen.getByText("DAY 05")).toBeInTheDocument();
  });

  it("starts a fresh package without carrying over previous hotel selections", () => {
    localStorage.setItem("wayfare.package-builder.draft.v1", JSON.stringify({
      destination:"kyoto-japan", nights:4, travellers:2, stays:[{ item_id:"old", name:"Old Hotel", nights:4 }],
      days:[{ day:1, stops:[] }], transfers:{ arrival:"", departure:"" }
    }));
    render(<MemoryRouter><PackageBuilderPage/></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name:/stay/i }));
    expect(screen.getByText("Old Hotel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name:/new package/i }));
    fireEvent.click(screen.getByRole("button", { name:/stay/i }));
    expect(screen.queryByText("Old Hotel")).not.toBeInTheDocument();
    expect(screen.getByText(/no stays added to this package yet/i)).toBeInTheDocument();
  });

  it("adds a stay from supplier inventory", async () => {
    render(<MemoryRouter><PackageBuilderPage/></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/destination/i), { target:{ value:"kyoto-japan" } });
    fireEvent.click(screen.getByRole("button", { name:/stay/i }));
    await waitFor(() => expect(screen.getByText("Garden House")).toBeInTheDocument());
    expect(globalThis.fetch.mock.calls.some(([url]) => String(url).includes("/api/inventory?destination=kyoto-japan"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name:/add garden house/i }));
    expect(screen.getAllByText(/garden house/i).length).toBeGreaterThan(0);
    await waitFor(() => expect(JSON.parse(localStorage.getItem("wayfare.package-builder.draft.v1")).stays[0].name).toBe("Garden House"));
  });

  it("keeps arrival and departure transfers independent", async () => {
    render(<MemoryRouter><PackageBuilderPage/></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name:/transfers/i }));
    await waitFor(() => expect(screen.getAllByText("Arrival sedan").length).toBeGreaterThan(0));
    const selects = screen.getAllByRole("combobox");
    const transferSelects = selects.slice(-2);
    fireEvent.change(transferSelects[0], { target:{ value:"transport-1" } });
    fireEvent.change(transferSelects[1], { target:{ value:"transport-2" } });
    expect(screen.getAllByText("Arrival sedan").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Departure van").length).toBeGreaterThan(0);
  });

  it("does not invent a quote in the review step", () => {
    render(<MemoryRouter><PackageBuilderPage/></MemoryRouter>);
    fireEvent.click(within(document.querySelector(".pb-steps")).getByRole("button", { name:/review/i }));
    expect(screen.getByText(/live package quote is not connected yet/i)).toBeInTheDocument();
  });
});

describe("Itinerary Studio", () => {
  it("shows the empty state until a local draft exists", () => {
    render(<AuthProvider><MemoryRouter initialEntries={["/app/itinerary-studio"]}><ItineraryStudioPage/></MemoryRouter></AuthProvider>);
    expect(screen.getByRole("heading", { name:/your next journey starts here/i })).toBeInTheDocument();
  });

  it("uses the saved profile identity in the printable preview", () => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ "demo@agency.com": {
      email: "demo@agency.com", fullName: "Rain Sharma", agencyType: "organisation", organisationName: "Horizon Journeys",
    } }));
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ email: "demo@agency.com" }));
    localStorage.setItem("wayfare.package-builder.draft.v1", JSON.stringify({ destination: "kyoto-japan", nights: 2, travellers: 2, days: [{ day: 1, stops: [] }] }));
    render(<AuthProvider><MemoryRouter initialEntries={["/app/itinerary-studio?draft=local"]}><ItineraryStudioPage/></MemoryRouter></AuthProvider>);
    expect(screen.getAllByText("Horizon Journeys").length).toBeGreaterThan(0);
    expect(screen.queryByText("Northstar Travel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /print \/ save pdf/i })).toBeInTheDocument();
  });
});

describe("Package Builder dashboard routes", () => {
  it("renders both real pages inside the authenticated dashboard and previews a saved local draft", async () => {
    seedDemoSession();
    render(<AuthProvider><MemoryRouter initialEntries={["/app/packages"]}><AppRoutes/></MemoryRouter></AuthProvider>);
    expect(await screen.findByRole("heading", { name:/package builder/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/package name/i), { target: { value: "Kyoto at an easy pace" } });
    fireEvent.click(screen.getAllByRole("link", { name:/preview itinerary/i })[0]);
    expect(await screen.findByRole("heading", { name:/itinerary studio/i })).toBeInTheDocument();
    expect(await screen.findByText("Kyoto at an easy pace")).toBeInTheDocument();
    expect(screen.getAllByText("Rain Sharma").length).toBeGreaterThan(0);
    expect(within(document.querySelector(".itinerary-paper")).queryByText(/net cost|profit|margin/i)).not.toBeInTheDocument();
  });
});
