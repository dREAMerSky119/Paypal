import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useApi } from "./useApi.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("useApi", () => {
  it("goes loading -> success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ a: 1 }), { status: 200 }));
    const { result } = renderHook(() => useApi("/overview"));
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(result.current.data).toEqual({ a: 1 });
  });
  it("reports an error and can retry", async () => {
    const spy = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("x", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const { result } = renderHook(() => useApi("/overview"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error.status).toBe(500);
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.status).toBe("success"));
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("flags 'waking' only after a slow first response, then clears it", async () => {
    let resolve;
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((r) => { resolve = r; }));
    const { result } = renderHook(() => useApi("/overview", { wakingAfter: 30 }));
    expect(result.current.isWaking).toBe(false);
    await waitFor(() => expect(result.current.isWaking).toBe(true));
    await act(async () => { resolve(new Response("{}", { status: 200 })); });
    await waitFor(() => expect(result.current.isWaking).toBe(false));
    expect(result.current.status).toBe("success");
  });
  it("does nothing when disabled", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const { result } = renderHook(() => useApi("/x", { enabled: false }));
    expect(result.current.status).toBe("idle");
    expect(spy).not.toHaveBeenCalled();
  });
});
