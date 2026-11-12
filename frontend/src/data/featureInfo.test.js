import { describe, expect, it } from "vitest";
import { featureInfo } from "./featureInfo.js";

describe("featureInfo optional actions", () => {
  it("allows AI Studio to render without a header action", () => {
    expect(featureInfo["/app/ai-studio"].action).toBeUndefined();
  });

  it("keeps the Inventory header action", () => {
    expect(featureInfo["/app/inventory"].action?.to).toBeTruthy();
    expect(featureInfo["/app/inventory"].action?.label).toBeTruthy();
  });
});
