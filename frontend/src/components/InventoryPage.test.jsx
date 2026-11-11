import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppRoutes } from "../App.jsx";
import { AuthProvider } from "../context/AuthContext.jsx";
import { seedDemoSession } from "../test/demoSession.js";
import { PROFILE_STORAGE_KEY } from "../lib/profileStorage.js";

const mk = (n, over = {}) => ({
  id: `item_${n}`, name: `Sample Stay ${n}`, supplier_name: `Supplier ${n}`, destination: "kyoto-japan",
  type: "stay", tier: "mid", currency: "JPY", base_net_price: 12000, base_net_price_usd: 80, unit: "per_room_night",
  capacity: 2, markup_pct: 16, lat: 35, lon: 135, responsible: { locality: "Gion" }, ...over,
});
const listBody = (items, over = {}) => ({ count: items.length, page: 1, page_size: 25, pages: 1, items, is_sample: true, ...over });
const rates = { item_id: "item_1", currency: "JPY", unit: "per_room_night", count: 2, is_sample: true,
  rates: [{ period: "2026-01", date: "2026-01-01", net_price: 11000, net_price_usd: 73 }, { period: "2026-02", date: "2026-02-01", net_price: 12500, net_price_usd: 83 }] };

let calls;
function mockApi(handler) {
  calls = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const u = new URL(String(url));
    calls.push(u.pathname + u.search);
    const out = handler(u);
    return new Response(JSON.stringify(out.body ?? out), { status: out.status ?? 200 });
  });
}

function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname + l.search}</output>; }
function visit(url, shouldSeed = true) {
  if (shouldSeed) seedDemoSession();
  return render(<AuthProvider><MotionConfig reducedMotion="always"><MemoryRouter initialEntries={[url]}><AppRoutes /><Where /></MemoryRouter></MotionConfig></AuthProvider>);
}
const where = () => screen.getByTestId("where").textContent;

beforeEach(() => vi.restoreAllMocks());

