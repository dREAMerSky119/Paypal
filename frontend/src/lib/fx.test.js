import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  REFERENCE_PER_USD, convertAmount, formatDisplay, formatDisplayCompact, formatDisplayWhole,
  getFxState, parseLiveRates, refreshRates, setDisplayCurrency,
} from "./fx.js";
import { displayPrice } from "./currency.js";

const livePayload = (overrides = {}) => ({
  result: "success", time_last_update_unix: 1_790_000_000,
  rates: { ...REFERENCE_PER_USD, INR: 90, EUR: 0.9, ...overrides },
});
const memoryStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

beforeEach(() => setDisplayCurrency("USD"));

describe("convertAmount", () => {
  it("converts through USD in either direction", () => {
    expect(convertAmount(100, "USD", "INR")).toBeCloseTo(8800);
    expect(convertAmount(8800, "INR", "USD")).toBeCloseTo(100);
    expect(convertAmount(150, "JPY", "EUR")).toBeCloseTo(0.92);
  });
  it("is the identity for the same currency and returns null for unknown codes or bad input", () => {
    expect(convertAmount(42, "EUR", "EUR")).toBe(42);
    expect(convertAmount(10, "USD", "XXX")).toBeNull();
    expect(convertAmount("abc", "USD", "INR")).toBeNull();
    expect(convertAmount(null, "USD", "INR")).toBeNull();
  });
  it("covers every currency offered in the profile", () => {
    for (const code of Object.keys(REFERENCE_PER_USD)) expect(convertAmount(1, "USD", code)).toBeGreaterThan(0);
  });
});

describe("display formatting", () => {
  it("leaves USD output unchanged", () => {
    expect(formatDisplay(1200, "USD")).toBe("USD 1,200");
    expect(formatDisplayWhole(1234.5, "USD")).toBe("$1,235");
    expect(formatDisplayCompact(2500, "USD")).toBe("$2.5k");
    expect(formatDisplayCompact(3_400_000, "USD")).toBe("$3.4M");
  });
  it("converts into the preferred currency", () => {
    setDisplayCurrency("INR");
    expect(formatDisplay(100, "USD")).toBe("INR 8,800");
    expect(formatDisplayWhole(100, "USD")).toContain("8,800");
    expect(formatDisplayCompact(1000, "USD")).toMatch(/88(\.0)?K/);
  });
  it("falls back to the source currency rather than inventing a figure", () => {
    setDisplayCurrency("INR");
    expect(formatDisplay(50, "XXX")).toContain("50");
    expect(formatDisplay(50, "XXX")).not.toContain("INR");
  });
  it("ignores unsupported preferred currencies", () => {
    setDisplayCurrency("INR");
    setDisplayCurrency("ZZZ");
    expect(getFxState().target).toBe("USD");
  });
});

describe("displayPrice with rates", () => {
  const base = { amount: 75, sourceCurrency: "EUR", usdReference: 80, displayCurrency: "INR" };
  it("converts via the USD reference when rates are provided", () => {
    expect(displayPrice({ ...base, rates: REFERENCE_PER_USD })).toMatchObject({ amount: 7040, currency: "INR", converted: true, note: expect.stringContaining("converted at") });
  });
  it("still reports unavailable without rates", () => {
    expect(displayPrice(base)).toMatchObject({ amount: 75, currency: "EUR", converted: false });
  });
  it("converts USD-sourced prices and prefers native conversion when no reference exists", () => {
    expect(displayPrice({ amount: 10, sourceCurrency: "USD", displayCurrency: "JPY", rates: REFERENCE_PER_USD }).amount).toBeCloseTo(1500);
    expect(displayPrice({ amount: 150, sourceCurrency: "JPY", displayCurrency: "EUR", rates: REFERENCE_PER_USD }).amount).toBeCloseTo(0.92);
  });
});

describe("live rates", () => {
  it("rejects incomplete or failed payloads", () => {
    expect(parseLiveRates({ result: "error" })).toBeNull();
    const partial = livePayload(); delete partial.rates.INR;
    expect(parseLiveRates(partial)).toBeNull();
    expect(parseLiveRates(livePayload({ INR: -1 }))).toBeNull();
  });
  it("applies and caches a good response, then reuses the fresh cache without refetching", async () => {
    const storage = memoryStorage();
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => livePayload() });
    expect(await refreshRates({ fetchImpl, storage, now: 1_000 })).toBe(true);
    expect(getFxState()).toMatchObject({ source: "live" });
    expect(convertAmount(100, "USD", "INR", getFxState().rates)).toBeCloseTo(9000);
    await refreshRates({ fetchImpl, storage, now: 2_000 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("keeps working when the network fails", async () => {
    const before = getFxState().rates;
    const ok = await refreshRates({ fetchImpl: vi.fn().mockRejectedValue(new Error("offline")), storage: memoryStorage(), now: 5e12 });
    expect(ok).toBe(false);
    expect(getFxState().rates).toBe(before);
  });
});
