import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AttributionPage from "./AttributionPage.jsx";
import SampleDataBanner from "./SampleDataBanner.jsx";
import { usedSources, notUsedYet } from "../data/attribution.js";

describe("attribution page", () => {
  it("lists every used source with its licence and an external link", () => {
    render(<MemoryRouter><AttributionPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/sources and attribution/i);
    const table = screen.getByRole("table");
    for (const s of usedSources) {
      const row = within(table).getByRole("link", { name: s.name }).closest("tr");
      expect(row).toHaveTextContent(s.licence);
      expect(within(row).getByRole("link", { name: s.name })).toHaveAttribute("href", s.url);
    }
  });

  it("credits the sources the plan requires", () => {
    render(<MemoryRouter><AttributionPage /></MemoryRouter>);
    for (const name of [/openstreetmap/i, /wikipedia/i, /wikivoyage/i, /overture/i, /uk government ghg/i, /ecb/i]) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
  });

  it("does not claim sources that nothing uses", () => {
    expect(usedSources.map((s) => s.name)).not.toEqual(expect.arrayContaining(["Inside Airbnb"]));
    expect(notUsedYet.map((s) => s.name)).toEqual(expect.arrayContaining(["Inside Airbnb", "Open-Meteo", "World Bank indicators"]));
  });
});

describe("sample data banner", () => {
  it("says the data is sample and links to attribution", () => {
    render(<MemoryRouter><SampleDataBanner /></MemoryRouter>);
    const note = screen.getByTestId("sample-data-banner");
    expect(note).toHaveTextContent(/sample data/i);
    expect(within(note).getByRole("link", { name: /attribution/i })).toHaveAttribute("href", "/attribution");
  });
});
