import { useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowRight, Sparkles } from "lucide-react";
import { Button, PageHeader } from "./ui.jsx";
import { featureInfo } from "../data/featureInfo.js";
import { getDestination } from "../data/destinations.js";

/** Generic placeholder shared by every feature route until its real page ships. */
export default function FeaturePage({ path }) {
  const info = featureInfo[path];
  const [searchParams] = useSearchParams();
  const selectedDestination = getDestination(searchParams.get("destination"));
  const Icon = info.icon;
  return <><PageHeader eyebrow={info.eyebrow} title={<>{info.title}<span className="title-period">.</span></>} description={info.description} action={<Button to={info.action.to} variant="outline"><ArrowRight size={15}/> {info.action.label}</Button>}/><div className="feature-placeholder"><div className="feature-art"><span className="feature-orbit orbit-one"/><span className="feature-orbit orbit-two"/><span className="feature-icon"><Icon size={25} strokeWidth={1.4}/></span><span className="feature-dot dot-one"/><span className="feature-dot dot-two"/></div><div className="feature-copy"><span className="feature-kicker">A SPACE TO BEGIN</span><h2>{info.label}</h2><p>This part of your workspace is taking shape. Soon, it will bring your travel details and ideas together in one clear view.</p>{selectedDestination && info.label === "Planning canvas" && <div className="prefilled-destination"><span>YOUR STARTING POINT</span><strong>{selectedDestination.cardTitle}</strong><small>Destination added from the Wayfare field notes</small></div>}<div className="feature-status"><span className="feature-status-dot"/> FOUNDATION PREVIEW <span className="feature-status-line"/> WAYFARE</div></div><div className="feature-aside"><span className="aside-number">01</span><span>Good journeys<br/>begin with a<br/><em>good question.</em></span><ArrowDown size={18}/></div></div><p className="placeholder-note"><Sparkles size={14}/> This is a frontend foundation preview. No live supplier, AI, analytics or transaction data is connected.</p></>;
}
