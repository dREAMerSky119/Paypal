import { Link } from "react-router-dom";
import { ArrowUpRight, Plane } from "lucide-react";
import "../workspace.css";

export function Brand({ light = false, to = "/" }) {
  return <Link to={to} className={`brand ${light ? "brand-light" : ""}`} aria-label="Wayfare home"><span className="brand-mark"><Plane size={15} strokeWidth={1.8} /></span><span>wayfare<span className="brand-period">.</span></span></Link>;
}

export function Button({ to, children, variant = "primary", className = "", ...props }) {
  const classes = `button button-${variant} ${className}`;
  return to ? <Link to={to} className={classes} {...props}>{children}</Link> : <button type="button" className={classes} {...props}>{children}</button>;
}

export function PageHeader({ eyebrow, title, description, action }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action && <div className="page-header-action">{action}</div>}</div>;
}

export function MetricCard({ label, value, change, detail, icon: Icon }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} strokeWidth={1.7}/></span></div><strong className="metric-value">{value}</strong><div className="metric-bottom">{change ? <span className="metric-change"><ArrowUpRight size={13}/>{change}</span> : null}<span>{detail}</span></div></article>;
}

export function Status({ children, tone = "sage" }) {
  return <span className={`status status-${tone}`}><i/>{children}</span>;
}

/**
 * Shared loading / waking / error states for anything driven by useApi.
 * Renders nothing once data has arrived, so pages can do:
 *   <ApiState api={api} /> {api.data && ...}
 */
export function ApiState({ api, label = "this page" }) {
  if (api.isWaking) {
    return <div className="api-state" role="status"><span className="api-state-pulse"/><div><strong>Waking the server</strong><p>The free hosting plan sleeps when idle, so the first request can take up to a minute. Hang tight, {label} will load on its own.</p></div></div>;
  }
  if (api.isLoading) {
    return <div className="api-state" role="status"><span className="api-state-pulse"/><div><strong>Loading</strong><p>Fetching {label}…</p></div></div>;
  }
  if (api.status === "error") {
    const detail = api.error?.kind === "timeout" ? "The server did not respond in time." : api.error?.kind === "network" ? "We could not reach the server." : "The server returned an error.";
    return <div className="api-state api-state-error" role="alert"><div><strong>Could not load {label}</strong><p>{detail}</p></div><Button variant="outline" onClick={api.reload}>Try again</Button></div>;
  }
  return null;
}
