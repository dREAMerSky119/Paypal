import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RelatedSpotsPage from "./RelatedSpotsPage.jsx";

const nearFixture = {
  destination: "dolomites-italy", mode: "near", count: 2, is_sample: true,
  anchor: { spot_id: "spot_001", name: "Lago di Braies", destination: "dolomites-italy" },
  results: [
    { spot_id: "spot_002", name: "Tre Cime di Lavaredo", destination: "dolomites-italy", category: "HIKING",
      location_label: "Sexten Dolomites", distance_km: 18.6, travel_min: 32, score: 0.05,
      reason: "18.6 km away · about 32 min by road", is_sample: true,
      attribution: [{ source: "Wikipedia", title: "Tre Cime di Lavaredo", licence: "CC BY-SA 4.0", url: "https://en.wikipedia.org/wiki/Tre_Cime_di_Lavaredo", credit: "Wikipedia contributors" }] },
    { spot_id: "spot_003", name: "Alpe di Siusi", destination: "dolomites-italy", category: "OUTDOORS",
      location_label: "South Tyrol", distance_km: 52.4, travel_min: 90, score: 0.02,
      reason: "52.4 km away · about 90 min by road", is_sample: true, attribution: [] },
  ],
};

vi.mock("../lib/api.js", () => ({
  api: vi.fn(async (path) => {
    if (path.startsWith("/spots/related")) return nearFixture;
    throw new Error(`Unexpected api call: ${path}`);
  }),
}));

import { api } from "../lib/api.js";

function renderPage(initial = "/app/related-spots") {
  return render(<MemoryRouter initialEntries={[initial]}><RelatedSpotsPage /></MemoryRouter>);
}

beforeEach(() => { api.mockClear(); });

describe("RelatedSpotsPage", () => {
  it("renders live API results with distance reasons and attribution", async () => {
    renderPage();
    expect(await screen.findByText("Tre Cime di Lavaredo")).toBeInTheDocument();
    expect(screen.getByText(/18.6 km away/i)).toBeInTheDocument();
    const credit = screen.getByRole("link", { name: /wikipedia contributors/i });
    expect(credit).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Tre_Cime_di_Lavaredo");
    expect(screen.getByText(/CC BY-SA 4.0/i)).toBeInTheDocument();
  });

  it("sends the destination and mode, and re-queries when the mode changes", async () => {
    renderPage();
    await screen.findByText("Tre Cime di Lavaredo");
    expect(api).toHaveBeenCalledWith(
      expect.stringContaining("/spots/related?destination=dolomites-italy&mode=near"),
      expect.anything(), // useApi passes its AbortController signal
    );
    fireEvent.click(screen.getByRole("tab", { name: /same day/i }));
    await waitFor(() => expect(api).toHaveBeenCalledWith(
      expect.stringContaining("mode=day"), expect.anything()));
  });

  it("prefills the anchor from ?item= and the destination from ?destination=", () => {
    renderPage("/app/related-spots?destination=kyoto-japan&item=Fushimi%20Inari%20Shrine");
    expect(screen.getByLabelText(/anchor spot/i)).toHaveValue("Fushimi Inari Shrine");
    expect(screen.getByLabelText(/destination/i)).toHaveValue("kyoto-japan");
  });

  it("keeps the curated fallback section with its sample-data warning", async () => {
    renderPage();
    expect(await screen.findByText("Related destinations")).toBeInTheDocument();
    expect(screen.getByText(/curated fallback/i)).toBeInTheDocument();
    expect(screen.getAllByText(/sample data/i).length).toBeGreaterThan(0);
  });

  it("shows the attribution and sample-data disclaimer footer", async () => {
    renderPage();
    await screen.findByText("Tre Cime di Lavaredo");
    expect(screen.getByText(/Wikipedia and Wikivoyage under CC BY-SA/i)).toBeInTheDocument();
  });
});
