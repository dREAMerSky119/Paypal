import { useRef, useState } from "react";
import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useLocation, useSearchParams } from "react-router-dom";
import { AnimatePresence, MotionConfig, motion, useScroll, useTransform } from "framer-motion";
import {
  ArrowDown, ArrowRight, ArrowUpRight, BarChart3, Bell, CalendarDays,
  ChevronDown, Compass, Globe2, Leaf, Menu, Search, Settings2, ShieldAlert,
  Sparkles, Users, WalletCards, X, Plane, MapPinned, LayoutDashboard,
} from "lucide-react";
import DestinationDetails from "./components/DestinationDetails.jsx";
import LoginPage from "./components/LoginPage.jsx";
import { destinations, getDestination } from "./data/destinations.js";

const MotionLink = motion(Link);

const navGroups = [
  { label: "WORKSPACE", items: [
    { to: "/app", label: "Overview", icon: LayoutDashboard, end: true },
    { to: "/app/inventory", label: "Inventory", icon: Compass },
    { to: "/app/ai-studio", label: "AI studio", icon: Sparkles, tag: "BETA" },
    { to: "/app/packages", label: "Packages", icon: WalletCards },
    { to: "/app/itinerary-studio", label: "Itinerary studio", icon: MapPinned },
  ]},
  { label: "INTELLIGENCE", items: [
    { to: "/app/analytics", label: "Profitability", icon: BarChart3 },
    { to: "/app/forecast", label: "Demand forecast", icon: CalendarDays },
    { to: "/app/simulator", label: "Market simulator", icon: Globe2 },
    { to: "/app/anomalies", label: "Anomaly watch", icon: ShieldAlert },
    { to: "/app/responsible-travel", label: "Responsible travel", icon: Leaf },
  ]},
];

function Brand({ light = false, to = "/" }) {
  return <Link to={to} className={`brand ${light ? "brand-light" : ""}`} aria-label="Wayfare home"><span className="brand-mark"><Plane size={15} strokeWidth={1.8} /></span><span>wayfare<span className="brand-period">.</span></span></Link>;
}

function Button({ to, children, variant = "primary", className = "", ...props }) {
  const content = <>{children}</>;
  const classes = `button button-${variant} ${className}`;
  return to ? <Link to={to} className={classes} {...props}>{content}</Link> : <button className={classes} {...props}>{content}</button>;
}

const heroTextVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: .8, ease: [0.22, 1, 0.36, 1] } },
};

