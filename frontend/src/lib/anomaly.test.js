import { describe, expect, it } from "vitest";
import {
  CODE_LABELS, FILTER_DEFAULTS, anomalyPath, apiQuery, filtersFromParams,
  flagLabel, paramsFromFilters, plural, worstSeverity,
} from "./anomaly.js";

describe("anomaly filter helpers", () => {
  it("reads filters out of a URL, ignoring junk", () => {
    const filters = filtersFromParams(new URLSearchParams(
      "severity=high&kind=rate&status=resolved&q=kyoto&page=3&item=rate%3Aitem_0004%3A2025-07"));
    expect(filters).toMatchObject({
      severity: "high", kind: "rate", status: "resolved", q: "kyoto", page: 3,
      item: "rate:item_0004:2025-07",
    });
  });

  it("falls back to the defaults for unknown values", () => {
    const filters = filtersFromParams(new URLSearchParams("severity=apocalyptic&kind=nonsense&status=maybe&page=0"));
    expect(filters).toMatchObject(FILTER_DEFAULTS);
  });

  it("writes a short URL, leaving the defaults out", () => {
    expect(paramsFromFilters({ status: "open", page: 1 }).toString()).toBe("");
    const params = paramsFromFilters({ severity: "high", status: "all", page: 2, q: "braies" });
    expect(params.get("severity")).toBe("high");
    expect(params.get("status")).toBe("all");
    expect(params.get("page")).toBe("2");
    expect(params.get("kind")).toBeNull();
  });

  it("builds the backend query with paging", () => {
    const query = new URLSearchParams(apiQuery({ status: "open", page: 2 }, { pageSize: 20 }));
    expect(query.get("status")).toBe("open");
    expect(query.get("page")).toBe("2");
    expect(query.get("page_size")).toBe("20");
    expect(query.get("severity")).toBeNull();
  });

  it("round-trips filters through the URL", () => {
    const filters = { severity: "medium", kind: "text", status: "open", q: "", page: 1, item: "" };
    expect(filtersFromParams(paramsFromFilters(filters))).toMatchObject(filters);
  });
});

describe("anomaly display helpers", () => {
  it("encodes the colon in an anomaly key", () => {
    expect(anomalyPath("rate:item_0004:2025-07"))
      .toBe("/anomalies/rate%3Aitem_0004%3A2025-07/resolve");
    expect(anomalyPath("text:spot:spot_001", "reopen"))
      .toBe("/anomalies/text%3Aspot%3Aspot_001/reopen");
  });

  it("labels flags with readable codes, not machine names", () => {
    const flag = { count: 2, severity: "high", codes: ["zero_price", "digit_too_many"] };
    expect(flagLabel(flag)).toBe("Zero price · Extra digit");
    expect(flagLabel({ count: 1, codes: [] })).toBe("1 flag");
    expect(flagLabel(null)).toBe("");
    expect(CODE_LABELS.currency_slip).toBe("Currency slip");
  });

  it("counts in words", () => {
    expect(plural(1, "flag")).toBe("1 flag");
    expect(plural(4, "flag")).toBe("4 flags");
    expect(plural(2, "match", "matches")).toBe("2 matches");
  });

  it("picks the worst severity present", () => {
    expect(worstSeverity(["low", "high"])).toBe("high");
    expect(worstSeverity(["medium", "low"])).toBe("medium");
    expect(worstSeverity([])).toBeNull();
  });
});
