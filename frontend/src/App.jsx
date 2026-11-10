
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
import { featureInfo } from "./data/featureInfo.js";

// Everything except login is lazy-loaded.
const LandingPage = lazy(() =>
  import("./components/LandingPage.jsx")
);

const DestinationDetails = lazy(() =>
  import("./components/DestinationDetails.jsx")
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
          element={<LandingPage />}
        />

        <Route
          path="/destinations/:slug"
          element={<DestinationDetails />}
        />

        <Route
          path="/app"
          element={<DashboardLayout />}
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

          {/*
            Explicit fallback route for Anomaly Watch.
            This also handles the page if featureInfo does
            not contain /app/anomalies.
          */}
          {!featureInfo["/app/anomalies"] && (
            <Route
              path="anomalies"
              element={
                <ReactAnomalyPage />
              }
            />
          )}
        </Route>

        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </Suspense>
  );
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