function LandingPage() {
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 72]);
  return <main className="landing">
    <motion.header className="landing-nav wrap" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, ease: [0.22, 1, 0.36, 1] }}>
      <Brand to="/home" />
      <nav aria-label="Main navigation" className="landing-links"><a href="#discover">Discover</a><a href="#approach">Our approach</a><a href="#responsible">Responsible travel</a></nav>
      <Button to="/app" variant="nav">Enter Agent Workspace <ArrowUpRight size={15} /></Button>
    </motion.header>
    <section className="hero" ref={heroRef}>
      <motion.div className="hero-image-wrap" style={{ y: heroY }}><img className="hero-image" src="https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=2400&q=90" alt="A tranquil alpine lake reflecting the mountains at dawn" /></motion.div>
      <div className="hero-scrim" />
      <motion.div className="hero-content wrap" initial="hidden" animate="visible" variants={{ hidden: {}, visible: { transition: { staggerChildren: .16, delayChildren: .16 } } }}>
        <motion.p className="eyebrow eyebrow-light" variants={heroTextVariants}><span className="eyebrow-line" />A MORE CONSIDERED WAY TO TRAVEL</motion.p>
        <motion.h1 variants={heroTextVariants}>Every journey,<br /><em>thoughtfully</em> orchestrated.</motion.h1>
        <motion.p className="hero-copy" variants={heroTextVariants}>The intelligent workspace for travel professionals who believe the best journeys begin with a little more intention.</motion.p>
        <motion.div className="hero-actions" variants={heroTextVariants}><Button to="/app" variant="light">Enter Agent Workspace <ArrowRight size={16} /></Button><a className="text-link light-link" href="#discover"><span className="round-arrow"><ArrowDown size={15} /></span> Explore the world</a></motion.div>
      </motion.div>
      <div className="hero-note"><span>46° 28′ N&nbsp; 11° 52′ E</span><span>THE DOLOMITES, ITALY</span></div>
      <div className="hero-index"><span>01</span><i /><span>03</span></div>
    </section>
    <section className="intro-strip wrap"><p className="eyebrow">A PARTNER IN EVERY DETAIL</p><p>From the first spark of inspiration to the last mile home, <span>Wayfare brings the pieces of exceptional travel together.</span></p><span className="intro-stamp">MADE FOR<br />THE JOURNEY <Compass size={25} strokeWidth={1.2} /></span></section>
    <section className="discover section-pad" id="discover"><div className="wrap"><div className="section-heading"><div><p className="eyebrow">THE WORLD, WELL CONSIDERED</p><h2>Places with a <em>sense of place.</em></h2></div><a href="#approach" className="text-link">View all destinations <ArrowRight size={16} /></a></div><div className="destination-grid">{destinations.map((d, i) => <MotionLink to={`/destinations/${d.slug}`} aria-label={`Discover ${d.cardTitle}`} className={`destination-card destination-${(i % 3) + 1}`} key={d.slug} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .6, delay: i * .12, ease: [0.22, 1, 0.36, 1] }}><img src={`https://images.unsplash.com/${d.cardImage}?auto=format&fit=crop&w=1000&q=85`} alt={d.cardTitle} loading="lazy" onError={(event) => {event.currentTarget.style.display = "none";}} /><div className="destination-shade" /><span className="destination-type">{d.type}</span><div className="destination-info"><div><h3>{d.cardTitle}</h3><p>{d.detail}</p></div><span className="destination-arrow"><ArrowUpRight size={17} /></span></div></MotionLink>)}</div><div className="discover-foot"><span>CURATED FOR THE CURIOUS</span><span>01 — 03</span></div></div></section>
    <motion.section className="approach section-pad" id="approach" initial={{opacity:0,y:18}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.12}} transition={{duration:.7,ease:[.22,1,.36,1]}}><div className="wrap approach-grid"><div className="approach-photo"><img src="https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1400&q=85" alt="Colorful coastal villages of Cinque Terre, Italy" loading="lazy"/><div className="photo-caption"><span>THE ART OF A WELL-MADE JOURNEY</span><span>01 / 04</span></div><div className="photo-seal"><Compass size={22} /><span>GO WITH<br />GOOD INTENT</span></div></div><div className="approach-copy"><p className="eyebrow">INTELLIGENCE, WITH INTENTION</p><h2>More than a plan.<br />A feeling that <em>stays.</em></h2><p>Great travel is equal parts instinct and detail. Wayfare brings your suppliers, insight and ideas into one thoughtful workspace, so you can spend less time connecting dots and more time creating moments.</p><div className="approach-list"><div><span>01</span><p><strong>See the whole picture</strong><br />A clear view of the stays, guides and experiences you trust.</p></div><div><span>02</span><p><strong>Make room for the unexpected</strong><br />Plan with intelligence that leaves space for discovery.</p></div><div><span>03</span><p><strong>Bring every detail together</strong><br />Shape seamless itineraries from first thought to final flourish.</p></div></div><Button to="/app" variant="outline">Explore the workspace <ArrowRight size={16} /></Button></div></div></motion.section>
    <motion.section className="responsible section-pad" id="responsible" initial={{opacity:0,y:18}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.12}} transition={{duration:.7,ease:[.22,1,.36,1]}}><div className="responsible-image"/><div className="responsible-inner wrap"><div className="responsible-copy"><span className="responsible-icon"><Leaf size={20} /></span><p className="eyebrow eyebrow-light">TRAVEL THAT GIVES BACK</p><h2>Leave a place<br /><em>better than you found it.</em></h2><p>Find the locally rooted stays, independent guides and community-led experiences that help a destination thrive long after the journey ends.</p><Button to="/app/responsible-travel" variant="light">Discover responsible travel <ArrowRight size={16} /></Button></div><div className="responsible-aside"><span>THE WAYFARER'S<br />PLEDGE</span><div className="pledge-mark"><Leaf size={32} strokeWidth={1} /></div><p>Travel gently.<br />Leave generously.</p></div></div></motion.section>
    <footer className="landing-footer"><div className="wrap footer-main"><div><Brand to="/home" /><p>Thoughtful journeys start here.</p></div><div className="footer-links"><div><span>EXPLORE</span><a href="#discover">Destinations</a><a href="#approach">Our approach</a></div><div><span>FOR PROFESSIONALS</span><Link to="/app">Agent workspace</Link><Link to="/app/ai-studio">AI studio</Link></div><div><span>OUR VALUES</span><a href="#responsible">Responsible travel</a><a href="#responsible">Community first</a></div></div></div><div className="wrap footer-bottom"><span>© 2026 WAYFARE TRAVEL CO.</span><span>MADE FOR THE WAY THERE.</span><a href="#top" onClick={(e) => {e.preventDefault(); window.scrollTo({top:0,behavior:"smooth"});}}>BACK TO TOP ↑</a></div></footer>
  </main>;
}

