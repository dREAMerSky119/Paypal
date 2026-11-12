import { describe, expect, it } from "vitest";
import { trendGeometry } from "./chart.js";

describe("trendGeometry", () => {
  it("matches the original 40/30/20/10 axis for the sample series", () => {
    expect(trendGeometry([14, 17, 22, 21, 28, 33]).ticks).toEqual([40, 30, 20, 10]);
  });
  it("starts at the left edge and closes the area to the baseline", () => {
    const { line, area } = trendGeometry([10, 20], { width: 100, height: 50 });
    expect(line.startsWith("M0 ")).toBe(true);
    expect(area.endsWith("V50 H0Z")).toBe(true);
  });
  it("never leaves the chart box", () => {
    const { line } = trendGeometry([0, 40, 5, 33], { width: 280, height: 120 });
    const nums = line.match(/-?\d+(\.\d+)?/g).map(Number);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...nums)).toBeLessThanOrEqual(280);
  });
  it("handles empty and single-point input", () => {
    expect(trendGeometry([])).toEqual({ line: "", area: "", ticks: [] });
    expect(trendGeometry([5]).line.startsWith("M0 ")).toBe(true);
  });
});
