const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);

// Render's free plan sleeps when idle and can take about a minute to wake,
// so the default timeout is deliberately long.
export const DEFAULT_TIMEOUT_MS = 75_000;

export class ApiError extends Error {
  /** kind: "http" | "timeout" | "network" */
  constructor(message, { kind = "http", status = null, detail = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    // The server's own explanation (FastAPI's `detail`), when it sent one.
    this.detail = detail;
  }
}

export async function api(
  path,
  { timeout = DEFAULT_TIMEOUT_MS, signal, headers, body, ...rest } = {}
) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  const forwardAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", forwardAbort, { once: true });
  }

  try {
    const res = await fetch(`${API_URL}/api${path}`, {
      ...rest,
      body,
      // Only send Content-Type when there is a body, so plain GETs stay
      // "simple" requests and skip the CORS preflight round trip.
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = null;
      try {
        const body = await res.json();
        if (typeof body?.detail === "string") detail = body.detail;
      } catch { /* not JSON, keep the generic message */ }
      throw new ApiError(`Request failed: ${res.status} ${res.statusText}`, {
        kind: "http",
        status: res.status,
        detail,
      });
    }
    return res.status === 204 ? null : await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err?.name === "AbortError") {
      if (timedOut) {
        throw new ApiError("The server took too long to respond.", { kind: "timeout" });
      }
      throw err; // aborted by the caller (e.g. component unmounted)
    }
    throw new ApiError("Could not reach the server.", { kind: "network" });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

export { API_URL };
