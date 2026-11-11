import { Suspense, useEffect, useState } from "react";
<<<<<<< HEAD
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
=======
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
>>>>>>> fe70b5b (Add updated project files final one)
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Bell, Menu, Search, Sparkles, X } from "lucide-react";
import { Brand } from "./ui.jsx";
import CommandPalette from "./CommandPalette.jsx";
import { navGroups, navItems } from "../data/navigation.js";
<<<<<<< HEAD
import { useAuth } from "../context/AuthContext.jsx";
=======
>>>>>>> fe70b5b (Add updated project files final one)

// Wired to the anomaly feed once feature #9 exists; until then the bell has
// nothing to flag, so it shows no dot rather than a misleading one.
const OPEN_ANOMALY_COUNT = 0;

const isMac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");

<<<<<<< HEAD
function Sidebar({ mobileOpen, setMobileOpen, onLogout }) {
  const { fullName, initials, designation, profile, isProfileComplete } = useAuth();
  const displayName = isProfileComplete ? fullName : "Complete your profile";
  const workspaceName = isProfileComplete
    ? profile.agencyType === "organisation"
      ? profile.organisationName
      : `${fullName.trim().split(/\s+/)[0]}'s Workspace`
    : "Wayfare workspace";
  const workspaceLabel = isProfileComplete
    ? profile.agencyType === "organisation" ? "Agency workspace" : "Personal workspace"
    : "Profile setup";
  return <><div className={`sidebar-overlay ${mobileOpen ? "is-visible" : ""}`} onClick={() => setMobileOpen(false)} /><aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
    <div className="sidebar-brand"><Brand to="/home" /><button type="button" className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={19}/></button></div>
    <div className="workspace-switch is-static"><span className="workspace-avatar">{isProfileComplete ? initials : "W"}</span><span className="workspace-meta"><strong>{workspaceName}</strong><small>{workspaceLabel}</small></span></div>
    <div className="sidebar-nav">{navGroups.map(group => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)} className={({isActive}) => `side-link ${isActive ? "side-link-active" : ""}`}><item.icon size={17} strokeWidth={1.7}/><span>{item.label}</span>{item.tag && <span className="nav-tag">{item.tag}</span>}</NavLink>)}</div>)}</div>
    <div className="sidebar-bottom"><Link className="help-card" to="/home#discover" onClick={() => setMobileOpen(false)}><span className="help-icon"><Sparkles size={16}/></span><p><strong>Need a hand?</strong><small>Visit the field guide</small></p><ArrowUpRight size={15}/></Link><Link className="profile-button profile-link" to="/app/profile" onClick={() => setMobileOpen(false)} aria-label={`Edit profile for ${displayName}`}><span className="profile-avatar">{initials || "·"}</span><span className="profile-meta"><strong>{displayName}</strong><small>{isProfileComplete ? designation : "Demo profile setup"}</small></span><ArrowUpRight size={14}/></Link><button type="button" className="logout-button" onClick={onLogout}>Log out</button></div>
  </aside></>;
}

function LogoutDialog({ onCancel, onConfirm }) {
  return <div className="logout-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="logout-dialog" role="dialog" aria-modal="true" aria-labelledby="logout-title"><p className="eyebrow">WAYFARE DEMO SESSION</p><h2 id="logout-title">Leave your workspace?</h2><p>Your temporary session will end. Your saved demo profile will remain in this browser.</p><div><button className="button button-outline" type="button" onClick={onCancel}>Stay here</button><button className="button button-primary" type="button" onClick={onConfirm}>Log out</button></div></section></div>;
}