function Sidebar({ mobileOpen, setMobileOpen }) {
  return <><div className={`sidebar-overlay ${mobileOpen ? "is-visible" : ""}`} onClick={() => setMobileOpen(false)} /><aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}><div className="sidebar-brand"><Brand to="/home" /><button className="icon-button sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={19}/></button></div><button className="workspace-switch"><span className="workspace-avatar">N</span><span className="workspace-meta"><strong>Northstar Travel</strong><small>Agency workspace</small></span><ChevronDown size={15}/></button><div className="sidebar-nav">{navGroups.map(group => <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{group.items.map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={() => setMobileOpen(false)} className={({isActive}) => `side-link ${isActive ? "side-link-active" : ""}`}><item.icon size={17} strokeWidth={1.7}/><span>{item.label}</span>{item.tag && <span className="nav-tag">{item.tag}</span>}</NavLink>)}</div>)}</div><div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><Sparkles size={16}/></span><p><strong>Need a hand?</strong><small>Visit the field guide</small></p><ArrowUpRight size={15}/></div><button className="profile-button"><span className="profile-avatar">AM</span><span className="profile-meta"><strong>Alex Morgan</strong><small>Travel designer</small></span><Settings2 size={16}/></button></div></aside></>;
}

function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const page = navGroups.flatMap(group => group.items).find(item => item.to === location.pathname);
  const title = location.pathname === "/app" ? "Overview" : page?.label || "Workspace";
  return <div className="app-shell"><Sidebar mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}/><div className="app-main"><header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20}/></button><div className="breadcrumbs"><span>Northstar Travel</span><span className="crumb-divider">/</span><strong>{title}</strong></div><div className="topbar-actions"><div className="topbar-search"><Search size={16}/><input placeholder="Search anything" aria-label="Search anything"/><kbd>⌘ K</kbd></div><button className="icon-button notification-button" aria-label="Notifications"><Bell size={18}/><i/></button><span className="topbar-avatar">AM</span></div></header><main className="workspace-content"><AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-5}} transition={{duration:.22}}><Outlet/></motion.div></AnimatePresence></main></div></div>;
}

