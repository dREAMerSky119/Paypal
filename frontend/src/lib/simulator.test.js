import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENARIO, addSaved, applicableEvents, buildRequest, cleanOverrides, decodeScenario, encodeScenario,
  eventTouchesWindow, fitScenario, formatMultiplier, formatPct, formatShare, formatSigned, loadSaved, maxMonthsFrom,
  persistSaved, presetToScenario, shiftMonth, tone, windowPeriods,
} from "./simulator.js";

const assumptions = {
  available_months: ["2026-11", "2026-12", "2027-01", "2027-02"],
  destinations: [
    { slug: "kyoto-japan", name: "Kyoto", country: "Japan" },
    { slug: "jaipur-india", name: "Jaipur", country: "India" },
  ],
  events: [
    { id: "e1", name: "Gion", type: "festival", destination: "kyoto-japan", country: "Japan", start: "2027-01-10", end: "2027-01-24" },
    { id: "e2", name: "Holi", type: "festival", destination: null, country: "India", start: "2026-12-30", end: "2027-01-02" },
    { id: "e3", name: "Old", type: "festival", destination: "kyoto-japan", country: "Japan", start: "2026-03-01", end: "2026-03-05" },
  ],
};

describe("formatting", () => {
  it("uses a real minus sign and avoids -0", () => {
    expect(formatPct(-20.11)).toBe("\u221220.1%");
    expect(formatPct(5)).toBe("+5.0%");
    expect(formatPct(-0.001)).toBe("0.0%");
    expect(formatPct(null)).toBe("\u2014");
    expect(formatPct(5, { sign: false })).toBe("5.0%");
  });
  it("formats shares, multipliers and signed values", () => {
    expect(formatShare(0.3279)).toBe("33%");
    expect(formatMultiplier(0.8316)).toBe("\u00d70.83");
    expect(formatSigned(-5)).toBe("\u22125");
    expect(formatSigned(20)).toBe("+20");
    expect(formatSigned(0)).toBe("0");
  });
  it("calls tiny moves flat", () => {
    expect(tone(0.01)).toBe("flat");
    expect(tone(3)).toBe("positive");
    expect(tone(-3)).toBe("negative");
    expect(tone(null)).toBe("flat");
  });
});

describe("months and events", () => {
  it("shifts across year ends", () => {
    expect(shiftMonth("2026-11", 3)).toBe("2027-02");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(windowPeriods("2026-12", 3)).toEqual(["2026-12", "2027-01", "2027-02"]);
  });
  it("limits the window to the forecast", () => {
    expect(maxMonthsFrom("2026-12", assumptions.available_months)).toBe(3);
    expect(maxMonthsFrom("1999-01", assumptions.available_months)).toBe(0);
  });
  it("detects event overlap with a window", () => {
    expect(eventTouchesWindow(assumptions.events[0], "2027-01", 1)).toBe(true);
    expect(eventTouchesWindow(assumptions.events[0], "2026-11", 2)).toBe(false);
    expect(eventTouchesWindow(assumptions.events[1], "2027-01", 1)).toBe(true); // spills over from December
  });
  it("lists events by destination and country, inside the window only", () => {
    expect(applicableEvents(assumptions, "kyoto-japan", "2026-11", 4).map((e) => e.id)).toEqual(["e1"]);
    expect(applicableEvents(assumptions, "jaipur-india", "2026-11", 4).map((e) => e.id)).toEqual(["e2"]);
    expect(applicableEvents(assumptions, "nowhere", "2026-11", 4)).toEqual([]);
  });
});

describe("requests", () => {
  it("drops zero sliders and events that no longer apply", () => {
    const request = buildRequest({
      destination: "kyoto-japan", start: "2027-01", months: 1, adjustments: { fuel: 20, weather: 0 },
      events: [{ id: "e1", strength: 100 }, { id: "e2", strength: 100 }, { id: "e3", strength: 100 }], overrides: {},
    }, assumptions);
    expect(request.adjustments).toEqual({ fuel: 20 });
    expect(request.events).toEqual([{ id: "e1", strength: 100 }]);
    expect(request.overrides).toBeUndefined();
  });
  it("keeps only real override values", () => {
    expect(cleanOverrides({})).toBeNull();
    expect(cleanOverrides({ types: { fuel: { demand_per_unit: "-0.4", rate_per_unit: "" } }, globals: { spill_share: "x" } }))
      .toEqual({ types: { fuel: { demand_per_unit: -0.4 } } });
  });
  it("turns a preset into a scenario, picking only the event types it names", () => {
    const preset = { id: "fest", destination: "kyoto-japan", start: "2027-01", months: 1, adjustments: {}, event_types: ["festival"] };
    const scenario = presetToScenario(preset, assumptions);
    expect(scenario.preset).toBe("fest");
    expect(scenario.events).toEqual([{ id: "e1", strength: 100 }]);
    expect(presetToScenario({ ...preset, event_types: [] }, assumptions).events).toEqual([]);
  });
  it("fits a scenario back into the forecast window", () => {
    const fitted = fitScenario({ ...DEFAULT_SCENARIO, destination: "atlantis", start: "2030-01", months: 9 }, assumptions);
    expect(fitted.start).toBe("2026-11");
    expect(fitted.months).toBe(4);
    expect(fitted.destination).toBe("kyoto-japan");
  });
});

describe("shareable links", () => {
  it("round-trips a scenario", () => {
    const scenario = { ...DEFAULT_SCENARIO, adjustments: { fuel: 20 }, events: [{ id: "e1", strength: 50 }] };
    expect(decodeScenario(encodeScenario(scenario))).toEqual({ ...scenario, overrides: {} });
  });
  it.each([null, "", "not json", "[]", '{"destination":1}', '{"destination":"a","start":"x","months":3}', '{"destination":"a","start":"2027-01","months":99}'])(
    "rejects malformed input %j without throwing", (text) => expect(decodeScenario(text)).toBeNull());
  it("ignores junk inside an otherwise valid link", () => {
    const decoded = decodeScenario('{"destination":"a","start":"2027-01","months":2,"adjustments":{"fuel":"x","weather":5},"events":[1,{"id":"e1","strength":"abc"}]}');
    expect(decoded.adjustments).toEqual({ weather: 5 });
    expect(decoded.events).toEqual([]);
  });
});

describe("saved scenarios", () => {
  const memory = () => { const data = {}; return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } }; };
  it("adds, replaces by name and caps the list", () => {
    let list = addSaved([], "Downside", DEFAULT_SCENARIO);
    list = addSaved(list, "downside", { ...DEFAULT_SCENARIO, months: 2 });
    expect(list).toHaveLength(1);
    expect(list[0].scenario.months).toBe(2);
    expect(addSaved(list, "   ", DEFAULT_SCENARIO)).toBe(list);
    for (let i = 0; i < 20; i += 1) list = addSaved(list, `s${i}`, DEFAULT_SCENARIO);
    expect(list.length).toBeLessThanOrEqual(12);
  });
  it("persists and reloads, and survives broken storage", () => {
    const storage = memory();
    expect(persistSaved(addSaved([], "A", DEFAULT_SCENARIO), storage)).toBe(true);
    expect(loadSaved(storage).map((s) => s.name)).toEqual(["A"]);
    const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    expect(loadSaved(broken)).toEqual([]);
    expect(persistSaved([], broken)).toBe(false);
  });
});