describe("InventoryPage", () => {
  it("lists results, labels the data as sample, and shows the attribution", async () => {
    mockApi(() => listBody([mk(1), mk(2)]));
    visit("/app/inventory");
    expect(await screen.findByRole("button", { name: "Sample Stay 1" })).toBeInTheDocument();
    expect(screen.getByText("2 results")).toBeInTheDocument();
    expect(screen.getAllByText(/sample data/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/OpenStreetMap/)).toBeInTheDocument();
  });

  it("reads filters from the URL and sends them to the API", async () => {
    mockApi(() => listBody([mk(1)]));
    visit("/app/inventory?destination=kyoto-japan&type=stay&tier=mid&band=30_75&q=gion&sort=price_desc&page=2");
    await screen.findByRole("button", { name: "Sample Stay 1" });
    const q = new URLSearchParams(calls.find((c) => c.startsWith("/api/inventory?")).split("?")[1]);
    expect(Object.fromEntries(q)).toMatchObject({ destination: "kyoto-japan", type: "stay", tier: "mid", price_band: "30_75", q: "gion", sort: "price_desc", page: "2", page_size: "25" });
    expect(screen.getByRole("tab", { name: /stays/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Sort")).toHaveValue("price_desc");
  });

  it("writes filter changes to the URL and returns to page 1", async () => {
    mockApi(() => listBody([mk(1)], { pages: 3, count: 60 }));
    visit("/app/inventory?page=3");
    await screen.findByRole("button", { name: "Sample Stay 1" });
    fireEvent.change(screen.getByLabelText("Tier"), { target: { value: "luxury" } });
    await waitFor(() => expect(where()).toBe("/app/inventory?tier=luxury"));
  });

  it("browses categories from the same filtered inventory and keeps accurate server counts", async () => {
    mockApi((u) => {
      const type = u.searchParams.get("type") || "all";
      const counts = { all: 9, stay: 3, guide: 2, transport: 1, experience: 3 };
      return listBody(type === "stay" ? [mk(1)] : [], { count: counts[type], pages: 1 });
    });
    visit("/app/inventory?destination=kyoto-japan&tier=mid&q=local");
    await waitFor(() => expect(screen.getByRole("tab", { name: /transport/i })).toHaveTextContent("1"));
    expect(screen.getByRole("tab", { name: /all/i })).toHaveTextContent("9");
    expect(screen.getByRole("tab", { name: /guides/i })).toHaveTextContent("2");
    fireEvent.click(screen.getByRole("tab", { name: /transport/i }));
    await waitFor(() => expect(where()).toContain("type=transport"));
    const query = new URLSearchParams(calls.find((call) => call.includes("type=transport"))?.split("?")[1]);
    expect(Object.fromEntries(query)).toMatchObject({ destination: "kyoto-japan", type: "transport", tier: "mid", q: "local" });
  });

  it("converts prices into the preferred display currency at the shared exchange rate", async () => {
    seedDemoSession();
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({ "demo@agency.com": { email: "demo@agency.com", fullName: "Rain Sharma", nationality: "Indian", preferredCurrency: "INR", designation: "Designer" } }));
    mockApi(() => listBody([mk(1, { currency: "EUR", base_net_price: 75, base_net_price_usd: 80 })]));
    visit("/app/inventory", false);
    await screen.findByRole("button", { name: "Sample Stay 1" });
    expect(screen.getByText("Preferred display price")).toBeInTheDocument();
    // USD reference 80 x reference rate 88 INR/USD, labelled as a reference (not live) rate.
    expect(screen.getByText("INR 7,040")).toBeInTheDocument();
    expect(screen.getByText(/converted at reference rate/i)).toBeInTheDocument();
    expect(screen.getByText(/USD 80/)).toBeInTheDocument();
  });

  it("debounces search typing", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockApi(() => listBody([mk(1)]));
      visit("/app/inventory");
      await screen.findByRole("button", { name: "Sample Stay 1" });
      const input = screen.getByRole("searchbox");
      fireEvent.change(input, { target: { value: "r" } });
      fireEvent.change(input, { target: { value: "riad" } });
      expect(where()).toBe("/app/inventory");
      await vi.advanceTimersByTimeAsync(350);
      await waitFor(() => expect(where()).toBe("/app/inventory?q=riad"));
      expect(calls.filter((c) => c.includes("q=")).every((c) => c.includes("q=riad"))).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("pages forward and keeps filters", async () => {
    mockApi(() => listBody([mk(1)], { pages: 2, count: 30 }));
    visit("/app/inventory?type=stay");
    await screen.findByRole("button", { name: "Sample Stay 1" });
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(where()).toBe("/app/inventory?type=stay&page=2"));
  });

  it("shows an empty state with a working clear button", async () => {
    mockApi(() => listBody([]));
    visit("/app/inventory?type=guide");
    expect(await screen.findByText(/nothing matches/i)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /clear filters/i })[0]);
    await waitFor(() => expect(where()).toBe("/app/inventory"));
  });

  it("shows an error state with retry", async () => {
    mockApi(() => ({ status: 500, body: { detail: "boom" } }));
    visit("/app/inventory");
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load inventory/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("opens the item drawer from a row and closes it with Escape, keeping the page", async () => {
    mockApi((u) => u.pathname.endsWith("/rates") ? rates : u.pathname === "/api/inventory/item_1" ? mk(1, { id: "item_1" }) : listBody([mk(1, { id: "item_1" })], { pages: 2, count: 30, page: 2 }));
    visit("/app/inventory?page=2");
    fireEvent.click(await screen.findByRole("button", { name: "Sample Stay 1" }));
    const dialog = await screen.findByRole("dialog");
    expect(where()).toBe("/app/inventory?page=2&item=item_1");
    expect(await within(dialog).findByText("Margin")).toBeInTheDocument();
    expect(within(dialog).getByText(/not yet scanned/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /close details/i })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(where()).toBe("/app/inventory?page=2");
  });

  it("deep-links straight into a drawer and exposes rates as a table", async () => {
    mockApi((u) => u.pathname.endsWith("/rates") ? rates : u.pathname === "/api/inventory/item_1" ? mk(1, { id: "item_1" }) : listBody([]));
    visit("/app/inventory?item=item_1");
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(await within(dialog).findByText("View as table"));
    expect(within(dialog).getByRole("row", { name: /Jan 2026/ })).toBeInTheDocument();
  });
});
