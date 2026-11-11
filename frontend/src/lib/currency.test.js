import { describe, expect, it } from "vitest";
import { currencyForNationality, displayPrice, formatDisplayPrice } from "./currency.js";

describe("display currency selection", () => {
  it.each([["Indian", "INR"], ["India", "INR"], ["Japanese", "JPY"], ["Moroccan", "MAD"], ["Italian", "EUR"]])("maps %s to %s", (nationality, currency) => {
    expect(currencyForNationality(nationality)).toBe(currency);
  });

  it("uses the original quote when currencies match and the USD reference when requested", () => {
    expect(displayPrice({ amount: 100, sourceCurrency: "JPY", usdReference: 0.67, displayCurrency: "JPY" })).toMatchObject({ amount: 100, currency: "JPY", converted: false });
    expect(displayPrice({ amount: 100, sourceCurrency: "JPY", usdReference: 0.67, displayCurrency: "USD" })).toMatchObject({ amount: 0.67, currency: "USD", converted: true });
  });

  it("keeps the supplier currency and explains the missing FX conversion", () => {
    expect(formatDisplayPrice({ amount: 75, sourceCurrency: "EUR", usdReference: 80, displayCurrency: "INR" })).toMatchObject({ amount: 75, currency: "EUR", converted: false, note: expect.stringContaining("INR conversion unavailable"), formatted: expect.stringContaining("EUR") });
  });
});
