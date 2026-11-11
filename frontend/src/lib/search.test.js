import { describe, expect, it } from "vitest";
import { buildSearchIndex, searchIndex, inventoryResultsToItems } from "./search.js";

const index = buildSearchIndex({
  pages: [{ label: "Inventory", to: "/app/inventory" }, { label: "Anomaly watch", to: "/app/anomalies", keywords: "typo price" }],
  destinations: [
    { slug: "kyoto-japan", name: "Kyoto", country: "Japan", cardTitle: "Kyoto, Japan", type: "CULTURE & CRAFT", highlights: ["Temple gardens"] },
    { slug: "reykjavik", name: "Reykjavík", country: "Iceland", cardTitle: "Reykjavík, Iceland", type: "NORTH ATLANTIC", highlights: [] },
  ],
});

describe("searchIndex", () => {
  it("lists pages first when the query is empty", () => {
    expect(searchIndex(index, "")[0].label).toBe("Inventory");
  });
  it("ranks label prefix above keyword matches", () => {
    expect(searchIndex(index, "kyo")[0].to).toBe("/destinations/kyoto-japan");
  });
  it("matches without accents and by keywords", () => {
    expect(searchIndex(index, "reykjavik")[0].to).toBe("/destinations/reykjavik");
    expect(searchIndex(index, "typo")[0].to).toBe("/app/anomalies");
  });
  it("returns nothing for unknown terms and respects the limit", () => {
    expect(searchIndex(index, "zzz")).toEqual([]);
    expect(searchIndex(index, "", 2)).toHaveLength(2);
  });
});

describe("inventoryResultsToItems", () => {
  const data = { items: [{ id: "item_0001", name: "Ortisei Guesthouse – double room", supplier_name: "Ortisei Guesthouse", destination: "dolomites-italy" }] };
  it("links each row to the inventory drawer and names the destination", () => {
    const [row] = inventoryResultsToItems(data, [{ slug: "dolomites-italy", cardTitle: "Dolomites, Italy" }]);
    expect(row).toMatchObject({ type: "Inventory", label: "Ortisei Guesthouse – double room", to: "/app/inventory?item=item_0001" });
    expect(row.hint).toBe("Ortisei Guesthouse · Dolomites, Italy");
  });
  it("tolerates empty or missing data", () => {
    expect(inventoryResultsToItems(null)).toEqual([]);
    expect(inventoryResultsToItems({})).toEqual([]);
  });
});
