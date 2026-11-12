import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { AppRoutes } from "./App.jsx";
import { destinations } from "./data/destinations.js";
import { featureInfo } from "./data/featureInfo.js";

const overviewFixture = {
  is_sample: true,
  metrics: [
    { key: "gbv", label: "Gross booking value", value: "$1", change: "1%", detail: "d" },
    { key: "itineraries", label: "Active itineraries", value: "2", change: "1%", detail: "d" },
    { key: "margin", label: "Avg. gross margin", value: "3%", change: "1%", detail: "d" },
    { key: "suppliers", label: "Supplier partners", value: "4", change: "1", detail: "d" },
  ],
  journeys: [{ id: "PKG-1", package_id: "PKG-1", place: "Test Journey", destination: "kyoto-japan", start_date: "2026-12-10", travellers: 2, status: "Deposit paid", tone: "sage" }],
  trend: { labels: ["A", "B"], values: [10, 20], summary_value: "+1%", summary_text: "t", footnote: "f" },
  responsible_note: "note",
};

function visit(path) {
  return render(<MotionConfig reducedMotion="always"><MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter></MotionConfig>);
}

const inventoryFixture = { count: 0, page: 1, page_size: 25, pages: 1, items: [], is_sample: true };

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const body = String(url).includes("/api/inventory") ? inventoryFixture : overviewFixture;
    return new Response(JSON.stringify(body), { status: 200 });
  });
});

const staticRoutes = [
  ["/", /welcome/i],
  ["/login", /welcome/i],
  ["/home", /thoughtfully/i],
  [`/destinations/${destinations[0].slug}`, new RegExp(destinations[0].name, "i")],
  ["/app", /good (morning|afternoon|evening)/i],
  ...Object.entries(featureInfo).map(([path, info]) => [path, new RegExp(info.title, "i")]),
];

describe("every route renders", () => {
  it.each(staticRoutes)("%s", async (path, heading) => {
    visit(path);
    const h1 = await screen.findByRole("heading", { level: 1 }, { timeout: 4000 });
    expect(h1).toHaveTextContent(heading);
  });

  it("unknown paths fall back to the login page", async () => {
    visit("/nope");
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/welcome/i);
  });

  it("every destination page renders without crashing", async () => {
    for (const d of destinations) {
      const { unmount } = visit(`/destinations/${d.slug}`);
      expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(d.name);
      unmount();
    }
  });

  it("Overview shows API data, a computed date and working controls", async () => {
    visit("/app");
    expect(await screen.findByText("Test Journey")).toBeInTheDocument();
    expect(screen.queryByText(/14 SEPTEMBER 2026/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create an itinerary/i })).toHaveAttribute("href", "/app/packages");
    expect(screen.getByRole("link", { name: /view all/i })).toHaveAttribute("href", "/app/packages");
    expect(screen.queryByText(/illustrative workspace preview/i)).not.toBeInTheDocument();
    expect(screen.getByText("Deposit paid")).toBeInTheDocument();
  });

  it("Overview shows a retryable error when the API is down", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { status: 500 }));
    visit("/app");
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load the overview/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("the bell opens the anomaly feed and the palette finds destinations", async () => {
    visit("/app");
    await screen.findByRole("heading", { level: 1 });
    // two links: the sidebar entry and the topbar bell; both must reach the feed
    const feedLinks = screen.getAllByRole("link", { name: /anomaly watch/i });
    expect(feedLinks.length).toBeGreaterThanOrEqual(2);
    feedLinks.forEach((link) => expect(link).toHaveAttribute("href", "/app/anomalies"));
    fireEvent.click(screen.getByRole("button", { name: /search anything/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "kyoto" } });
    expect(within(dialog).getByRole("option", { name: /kyoto, japan/i })).toBeInTheDocument();
  });

  it("no dead buttons remain in the workspace shell", async () => {
    visit("/app/inventory");
    await screen.findByRole("heading", { level: 1 });
    // the old workspace switcher and profile menu were buttons that did nothing
    expect(screen.queryByRole("button", { name: /northstar travel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /alex morgan/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/new workspace/i)).not.toBeInTheDocument();
  });
});
