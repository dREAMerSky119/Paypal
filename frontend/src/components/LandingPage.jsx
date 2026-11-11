import { useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowDown, ArrowRight, ArrowUpRight, Compass, Leaf } from "lucide-react";
import { Brand, Button } from "./ui.jsx";
import { destinations } from "../data/destinations.js";
import { pad2 } from "../lib/format.js";

const MotionLink = motion(Link);

const approachPoints = [
  { title: "See the whole picture", body: "A clear view of the stays, guides and experiences you trust." },
  { title: "Make room for the unexpected", body: "Plan with intelligence that leaves space for discovery." },
  { title: "Bring every detail together", body: "Shape seamless itineraries from first thought to final flourish." },
];

const heroTextVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: .8, ease: [0.22, 1, 0.36, 1] } },
};

export default function LandingPage() {
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
      <div className="hero-index"><span>{pad2(1)}</span><i /><span>{pad2(destinations.length)}</span></div>
    </section>
    <section className="intro-strip wrap"><p className="eyebrow">A PARTNER IN EVERY DETAIL</p><p>From the first spark of inspiration to the last mile home, <span>Wayfare brings the pieces of exceptional travel together.</span></p><span className="intro-stamp">MADE FOR<br />THE JOURNEY <Compass size={25} strokeWidth={1.2} /></span></section>
    <section className="discover section-pad" id="discover"><div className="wrap"><div className="section-heading"><div><p className="eyebrow">THE WORLD, WELL CONSIDERED</p><h2>Places with a <em>sense of place.</em></h2></div><a href="#destination-grid" className="text-link">Browse all {destinations.length} destinations <ArrowRight size={16} /></a></div><div className="destination-grid" id="destination-grid">{destinations.map((d, i) => <MotionLink to={`/destinations/${d.slug}`} aria-label={`Discover ${d.cardTitle}`} className={`destination-card destination-${(i % 3) + 1}`} key={d.slug} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }} viewport={{ once: true, amount: .2 }} transition={{ duration: .6, delay: i * .12, ease: [0.22, 1, 0.36, 1] }}><img src={`https://images.unsplash.com/${d.cardImage}?auto=format&fit=crop&w=1000&q=85`} alt={d.cardTitle} loading="lazy" onError={(event) => {event.currentTarget.style.display = "none";}} /><div className="destination-shade" /><span className="destination-type">{d.type}</span><div className="destination-info"><div><h3>{d.cardTitle}</h3><p>{d.detail}</p></div><span className="destination-arrow"><ArrowUpRight size={17} /></span></div></MotionLink>)}</div><div className="discover-foot"><span>CURATED FOR THE CURIOUS</span><span>{pad2(1)} — {pad2(destinations.length)}</span></div></div></section>
    <motion.section className="approach section-pad" id="approach" initial={{opacity:0,y:18}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.12}} transition={{duration:.7,ease:[.22,1,.36,1]}}><div className="wrap approach-grid"><div className="approach-photo"><img src="https://images.unsplash.com/photo-1516483638261-f4dbaf036963?auto=format&fit=crop&w=1400&q=85" alt="Colorful coastal villages of Cinque Terre, Italy" loading="lazy"/><div className="photo-caption"><span>THE ART OF A WELL-MADE JOURNEY</span><span>{pad2(1)} / {pad2(approachPoints.length)}</span></div><div className="photo-seal"><Compass size={22} /><span>GO WITH<br />GOOD INTENT</span></div></div><div className="approach-copy"><p className="eyebrow">INTELLIGENCE, WITH INTENTION</p><h2>More than a plan.<br />A feeling that <em>stays.</em></h2><p>Great travel is equal parts instinct and detail. Wayfare brings your suppliers, insight and ideas into one thoughtful workspace, so you can spend less time connecting dots and more time creating moments.</p><div className="approach-list">{approachPoints.map((point, i) => <div key={point.title}><span>{pad2(i + 1)}</span><p><strong>{point.title}</strong><br />{point.body}</p></div>)}</div><Button to="/app" variant="outline">Explore the workspace <ArrowRight size={16} /></Button></div></div></motion.section>
    <motion.section className="responsible section-pad" id="responsible" initial={{opacity:0,y:18}} whileInView={{opacity:1,y:0}} viewport={{once:true,amount:.12}} transition={{duration:.7,ease:[.22,1,.36,1]}}><div className="responsible-image"/><div className="responsible-inner wrap"><div className="responsible-copy"><span className="responsible-icon"><Leaf size={20} /></span><p className="eyebrow eyebrow-light">TRAVEL THAT GIVES BACK</p><h2>Leave a place<br /><em>better than you found it.</em></h2><p>Find the locally rooted stays, independent guides and community-led experiences that help a destination thrive long after the journey ends.</p><Button to="/app/responsible-travel" variant="light">Discover responsible travel <ArrowRight size={16} /></Button></div><div className="responsible-aside"><span>THE WAYFARER'S<br />PLEDGE</span><div className="pledge-mark"><Leaf size={32} strokeWidth={1} /></div><p>Travel gently.<br />Leave generously.</p></div></div></motion.section>
    <footer className="landing-footer"><div className="wrap footer-main"><div><Brand to="/home" /><p>Thoughtful journeys start here.</p></div><div className="footer-links"><div><span>EXPLORE</span><a href="#discover">Destinations</a><a href="#approach">Our approach</a></div><div><span>FOR PROFESSIONALS</span><Link to="/app">Agent workspace</Link><Link to="/app/ai-studio">AI studio</Link></div><div><span>OUR VALUES</span><a href="#responsible">Responsible travel</a><a href="#responsible">Community first</a></div></div></div><div className="wrap footer-bottom"><span>© 2026 WAYFARE TRAVEL CO.</span><span>MADE FOR THE WAY THERE.</span><a href="#top" onClick={(e) => {e.preventDefault(); window.scrollTo({top:0,behavior:"smooth"});}}>BACK TO TOP ↑</a></div></footer>
  </main>;
}
