import { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { WAKING_AFTER_MS } from "./useApi.js";

export const RUN_DEBOUNCE_MS = 250;

/**
 * Runs the scenario on the server whenever `request` changes (debounced).
 * The previous result stays on screen while the next one loads, so dragging a
 * slider updates numbers in place instead of flashing a spinner.
 */
export function useSimulation(request, { enabled = true, debounce = RUN_DEBOUNCE_MS } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: enabled });
  const [waking, setWaking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(request);
  const latest = useRef(request);
  latest.current = request;

  useEffect(() => {
    if (!enabled || !request) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    setWaking(false);
    let wakingTimer;
    const timer = setTimeout(() => {
      wakingTimer = setTimeout(() => setWaking(true), WAKING_AFTER_MS);
      api("/simulator/run", { method: "POST", body: JSON.stringify(latest.current), signal: controller.signal })
        .then((data) => setState({ data, error: null, loading: false }))
        .catch((error) => {
          if (error?.name === "AbortError") return;
          setState((s) => ({ ...s, error, loading: false }));
        })
        .finally(() => {
          clearTimeout(wakingTimer);
          if (!controller.signal.aborted) setWaking(false);
        });
    }, debounce);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearTimeout(wakingTimer);
    };
    // `key` stands for the request's contents; `attempt` re-runs after "Try again".
  }, [key, enabled, debounce, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, waking: state.loading && waking, retry: () => setAttempt((n) => n + 1) };
}
