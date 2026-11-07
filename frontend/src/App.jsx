import { useEffect, useState } from "react";
import { api, API_URL } from "./lib/api";

export default function App() {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    api("/health")
      .then((data) => setState({ status: "ok", data }))
      .catch((error) => setState({ status: "error", error: error.message }));
  }, []);

  return (
    <main>
      <h1>Frontend ↔ Backend</h1>
      <p className="muted">API: {API_URL}</p>

      {state.status === "loading" && (
        <p>Contacting backend… (free Render instances can take ~30s to wake up)</p>
      )}
      {state.status === "ok" && (
        <p className="ok">Backend is up: {JSON.stringify(state.data)}</p>
      )}
      {state.status === "error" && (
        <p className="err">Backend unreachable: {state.error}</p>
      )}
    </main>
  );
}
