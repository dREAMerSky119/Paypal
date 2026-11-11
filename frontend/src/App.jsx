import { Suspense, lazy, useEffect } from "react";
import { MotionConfig } from "framer-motion";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import LoginPage from "./components/LoginPage.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { featureInfo } from "./data/featureInfo.js";

// Everything except the login entry route is split out so the first paint
// only downloads what it needs.
const LandingPage = lazy(() => import("./components/LandingPage.jsx"));
const DestinationDetails = lazy(() => import("./components/DestinationDetails.jsx"));
const DashboardLayout = lazy(() => import("./components/DashboardLayout.jsx"));
const OverviewPage = lazy(() => import("./components/OverviewPage.jsx"));
const FeaturePage = lazy(() => import("./components/FeaturePage.jsx"));
const ProfilePage = lazy(() => import("./components/ProfilePage.jsx"));

/** The workspace needs a signed-in demo session, and a completed profile before anything but the profile page. */
function DashboardAccess({ children }) {
  const { isLoggedIn, isProfileComplete } = useAuth();
  const location = useLocation();
  if (!isLoggedIn) return <Navigate to="/" replace state={{ from: location.pathname }} />;
  if (!isProfileComplete && location.pathname !== "/app/profile") return <Navigate to="/app/profile" replace />;
  return children;
}

// Real feature pages. A route listed here replaces its placeholder; anything not
// listed keeps rendering FeaturePage. Add one line per feature as it ships.
const featurePages = {
  "/app/inventory": lazy(() => import("./components/InventoryPage.jsx")),
  "/app/ai-studio": lazy(() => import("./components/AdvisorPage.jsx")),
  "/app/analytics": lazy(() => import("./components/ProfitabilityPage.jsx")),
  "/app/forecast": lazy(() => import("./components/DemandForecastPage.jsx")),
  "/app/simulator": lazy(() => import("./components/SimulatorPage.jsx")),
  "/app/responsible-travel": lazy(() => import("./components/ResponsibleTravelPage.jsx")),
  "/app/ai-operations": lazy(() => import("./components/AIOperationsPage.jsx")),
  "/app/related-spots": lazy(() => import("./components/RelatedSpotsPage.jsx")),
  "/app/anomalies": lazy(() => import("./components/SupplierAnomalyPage.jsx")),
  "/app/packages": lazy(() => import("./components/PackageBuilderPage.jsx")),
  "/app/itinerary-studio": lazy(() => import("./components/ItineraryStudioPage.jsx")),
};

function RouteFallback() {
  return <div className="route-fallback" role="status" aria-live="polite">Loading…</div>;
}

/** Scrolls to #hash targets (e.g. /home#discover) and back to top on plain navigation. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) { target.scrollIntoView(); return; }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export function AppRoutes() {
  return <Suspense fallback={<RouteFallback />}><Routes>
    <Route path="/" element={<LoginPage/>}/>
    <Route path="/login" element={<LoginPage/>}/>
    <Route path="/home" element={<LandingPage/>}/>
    <Route path="/destinations/:slug" element={<DestinationDetails/>}/>
    <Route path="/app" element={<DashboardAccess><DashboardLayout/></DashboardAccess>}>
      <Route index element={<OverviewPage/>}/>
      <Route path="profile" element={<ProfilePage/>}/>
      {Object.keys(featureInfo).map((path) => {
        const Page = featurePages[path];
        return <Route key={path} path={path.replace("/app/", "")} element={Page ? <Page/> : <FeaturePage path={path}/>}/>;
      })}
    </Route>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></Suspense>;
}

export default function App() {
  return <MotionConfig reducedMotion="user"><AuthProvider><BrowserRouter><ScrollManager/><AppRoutes/></BrowserRouter></AuthProvider></MotionConfig>;
}