function PageHeader({ eyebrow, title, description, action }) {
  return <div className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="page-description">{description}</p></div>{action && <div className="page-header-action">{action}</div>}</div>;
}
function MetricCard({ label, value, change, detail, icon: Icon }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={17} strokeWidth={1.7}/></span></div><strong className="metric-value">{value}</strong><div className="metric-bottom"><span className="metric-change"><ArrowUpRight size={13}/>{change}</span><span>{detail}</span></div></article>;
}
function Status({ children, tone = "sage" }) { return <span className={`status status-${tone}`}><i/>{children}</span>; }
function OverviewPage() {
  return <><PageHeader eyebrow="MONDAY, 14 SEPTEMBER 2026" title={<>Good morning, Alex<span className="title-period">.</span></>} description="A considered start to the journeys taking shape this week." action={<Button variant="primary"><ArrowRight size={15}/> Create an itinerary</Button>}/><div className="illustrative-banner"><span className="illustrative-mark"><Sparkles size={15}/></span><p><strong>Illustrative workspace preview</strong><span>All figures and bookings shown are sample data for demonstration purposes.</span></p><button aria-label="Dismiss notice"><X size={16}/></button></div><section className="metrics-grid" aria-label="Illustrative business metrics"><MetricCard label="Gross booking value" value="$284,650" change="12.8%" detail="vs. previous period" icon={WalletCards}/><MetricCard label="Active itineraries" value="38" change="6.2%" detail="across 12 destinations" icon={MapPinned}/><MetricCard label="Avg. gross margin" value="18.4%" change="2.1%" detail="vs. previous period" icon={BarChart3}/><MetricCard label="Supplier partners" value="126" change="8 new" detail="this quarter" icon={Users}/></section><div className="overview-grid"><section className="panel booking-panel"><div className="panel-heading"><div><p className="eyebrow">WHAT'S TAKING SHAPE</p><h2>Upcoming journeys</h2></div><Button variant="quiet">View all <ArrowRight size={15}/></Button></div><div className="booking-table"><div className="booking-row booking-head"><span>JOURNEY</span><span>TRAVELLER</span><span>DEPARTURE</span><span>STATUS</span><span/></div>{[
    {place:"Kyoto & the Inland Sea",region:"Japan · 8 nights", initials:"SK",name:"Sofia Kim",date:"24 Sep 2026",status:"In planning",tone:"blue",image:"photo-1493976040374-85c8e12f0c0e"},
    {place:"A slower Tuscany",region:"Italy · 6 nights",initials:"JL",name:"James Liu",date:"02 Oct 2026",status:"Ready to share",tone:"sage",image:"photo-1516483638261-f4dbaf036963"},
    {place:"Atlas to the Atlantic",region:"Morocco · 9 nights",initials:"MR",name:"Maya Rivera",date:"16 Oct 2026",status:"In planning",tone:"blue",image:"photo-1539020140153-e479b8c22e70"},
  ].map(row=><div className="booking-row" key={row.place}><div className="booking-destination"><img src={`https://images.unsplash.com/${row.image}?auto=format&fit=crop&w=100&q=75`} alt=""/><span><strong>{row.place}</strong><small>{row.region}</small></span></div><div className="traveller-cell"><span className="traveller-avatar">{row.initials}</span>{row.name}</div><span className="booking-date">{row.date}</span><Status tone={row.tone}>{row.status}</Status><button className="row-more" aria-label={`More options for ${row.place}`}>···</button></div>)}</div><p className="sample-note"><span/> Sample journeys · no real bookings or transactions</p></section><aside className="panel insight-panel"><div className="panel-heading"><div><p className="eyebrow">A LITTLE PERSPECTIVE</p><h2>On the horizon</h2></div><span className="insight-spark"><Sparkles size={16}/></span></div><div className="insight-feature"><div className="insight-chart"><div className="chart-y"><span>40</span><span>30</span><span>20</span><span>10</span></div><div className="chart-area"><div className="chart-lines"><i/><i/><i/><i/></div><svg viewBox="0 0 280 120" preserveAspectRatio="none" aria-label="Illustrative trend chart"><defs><linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d6ad62" stopOpacity=".32"/><stop offset="1" stopColor="#d6ad62" stopOpacity="0"/></linearGradient></defs><path d="M0 92 C20 88 24 68 50 74 S82 54 103 61 S133 54 153 39 S185 52 202 34 S239 42 253 18 S270 21 280 10 V120 H0Z" fill="url(#area-fill)"/><path d="M0 92 C20 88 24 68 50 74 S82 54 103 61 S133 54 153 39 S185 52 202 34 S239 42 253 18 S270 21 280 10" fill="none" stroke="#98773b" strokeWidth="2"/></svg><div className="chart-x"><span>APR</span><span>MAY</span><span>JUN</span><span>JUL</span><span>AUG</span><span>SEP</span></div></div></div><div className="insight-summary"><div><strong>+14.6%</strong><span>Illustrative interest in shoulder-season departures</span></div><span className="insight-tag"><ArrowUpRight size={13}/> TREND</span></div><p className="insight-footnote">Sample signal for interface preview only · not a live forecast</p></div><div className="insight-bottom"><span className="insight-small-icon"><Leaf size={16}/></span><span><strong>Thoughtful by nature</strong><small>7 sample journeys include community-led experiences</small></span><ArrowRight size={15}/></div></aside></div><div className="overview-footerline"><span>YOUR AGENCY, AT A GLANCE</span><span>LAST UPDATED JUST NOW <i/></span></div></>;
}

