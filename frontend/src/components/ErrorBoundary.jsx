import { Component } from "react";

// Keeps one page's crash from blanking the whole app.
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("Page crashed:", error); }
  componentDidUpdate(prev) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="api-state api-state-error" role="alert" style={{ margin: 24 }}>
        <div><strong>This page hit a problem</strong><p>{String(this.state.error?.message || this.state.error)}</p>
          <a href="/app">Back to the workspace</a></div>
      </div>
    );
  }
}
