
import { Suspense, lazy, useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { MotionConfig } from "framer-motion";

import LoginPage from "./components/LoginPage.jsx";
import ProfilePage from "./components/ProfilePage.jsx";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { featureInfo } from "./data/featureInfo.js";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// Everything except login is lazy-loaded.
const LandingPage = lazy(() =>
  import("./components/LandingPage.jsx")
);

const DestinationDetails = lazy(() =>
  import("./components/DestinationDetails.jsx")
);

const AttributionPage = lazy(() =>
  import("./components/AttributionPage.jsx")
);

const DashboardLayout = lazy(() =>
  import("./components/DashboardLayout.jsx")
);

const OverviewPage = lazy(() =>
  import("./components/OverviewPage.jsx")
);

const FeaturePage = lazy(() =>
  import("./components/FeaturePage.jsx")
);

// Feature pages.
const featurePages = {
  "/app/inventory": lazy(() =>
    import("./components/InventoryPage.jsx")
  ),

  "/app/ai-studio": lazy(() =>
    import("./components/AdvisorPage.jsx")
  ),

  "/app/analytics": lazy(() =>
    import("./components/ProfitabilityPage.jsx")
  ),

  "/app/forecast": lazy(() =>
    import("./components/DemandForecastPage.jsx")
  ),

  "/app/simulator": lazy(() =>
    import("./components/SimulatorPage.jsx")
  ),

  "/app/responsible-travel": lazy(() =>
    import("./components/ResponsibleTravelPage.jsx")
  ),

  "/app/ai-operations": lazy(() =>
    import("./components/AIOperationsPage.jsx")
  ),

  "/app/related-spots": lazy(() =>
    import("./components/RelatedSpotsPage.jsx")
  ),

  "/app/packages": lazy(() =>
    import("./components/PackageBuilderPage.jsx")
  ),

  "/app/itinerary-studio": lazy(() =>
    import("./components/ItineraryStudioPage.jsx")
  ),

  // NEW: Supplier Price Anomaly Detection
  "/app/anomalies": lazy(() =>
    import("./components/SupplierAnomalyPage.jsx")
  ),
};

function RouteFallback() {
  return (
    <div
      className="route-fallback"
      role="status"
      aria-live="polite"
    >
      Loading…
    </div>
  );
}

// Scroll management for page navigation.
function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));

      if (target) {
        target.scrollIntoView();
        return;
      }
    }

    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}

export function AppRoutes() {
  return (
    <AuthProvider>
      <ErrorBoundary resetKey={useLocation().pathname}>
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route
          path="/"
          element={<LoginPage />}
        />

        <Route
          path="/login"
          element={<LoginPage />}
        />

        <Route
          path="/home"
          element={<ProtectedHome />}
        />

        <Route
          path="/destinations/:slug"
          element={<DestinationDetails />}
        />

        <Route
          path="/attribution"
          element={<AttributionPage />}
        />

        <Route
          path="/profile"
          element={<ProfilePage />}
        />

        <Route
          path="/app"
          element={<ProtectedDashboard />}
        >
          <Route
            index
            element={<OverviewPage />}
          />

          {Object.keys(featureInfo).map((path) => {
            const Page = featurePages[path];

            return (
              <Route
                key={path}
                path={path.replace("/app/", "")}
                element={
                  Page
                    ? <Page />
                    : <FeaturePage path={path} />
                }
              />
            );
          })}

        </Route>

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </AuthProvider>
  );
}

// Demo auth gate: a signed-in user without a complete profile goes through
// onboarding first; anyone else sees the sign-in page.
function ProtectedDashboard() {
  const { isLoggedIn, isProfileComplete } = useAuth();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (!isProfileComplete) return <Navigate to="/profile" replace />;
  return <DashboardLayout />;
}

function ProtectedHome() {
  const { isLoggedIn, isProfileComplete } = useAuth();
  if (!isLoggedIn) return <LoginPage />;
  if (!isProfileComplete) return <Navigate to="/profile" replace />;
  return <LandingPage />;
}

// Use the lazy-loaded component directly for the fallback.
function ReactAnomalyPage() {
  const Page = featurePages["/app/anomalies"];
  return <Page />;
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <ScrollManager />
        <AppRoutes />
      </BrowserRouter>
    </MotionConfig>
  );
}
