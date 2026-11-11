import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Bell, Menu, Search, Sparkles, X } from "lucide-react";
import { Brand } from "./ui.jsx";
import CommandPalette from "./CommandPalette.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { navGroups, navItems } from "../data/navigation.js";

// Wired to the anomaly feed once feature #9 exists; until then the bell has
// nothing to flag, so it shows no dot rather than a misleading one.
const OPEN_ANOMALY_COUNT = 0;

const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");

function Sidebar({ mobileOpen, setMobileOpen }) {
  const { fullName, initials, designation, organisationName } = useAuth();
  const displayName = fullName || "Alex Morgan";
  const avatar = initials || "AM";
  const workspaceName = organisationName || (fullName ? `${fullName.split(" ")[0]}'s Workspace` : "Northstar Travel");
  return <><div className={`sidebar-overlay ${mobileOpen ? "is-visible" : ""}`} onClick={() => setMobileOpen(false)} /><aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
    <div className="sidebar-brand"><Brand to="/home" /><button type="button" className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={19}/></button></div>
    {/* Static until multi-workspace support exists: there is one workspace. */}
    <div className="workspace-switch is-static" title="Switching workspaces arrives with multi-workspace support"><span className="workspace-avatar">{avatar}</span><span className="workspace-meta"><strong>{workspaceName}</strong><small>Agency workspace</small></span></div>
    <div className="sidebar-nav">{navGroups.map(group => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)} className={({isActive}) => `side-link ${isActive ? "side-link-active" : ""}`}><item.icon size={17} strokeWidth={1.7}/><span>{item.label}</span>{item.tag && <span className="nav-tag">{item.tag}</span>}</NavLink>)}</div>)}</div>
    <div className="sidebar-bottom"><Link className="help-card" to="/home#discover" onClick={() => setMobileOpen(false)}><span className="help-icon"><Sparkles size={16}/></span><p><strong>Need a hand?</strong><small>Visit the field guide</small></p><ArrowUpRight size={15}/></Link><Link className="profile-button is-static" to="/profile" aria-label={`Edit profile for ${displayName.toLowerCase()}`}><span className="profile-avatar">{avatar}</span><span className="profile-meta"><strong>{displayName}</strong><small>{designation || "Travel designer"}</small></span></Link></div>
  </aside></>;
}

export default function DashboardLayout() {
  const { initials, fullName, organisationName, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const workspaceName = organisationName || (fullName ? `${fullName.split(" ")[0]}'s Workspace` : "Northstar Travel");
  const location = useLocation();
  const page = navItems.find(item => item.to === location.pathname);
  const title = location.pathname === "/app" ? "Overview" : page?.label || "Workspace";

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <div className="app-shell"><Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/><div className="app-main">
    <header className="topbar"><button type="button" className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="breadcrumbs"><span>{workspaceName}</span><span className="crumb-divider">/</span><strong>{title}</strong></div>
      <div className="topbar-actions"><button type="button" className="topbar-search" onClick={() => setPaletteOpen(true)} aria-label="Search anything"><Search size={16}/><span className="topbar-search-label">Search anything</span><kbd>{isMac ? "⌘ K" : "Ctrl K"}</kbd></button>
        <Link to="/app/anomalies" className="icon-button notification-button" aria-label={OPEN_ANOMALY_COUNT ? `${OPEN_ANOMALY_COUNT} open anomalies` : "Anomaly watch"}><Bell size={18}/>{OPEN_ANOMALY_COUNT > 0 && <i/>}</Link><Link to="/profile" className="topbar-avatar" aria-label={`Profile for ${(fullName || "Alex Morgan").toLowerCase()}`}>{initials || "AM"}</Link><button type="button" className="icon-button" aria-label="Log out" onClick={() => setLogoutOpen(true)}><X size={16}/></button></div></header>
    <main className="workspace-content"><AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={{duration:.22}}><Suspense fallback={<div className="api-state" role="status"><span className="api-state-pulse"/><div><strong>Loading</strong></div></div>}><Outlet/></Suspense></motion.div></AnimatePresence></main>
    {logoutOpen && <div className="inv-overlay" role="presentation" onMouseDown={() => setLogoutOpen(false)}>
      <aside className="inv-drawer logout-dialog" role="dialog" aria-modal="true" aria-label="Leave your workspace" onMouseDown={(e) => e.stopPropagation()} style={{maxWidth:420,margin:"auto"}}>
        <header><div><p className="eyebrow">SEE YOU SOON</p><h2>Leave your workspace?</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={() => setLogoutOpen(false)}><X size={18}/></button></header>
        <p>Your profile stays saved in this browser, so you can pick up where you left off.</p>
        <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
          <button type="button" className="pb-button pb-button-quiet" onClick={() => setLogoutOpen(false)}>Stay</button>
          <button type="button" className="pb-button pb-button-primary" onClick={logout}>Log out</button>
        </div>
      </aside>
    </div>}
  </div><CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} /></div>;
}
