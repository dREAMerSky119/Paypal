import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

// After this long with no response we assume the host is waking from sleep
// and show a friendlier message than a bare spinner.
export const WAKING_AFTER_MS = 3500;

export function useApi(path, { enabled = true, wakingAfter = WAKING_AFTER_MS } = {}) {
  const [state, setState] = useState({
    status: enabled && path ? "loading" : "idle",
    data: null,
    error: null,
  });
  const [waking, setWaking] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !path) return undefined;
    const controller = new AbortController();
    setState((s) => ({ ...s, status: "loading", error: null }));
    setWaking(false);
    const timer = setTimeout(() => setWaking(true), wakingAfter);

    api(path, { signal: controller.signal })
      .then((data) => setState({ status: "success", data, error: null }))
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setState({ status: "error", data: null, error });
      })
      .finally(() => {
        clearTimeout(timer);
        if (!controller.signal.aborted) setWaking(false);
      });

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [path, enabled, wakingAfter, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    ...state,
    isLoading: state.status === "loading",
    isWaking: state.status === "loading" && waking,
    reload,
  };
}
