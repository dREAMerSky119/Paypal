import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSse, sessionId, streamPost } from "./sse.js";

const stream = (text, chunk = 17) => new Response(new ReadableStream({
  start(c) { const enc = new TextEncoder(); for (let i = 0; i < text.length; i += chunk) c.enqueue(enc.encode(text.slice(i, i + chunk))); c.close(); },
}), { status: 200, headers: { "Content-Type": "text/event-stream" } });
const sse = (...evs) => evs.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
afterEach(() => vi.restoreAllMocks());

describe("parseSse", () => {
  it("returns complete events and keeps the unfinished tail", () => {
    const out = parseSse('event: token\ndata: {"text":"hi "}\n\nevent: done\ndata: {"a"');
    expect(out.events).toEqual([{ event: "token", data: { text: "hi " } }]);
    expect(out.rest).toBe('event: done\ndata: {"a"');
  });
  it("skips malformed blocks instead of throwing", () => {
    expect(parseSse("event: x\ndata: {nope\n\nevent: y\ndata: 1\n\n").events).toEqual([{ event: "y", data: 1 }]);
  });
});

describe("sessionId", () => {
  it("is stable within a tab and URL-safe", () => {
    expect(sessionId()).toBe(sessionId());
    expect(sessionId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});

describe("streamPost", () => {
  it("delivers events in order across chunk boundaries and resolves with done", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(stream(sse(["status", { text: "Thinking" }], ["token", { text: "Hello " }], ["token", { text: "there" }], ["done", { reply: "Hello there" }])));
    const seen = [];
    const done = await streamPost("/advisor/stream", { message: "x" }, { onEvent: (e) => seen.push(e.event) });
    expect(seen).toEqual(["status", "token", "token", "done"]);
    expect(done.reply).toBe("Hello there");
    expect(globalThis.fetch.mock.calls[0][1].headers["X-Session-Id"]).toBe(sessionId());
  });
  it("surfaces the server's detail on a 429", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "You have used your 20 advisor requests" }), { status: 429 }));
    await expect(streamPost("/advisor/stream", {})).rejects.toMatchObject({ kind: "http", status: 429, detail: expect.stringMatching(/20 advisor/) });
  });
  it("turns a mid-stream error event into a rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(stream(sse(["status", { text: "Thinking" }], ["error", { detail: "Something went wrong while planning." }])));
    await expect(streamPost("/advisor/stream", {})).rejects.toMatchObject({ detail: "Something went wrong while planning." });
  });
  it("rejects when the stream ends without a done event", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(stream(sse(["token", { text: "a" }])));
    await expect(streamPost("/advisor/stream", {})).rejects.toMatchObject({ kind: "network" });
  });
  it("maps a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fail"));
    await expect(streamPost("/advisor/stream", {})).rejects.toMatchObject({ kind: "network" });
  });
});