const placeholderInfo = {
  "/app/inventory": { eyebrow:"YOUR PARTNER NETWORK", title:"Supplier inventory", description:"Explore stays, guides and experiences from the partners you trust.", icon:Compass, label:"Inventory explorer" },
  "/app/ai-studio": { eyebrow:"THOUGHTFUL BY DESIGN", title:"AI travel advisor", description:"Shape an itinerary around the way your travellers want to feel.", icon:Sparkles, label:"Planning canvas" },
  "/app/packages": { eyebrow:"BUILD SOMETHING MEMORABLE", title:"Package builder", description:"Bring stays, transport and experiences together into one considered offer.", icon:WalletCards, label:"Package workspace" },
  "/app/analytics": { eyebrow:"KNOW YOUR NUMBERS", title:"Profitability analysis", description:"Understand the shape and performance of your travel business.", icon:BarChart3, label:"Business insights" },
  "/app/forecast": { eyebrow:"LOOK A LITTLE FURTHER", title:"Demand forecasting", description:"Explore the signals shaping tomorrow's travel demand.", icon:CalendarDays, label:"Demand outlook" },
  "/app/simulator": { eyebrow:"WHAT IF?", title:"Market simulator", description:"Explore how changing conditions could shape the journeys you offer.", icon:Globe2, label:"Scenario workspace" },
  "/app/anomalies": { eyebrow:"A CLOSER LOOK", title:"Anomaly watch", description:"Keep a considered eye on supplier rates and inventory changes.", icon:ShieldAlert, label:"Signals & changes" },
  "/app/responsible-travel": { eyebrow:"TRAVEL WITH CARE", title:"Responsible travel", description:"Find partners and experiences that help local communities thrive.", icon:Leaf, label:"Impact explorer" },
  "/app/itinerary-studio": { eyebrow:"MADE IN YOUR SIGNATURE", title:"Itinerary studio", description:"Create polished, shareable journeys with your agency's own identity.", icon:MapPinned, label:"Your design studio" },
};
function FeaturePage({ info }) {
  const Icon=info.icon;
  const [searchParams] = useSearchParams();
  const selectedDestination = getDestination(searchParams.get("destination"));
  return <><PageHeader eyebrow={info.eyebrow} title={<>{info.title}<span className="title-period">.</span></>} description={info.description} action={<Button variant="outline"><ArrowRight size={15}/> New workspace</Button>}/><div className="feature-placeholder"><div className="feature-art"><span className="feature-orbit orbit-one"/><span className="feature-orbit orbit-two"/><span className="feature-icon"><Icon size={25} strokeWidth={1.4}/></span><span className="feature-dot dot-one"/><span className="feature-dot dot-two"/></div><div className="feature-copy"><span className="feature-kicker">A SPACE TO BEGIN</span><h2>{info.label}</h2><p>This part of your workspace is taking shape. Soon, it will bring your travel details and ideas together in one clear view.</p>{selectedDestination && info.label === "Planning canvas" && <div className="prefilled-destination"><span>YOUR STARTING POINT</span><strong>{selectedDestination.cardTitle}</strong><small>Destination added from the Wayfare field notes</small></div>}<div className="feature-status"><span className="feature-status-dot"/> FOUNDATION PREVIEW <span className="feature-status-line"/> WAYFARE</div></div><div className="feature-aside"><span className="aside-number">01</span><span>Good journeys<br/>begin with a<br/><em>good question.</em></span><ArrowDown size={18}/></div></div><p className="placeholder-note"><Sparkles size={14}/> This is a frontend foundation preview. No live supplier, AI, analytics or transaction data is connected.</p></>;
}

function App() {
  return <MotionConfig reducedMotion="user"><BrowserRouter><Routes><Route path="/" element={<LoginPage/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/home" element={<LandingPage/>}/><Route path="/destinations/:slug" element={<DestinationDetails/>}/><Route path="/app" element={<DashboardLayout/>}><Route index element={<OverviewPage/>}/>{Object.entries(placeholderInfo).map(([path, info])=><Route key={path} path={path.replace("/app/","")} element={<FeaturePage info={info}/>}/>)}</Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></BrowserRouter></MotionConfig>;
}

export default App;
