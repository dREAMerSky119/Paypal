import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./api.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const respond = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, ...init });

describe("api", () => {
  it("returns parsed JSON and sends no Content-Type on a plain GET", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(respond({ ok: true }));
    await expect(api("/health")).resolves.toEqual({ ok: true });
    expect(spy.mock.calls[0][0]).toMatch(/\/api\/health$/);
    expect(spy.mock.calls[0][1].headers).toEqual({});
  });
  it("sends JSON Content-Type when there is a body and keeps caller headers", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(respond({}));
    await api("/x", { method: "POST", body: "{}", headers: { "X-Test": "1" } });
    expect(spy.mock.calls[0][1].headers).toEqual({ "Content-Type": "application/json", "X-Test": "1" });
  });
  it("throws a typed http error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 404, statusText: "Not Found" }));
    const err = await api("/missing").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ kind: "http", status: 404 });
  });
  it("throws a network error when fetch fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(api("/x")).rejects.toMatchObject({ kind: "network" });
  });
  it("times out with a typed error", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, { signal }) => new Promise((_res, rej) => {
      signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    await expect(api("/slow", { timeout: 20 })).rejects.toMatchObject({ kind: "timeout" });
  });
  it("rethrows caller aborts untouched so hooks can ignore them", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, { signal }) => new Promise((_res, rej) => {
      signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }));
    const ctrl = new AbortController();
    const p = api("/x", { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});
