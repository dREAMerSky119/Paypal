import { describe, expect, it } from "vitest";
import { addDays, formatEyebrowDate, formatShortDate, greeting, pad2 } from "./format.js";

describe("format", () => {
  it("builds the eyebrow date from the given date, not a constant", () => {
    expect(formatEyebrowDate(new Date(2026, 10, 9))).toBe("MONDAY, 9 NOVEMBER 2026");
    expect(formatEyebrowDate(new Date(2027, 0, 1))).toBe("FRIDAY, 1 JANUARY 2027");
  });
  it("formats short dates and adds days across month ends", () => {
    expect(formatShortDate(new Date(2026, 8, 4))).toBe("04 Sep 2026");
    expect(formatShortDate(addDays(new Date(2026, 10, 28), 5))).toBe("03 Dec 2026");
  });
  it("greets by hour", () => {
    expect([greeting(5), greeting(12), greeting(17), greeting(18), greeting(23)]).toEqual([
      "Good morning", "Good afternoon", "Good afternoon", "Good evening", "Good evening",
    ]);
  });
  it("pads numbers", () => { expect(pad2(1)).toBe("01"); expect(pad2(12)).toBe("12"); });
});
