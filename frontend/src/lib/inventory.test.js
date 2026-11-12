import { describe, expect, it } from "vitest";
import { apiQuery, filtersFromParams, hasActiveFilters, paramsFromFilters } from "./inventory.js";
import { formatMoney, formatPeriod } from "./format.js";

const parse = (s) => filtersFromParams(new URLSearchParams(s));

describe("filtersFromParams", () => {
  it("returns defaults for an empty URL", () => {
    expect(parse("")).toMatchObject({ destination: "", type: "", tier: "", band: "", q: "", sort: "name", page: 1, view: "table", item: "" });
  });
  it("ignores unknown enum values and bad pages", () => {
    const f = parse("type=spa&tier=gold&band=free&sort=random&page=-3&view=3d");
    expect(f).toMatchObject({ type: "", tier: "", band: "", sort: "name", page: 1, view: "table" });
    expect(parse("page=abc").page).toBe(1);
  });
  it("caps the search text length", () => {
    expect(parse(`q=${"x".repeat(300)}`).q).toHaveLength(100);
  });
});

describe("round trip", () => {
  it("omits defaults from the URL", () => {
    expect(paramsFromFilters(parse("")).toString()).toBe("");
  });
  it("keeps every active filter", () => {
    const url = "destination=kyoto-japan&type=stay&tier=mid&band=30_75&q=riad&sort=price_desc&page=2&view=map&item=item_0001";
    expect(Object.fromEntries(paramsFromFilters(parse(url)))).toEqual(Object.fromEntries(new URLSearchParams(url)));
  });
});

describe("apiQuery", () => {
  it("renames band to price_band and pages the list", () => {
    const q = new URLSearchParams(apiQuery(parse("band=30_75&type=guide&page=3")));
    expect(q.get("price_band")).toBe("30_75");
    expect(q.get("type")).toBe("guide");
    expect(q.get("page")).toBe("3");
    expect(q.get("page_size")).toBe("25");
  });
  it("leaves paging out for the map", () => {
    const q = new URLSearchParams(apiQuery(parse("tier=mid&page=3"), { paged: false }));
    expect([...q.keys()]).toEqual(["tier"]);
  });
});

describe("hasActiveFilters", () => {
  it("ignores sort, page and view", () => {
    expect(hasActiveFilters(parse("sort=price_asc&page=2&view=map"))).toBe(false);
    expect(hasActiveFilters(parse("q=a"))).toBe(true);
  });
});

describe("formatMoney / formatPeriod", () => {
  it("formats whole units for large amounts and cents for small", () => {
    expect(formatMoney(1200, "MAD")).toBe("MAD 1,200");
    expect(formatMoney(66.94, "EUR")).toBe("EUR 66.94");
  });
  it("survives missing values and invalid currency codes", () => {
    expect(formatMoney(null, "EUR")).toBe("—");
    expect(formatMoney(5, "??")).toContain("5");
  });
  it("formats periods", () => {
    expect(formatPeriod("2026-03")).toBe("Mar 2026");
    expect(formatPeriod("weird")).toBe("weird");
  });
});
