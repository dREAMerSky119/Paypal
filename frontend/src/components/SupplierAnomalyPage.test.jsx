import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import SupplierAnomalyPage from "./SupplierAnomalyPage.jsx";

const feed = {
  count: 2, open_count: 2, page: 1, page_size: 20, pages: 1, is_sample: true,
  severities: { high: 1, medium: 1, low: 0 }, by_kind: { rate: 2, text: 0, supplier: 0 },
  items: [
    {
      key: "rate:item_0004:2027-11", kind: "rate", severity: "high",
      item_id: "item_0004", item_name: "Ortisei Guesthouse – double room",
      destination: "dolomites-italy", tier: "budget", category: "double_room",
      period: "2027-11", price_usd: 984.6, expected_usd: 98.46, ratio: 10.0,
      layers: ["rule", "statistical"], codes: ["ten_x", "peer_z_outlier"],
      explanation: "It reads 10.0 times the peer median: one decimal place too far.",
      findings: [
        { layer: "rule", code: "ten_x", severity: "high", detail: "It reads 10.0 times the peer median." },
        { layer: "statistical", code: "peer_z_outlier", severity: "medium", detail: "It sits 7.2 robust deviations above." },
      ],
      resolved: false, resolution: null,
    },
    {
      key: "supplier:sup_003:sup_004", kind: "supplier", severity: "medium",
      item_id: null, item_name: "Ortisei Rifugio Or Lodge · Sample 03", period: null,
      price_usd: null, expected_usd: null, ratio: null, layers: ["text"],
      codes: ["duplicate_supplier"],
      explanation: "'A' and 'B' are the same supplier recorded twice.",
      findings: [{ layer: "text", code: "duplicate_supplier", severity: "medium", detail: "twice" }],
      resolved: false, resolution: null,
    },
  ],
};

const summary = { open: 2, resolved: 0, high: 1, medium: 1, low: 0,
  by_kind: { rate: 2, text: 0, supplier: 0 }, is_sample: true };

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const path = String(url);
    const body = path.includes("/anomalies/summary") ? summary
      : path.includes("/anomalies") ? feed : {};
    return new Response(JSON.stringify(body), { status: 200 });
  });
});

function visit(path = "/app/anomalies") {
  return render(<MotionConfig reducedMotion="always"><MemoryRouter initialEntries={[path]}>
    <SupplierAnomalyPage /></MemoryRouter></MotionConfig>);
}

describe("Anomaly watch", () => {
  it("renders the page heading, the open count and both anomalies", async () => {
    visit();
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/anomaly watch/i);

    const table = await screen.findByRole("table");
    expect(within(table).getByText(/Ortisei Guesthouse/)).toBeInTheDocument();
    expect(within(table).getByText(/Sample 03/)).toBeInTheDocument();
    // Readable signal names, not raw codes.
    expect(within(table).getByTitle("ten_x")).toHaveTextContent("10× peers");
    // The ratio column is formatted, not raw JSON.
    expect(within(table).getByText("10.00×")).toBeInTheDocument();
    expect(within(table).getByText(/High/)).toBeInTheDocument();
    // The ratio column reads as a formatted ratio, and the expected price as money.
    expect(table.textContent).toContain("10.00");
    // formatMoney renders the ISO code ("USD 98.46"), not a symbol.
    expect(table.textContent).toMatch(/USD\s?98\.46/);
    // The headline reads "open 2 flags" (the count sits between the two words).
    expect(await screen.findByText(/open\s+2\s+flags/i)).toBeInTheDocument();
  });

  it("shows the sample-data banner and the open scan button", async () => {
    visit();
    expect(await screen.findByText(/Sample data/)).toBeInTheDocument();
    const scan = await screen.findByRole("button", { name: /scan now/i });
    expect(scan).toBeEnabled();
  });

  it("says what the three layers are, so the number is not taken on trust", async () => {
    visit();
    const note = await screen.findByText(/Detection runs in three layers/i);
    expect(note).toHaveTextContent(/MAD z-score/);
    expect(note).toHaveTextContent(/Isolation Forest/);
    expect(note).toHaveTextContent(/Importing a CSV runs the same scan/i);
  });
});
