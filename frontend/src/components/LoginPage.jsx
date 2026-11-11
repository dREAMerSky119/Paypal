import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Plane } from "lucide-react";
import { reelSets } from "../data/loginReels.js";
import { validateDemoCredentials } from "../lib/demoAuth.js";
import { useAuth } from "../context/AuthContext.jsx";
import "../login.css";

function PhotoSequence({ images, duplicate = false }) {
  return <div className="reel-sequence" aria-hidden={duplicate}>
    {images.map((image, index) => <div className="reel-photo" key={`${image.place}-${index}`}>
      <img src={`https://images.unsplash.com/${image.image}?auto=format&fit=crop&w=900&q=80`} alt="" loading={index < 3 && !duplicate ? "eager" : "lazy"} onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.parentElement.classList.add("reel-photo-fallback"); }}/>
      <span className="reel-place">{image.place}</span>
    </div>)}
  </div>;
}

function DestinationReels() {
  return <aside className="login-visual" aria-label="Three continuously moving reels of destination photography">
    <div className="reel-columns">
      {reelSets.map((images, index) => <div className={`photo-reel photo-reel-${index + 1}`} key={index}>
        <div className="reel-track"><PhotoSequence images={images}/><PhotoSequence images={images} duplicate/></div>
      </div>)}
    </div>
    <div className="reel-shade"/>
    <Link to="/" className="login-visual-brand"><span className="login-brand-mark"><Plane size={15}/></span><span>wayfare<span>.</span></span></Link>
    <div className="login-visual-caption"><span>THE WORLD, WELL CONSIDERED</span><i/><span>WAYFARE FIELD NOTES</span></div>
  </aside>;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [notice, setNotice] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef(false);

  function handleSubmit(event) {
    event.preventDefault();
    if (processingRef.current) return;
    const createProfileFlow = event.nativeEvent?.submitter?.value === "profile";
    const validationErrors = validateDemoCredentials(email, password);
    setErrors(validationErrors);
    setNotice("");
    if (Object.keys(validationErrors).length) return;

    processingRef.current = true;
    setIsProcessing(true);
    try {
      const account = login(email);
      setPassword("");
      window.setTimeout(() => {
        navigate(createProfileFlow || !account.profile ? "/app/profile" : "/home", { replace: true });
      }, 250);
    } catch (error) {
      processingRef.current = false;
      setIsProcessing(false);
      setNotice(error.message || "Could not start a temporary demo session.");
    }
  }

  return <main className="login-page">
    <DestinationReels/>
    <section className="login-panel">
      <header className="login-mobile-header"><Link to="/" className="login-brand"><span className="login-brand-mark"><Plane size={15}/></span><span>wayfare<span>.</span></span></Link></header>
      <div className="login-form-wrap">
        <p className="eyebrow login-eyebrow">AGENCY WORKSPACE</p>
        <h1>Welcome <em>back.</em></h1>
        <p className="login-intro">Sign in to continue shaping journeys worth remembering.</p>
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <label htmlFor="login-email">Work email</label>
          <input id="login-email" name="email" type="email" autoComplete="username" placeholder="you@agency.com" value={email} onChange={(event) => {setEmail(event.target.value); setErrors((current) => ({...current,email:""}));}} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "login-email-error" : undefined} disabled={isProcessing}/>
          {errors.email && <p id="login-email-error" className="login-field-error" role="alert">{errors.email}</p>}
          <div className="password-label"><label htmlFor="login-password">Password</label><button type="button" className="forgot-password" onClick={() => setNotice("Password reset is not configured in this demo.")}>Forgot password?</button></div>
          <div className="password-input-wrap"><input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => {setPassword(event.target.value); setErrors((current) => ({...current,password:""}));}} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "login-password-error" : undefined} disabled={isProcessing}/><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Hide password" : "Show password"} disabled={isProcessing}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div>
          {errors.password && <p id="login-password-error" className="login-field-error" role="alert">{errors.password}</p>}
          <button className="login-submit" type="submit" disabled={isProcessing}>{isProcessing ? "Opening demo workspace…" : "Sign in"} {!isProcessing && <ArrowRight size={16}/>}</button>
          <button className="login-create-profile" type="submit" name="intent" value="profile" disabled={isProcessing}>Create Profile <ArrowRight size={14}/></button>
          <div className="login-divider"><span>OR</span></div>
          <button className="google-signin" type="button" onClick={() => setNotice("Google OAuth is not configured yet. Use the demo email and password fields above.")} disabled={isProcessing}><span className="google-mark">G</span> Continue with Google</button>
          <p className="oauth-caption">Google OAuth isn't configured yet.</p>
          {notice && <p className="login-preview-note" role="status">{notice}</p>}
        </form>
        <p className="demo-auth-disclaimer">DEMO ONLY · Any valid email and non-empty password opens a temporary browser session. Passwords are never stored. This is not production authentication.</p>
        <p className="login-help">New to Wayfare? <a href="mailto:hello@wayfare.travel">Talk to our team</a></p>
      </div>
      <footer className="login-footer"><span>© 2026 WAYFARE TRAVEL CO.</span><Link to="/home">BACK TO WAYFARE</Link></footer>
    </section>
  </main>;
}
