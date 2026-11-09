import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Leaf, MapPinned, Sparkles, Users, WalletCards, ArrowUpRight, X } from "lucide-react";
import { ApiState, Button, MetricCard, PageHeader, Status } from "./ui.jsx";
import RowMenu from "./RowMenu.jsx";
import { useApi } from "../lib/useApi.js";
import { trendGeometry } from "../lib/chart.js";
import { addDays, formatEyebrowDate, formatShortDate, greeting } from "../lib/format.js";

const metricIcons = { gbv: WalletCards, itineraries: MapPinned, margin: BarChart3, suppliers: Users };
const photo = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=100&q=75`;

export default function OverviewPage() {
  const api = useApi("/overview");
  const [bannerOpen, setBannerOpen] = useState(true);
  const now = useMemo(() => new Date(), []);
  const data = api.data;
  const trend = useMemo(() => trendGeometry(data?.trend?.values), [data]);

  return <>
    <PageHeader eyebrow={formatEyebrowDate(now)} title={<>{greeting(now.getHours())}, Alex<span className="title-period">.</span></>} description="A considered start to the journeys taking shape this week." action={<Button to="/app/packages" variant="primary"><ArrowRight size={15}/> Create an itinerary</Button>}/>
    {bannerOpen && <div className="illustrative-banner"><span className="illustrative-mark"><Sparkles size={15}/></span><p><strong>Illustrative workspace preview</strong><span>All figures and bookings shown are sample data for demonstration purposes.</span></p><button type="button" aria-label="Dismiss notice" onClick={() => setBannerOpen(false)}><X size={16}/></button></div>}
    <ApiState api={api} label="the overview" />
    {data && <>
      <section className="metrics-grid" aria-label="Illustrative business metrics">{data.metrics.map((m) => <MetricCard key={m.key} label={m.label} value={m.value} change={m.change} detail={m.detail} icon={metricIcons[m.key] ?? BarChart3}/>)}</section>
      <div className="overview-grid">
        <section className="panel booking-panel"><div className="panel-heading"><div><p className="eyebrow">WHAT'S TAKING SHAPE</p><h2>Upcoming journeys</h2></div><Button to="/app/packages" variant="quiet">View all <ArrowRight size={15}/></Button></div>
          <div className="booking-table"><div className="booking-row booking-head"><span>JOURNEY</span><span>TRAVELLER</span><span>DEPARTURE</span><span>STATUS</span><span/></div>
            {data.journeys.map((j) => <div className="booking-row" key={j.id}><div className="booking-destination"><img src={photo(j.image)} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }}/><span><strong>{j.place}</strong><small>{j.region}</small></span></div><div className="traveller-cell"><span className="traveller-avatar">{j.initials}</span>{j.traveller}</div><span className="booking-date">{formatShortDate(addDays(now, j.departure_offset_days))}</span><Status tone={j.tone}>{j.status}</Status><RowMenu label={j.place} items={[{ label: "Open in package builder", to: "/app/packages" }, { label: "Open in itinerary studio", to: "/app/itinerary-studio" }]}/></div>)}
          </div><p className="sample-note"><span/> Sample journeys · no real bookings or transactions</p></section>
        <aside className="panel insight-panel"><div className="panel-heading"><div><p className="eyebrow">A LITTLE PERSPECTIVE</p><h2>On the horizon</h2></div><span className="insight-spark"><Sparkles size={16}/></span></div>
          <div className="insight-feature"><div className="insight-chart"><div className="chart-y">{trend.ticks.map((t) => <span key={t}>{t}</span>)}</div><div className="chart-area"><div className="chart-lines"><i/><i/><i/><i/></div>
            <svg viewBox="0 0 280 120" preserveAspectRatio="none" aria-label="Illustrative trend chart"><defs><linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d6ad62" stopOpacity=".32"/><stop offset="1" stopColor="#d6ad62" stopOpacity="0"/></linearGradient></defs><path d={trend.area} fill="url(#area-fill)"/><path d={trend.line} fill="none" stroke="#98773b" strokeWidth="2" vectorEffect="non-scaling-stroke"/></svg>
            <div className="chart-x">{data.trend.labels.map((l) => <span key={l}>{l}</span>)}</div></div></div>
            <div className="insight-summary"><div><strong>{data.trend.summary_value}</strong><span>{data.trend.summary_text}</span></div><span className="insight-tag"><ArrowUpRight size={13}/> TREND</span></div><p className="insight-footnote">{data.trend.footnote}</p></div>
          <Link className="insight-bottom" to="/app/responsible-travel"><span className="insight-small-icon"><Leaf size={16}/></span><span><strong>Thoughtful by nature</strong><small>{data.responsible_note}</small></span><ArrowRight size={15}/></Link>
        </aside>
      </div>
      <div className="overview-footerline"><span>YOUR AGENCY, AT A GLANCE</span><span>LAST UPDATED JUST NOW <i/></span></div>
    </>}
  </>;
}
