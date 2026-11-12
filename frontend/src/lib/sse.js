import { API_URL, ApiError, DEFAULT_TIMEOUT_MS } from "./api.js";

/** One id per browser tab, sent as X-Session-Id so the server can apply its per-session limit. */
let memoryId = null;
export function sessionId() {
  try {
    let id = sessionStorage.getItem("wayfare.session");
    if (!id) {
      id = (crypto.randomUUID?.() ?? `s${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`).replace(/[^A-Za-z0-9_-]/g, "");
      sessionStorage.setItem("wayfare.session", id);
    }
    return id;
  } catch {
    memoryId ??= `s${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    return memoryId;
  }
}

/**
 * Split a buffer of server-sent events into complete events plus the unfinished tail.
 * Pure, so it can be tested without a network: parseSse("event: a\ndata: {}\n\nevent: b") -> {events:[{event:"a",data:{}}], rest:"event: b"}
 */
export function parseSse(buffer) {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop();
  const events = [];
  for (const block of blocks) {
    let event = "message";
    const data = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (!data.length) continue;
    try { events.push({ event, data: JSON.parse(data.join("\n")) }); } catch { /* skip a malformed block */ }
  }
  return { events, rest };
}

/**
 * POST to an SSE endpoint under /api and call onEvent({event, data}) as each event arrives.
 * Resolves with the `done` payload. Rejects with ApiError: kind "http" (with the server's detail,
 * e.g. the 429 session-limit message), "timeout", or "network". Use `fallback()` when the browser
 * cannot stream (no response.body) so the caller can use the plain JSON endpoint instead.
 */
export async function streamPost(path, body, { onEvent, signal, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
  signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Id": sessionId() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = null;
      try { const j = await res.json(); if (typeof j?.detail === "string") detail = j.detail; } catch { /* not JSON */ }
      throw new ApiError(`Request failed: ${res.status}`, { kind: "http", status: res.status, detail });
    }
    if (!res.body?.getReader) throw new ApiError("Streaming is not supported here.", { kind: "unsupported" });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let done = null;
    for (;;) {
      const { value, done: finished } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !finished });
      const parsed = parseSse(finished ? buffer + "\n\n" : buffer);
      buffer = parsed.rest;
      for (const ev of parsed.events) {
        if (ev.event === "error") throw new ApiError(ev.data?.detail || "Something went wrong.", { kind: "http", detail: ev.data?.detail });
        if (ev.event === "done") done = ev.data;
        onEvent?.(ev);
      }
      if (finished) break;
    }
    if (!done) throw new ApiError("The reply ended early.", { kind: "network" });
    return done;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err?.name === "AbortError") {
      if (timedOut) throw new ApiError("The server took too long to respond.", { kind: "timeout" });
      throw err;
    }
    throw new ApiError("Could not reach the server.", { kind: "network" });
  } finally {
    clearTimeout(timer);
  }
}