export default function DashboardLayout() {
  const { logout, fullName, initials, profile, isProfileComplete } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const location = useLocation();
  const page = navItems.find(item => item.to === location.pathname);
  const title = location.pathname === "/app" ? "Overview" : location.pathname === "/app/profile" ? "Profile" : page?.label || "Workspace";
  const workspaceName = isProfileComplete
    ? profile.agencyType === "organisation"
      ? profile.organisationName
      : `${fullName.trim().split(/\s+/)[0]}'s Workspace`
    : "Wayfare workspace";
=======
function Sidebar({ mobileOpen, setMobileOpen }) {
  return <><div className={`sidebar-overlay ${mobileOpen ? "is-visible" : ""}`} onClick={() => setMobileOpen(false)} /><aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
    <div className="sidebar-brand"><Brand to="/home" /><button type="button" className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={19}/></button></div>
    {/* Static until sign-in exists: there is one workspace and one user. */}
    <div className="workspace-switch is-static" title="Switching workspaces arrives with sign-in"><span className="workspace-avatar">N</span><span className="workspace-meta"><strong>Northstar Travel</strong><small>Agency workspace</small></span></div>
    <div className="sidebar-nav">{navGroups.map(group => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)} className={({isActive}) => `side-link ${isActive ? "side-link-active" : ""}`}><item.icon size={17} strokeWidth={1.7}/><span>{item.label}</span>{item.tag && <span className="nav-tag">{item.tag}</span>}</NavLink>)}</div>)}</div>
    <div className="sidebar-bottom"><Link className="help-card" to="/home#discover" onClick={() => setMobileOpen(false)}><span className="help-icon"><Sparkles size={16}/></span><p><strong>Need a hand?</strong><small>Visit the field guide</small></p><ArrowUpRight size={15}/></Link><div className="profile-button is-static"><span className="profile-avatar">AM</span><span className="profile-meta"><strong>Alex Morgan</strong><small>Travel designer</small></span></div></div>
  </aside></>;
}

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();
  const page = navItems.find(item => item.to === location.pathname);
  const title = location.pathname === "/app" ? "Overview" : page?.label || "Workspace";
>>>>>>> fe70b5b (Add updated project files final one)

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

<<<<<<< HEAD
  const confirmLogout = () => { logout(); setLogoutOpen(false); navigate("/", { replace: true }); };

  return <div className="app-shell"><Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} onLogout={() => setLogoutOpen(true)}/><div className="app-main">
    <header className="topbar"><button type="button" className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="breadcrumbs"><span>{workspaceName}</span><span className="crumb-divider">/</span><strong>{title}</strong></div>
      <div className="topbar-actions"><button type="button" className="topbar-search" onClick={() => setPaletteOpen(true)} aria-label="Search anything"><Search size={16}/><span className="topbar-search-label">Search anything</span><kbd>{isMac ? "⌘ K" : "Ctrl K"}</kbd></button>
        <Link to="/app/anomalies" className="icon-button notification-button" aria-label={OPEN_ANOMALY_COUNT ? `${OPEN_ANOMALY_COUNT} open anomalies` : "Anomaly watch"}><Bell size={18}/>{OPEN_ANOMALY_COUNT > 0 && <i/>}</Link><Link to="/app/profile" className="topbar-avatar" aria-label={`Profile for ${fullName}`} title={fullName}>{initials || "·"}</Link></div></header>
    <main className="workspace-content"><AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={{duration:.22}}><Suspense fallback={<div className="api-state" role="status"><span className="api-state-pulse"/><div><strong>Loading</strong></div></div>}><Outlet/></Suspense></motion.div></AnimatePresence></main>
  </div><CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />{logoutOpen && <LogoutDialog onCancel={() => setLogoutOpen(false)} onConfirm={confirmLogout}/>}</div>;
=======
  return <div className="app-shell"><Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/><div className="app-main">
    <header className="topbar"><button type="button" className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="breadcrumbs"><span>Northstar Travel</span><span className="crumb-divider">/</span><strong>{title}</strong></div>
      <div className="topbar-actions"><button type="button" className="topbar-search" onClick={() => setPaletteOpen(true)} aria-label="Search anything"><Search size={16}/><span className="topbar-search-label">Search anything</span><kbd>{isMac ? "⌘ K" : "Ctrl K"}</kbd></button>
        <Link to="/app/anomalies" className="icon-button notification-button" aria-label={OPEN_ANOMALY_COUNT ? `${OPEN_ANOMALY_COUNT} open anomalies` : "Anomaly watch"}><Bell size={18}/>{OPEN_ANOMALY_COUNT > 0 && <i/>}</Link><span className="topbar-avatar">AM</span></div></header>
    <main className="workspace-content"><AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={{duration:.22}}><Suspense fallback={<div className="api-state" role="status"><span className="api-state-pulse"/><div><strong>Loading</strong></div></div>}><Outlet/></Suspense></motion.div></AnimatePresence></main>
  </div><CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} /></div>;
>>>>>>> fe70b5b (Add updated project files final one)
}
