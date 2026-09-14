import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";

// Keep route-only code (especially charts) out of the first app payload.
// Each page stays intact; Vite simply fetches it when its route is visited.
const Login = lazy(() => import("./pages/Login"));
const Home = lazy(() => import("./pages/Home"));
const Finance = lazy(() => import("./pages/Finance"));
const Planner = lazy(() => import("./pages/Planner"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Habits = lazy(() => import("./pages/Habits"));
const Friends = lazy(() => import("./pages/Friends"));
const Profile = lazy(() => import("./pages/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));
import Sidebar from "./components/Sidebar";
import BrandLogo from "./components/BrandLogo";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import QuickCapture from "./components/QuickCapture";
import UdoBackground from "./components/UdoBackground";
import CommandPalette from "./components/CommandPalette";
import KeyboardShortcuts from "./components/KeyboardShortcuts";

/** The signed-in chrome. Login sits outside it, on its own full-page canvas. */
function AppLayout() {
  const { user } = useAuth();

  return (
    <>
      <Sidebar user={user} />
      <QuickCapture />
      <CommandPalette />
      <KeyboardShortcuts />

      <div className="adsense-container">
        <ins
          className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client="ca-pub-1234327380102132"
          data-ad-slot="4768251063"
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
        <script>{`(adsbygoogle = window.adsbygoogle || []).push({});`}</script>
      </div>

      <main className="main-content with-sidebar">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
      {/* Already signed in? The login form has nothing to offer. */}
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />

      <Route element={<AppLayout />}>
        {/* Browsable signed out: a guest sees the page and is sent to login
            only when they try to change something. */}
        <Route path="/" element={<Home />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/habits" element={<Habits />} />
        <Route path="/friends" element={<Friends />} />

        {/* Nothing to show a guest: every control on it needs an account. */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* A real 404 inside the app shell, rather than bouncing to the
            dashboard and leaving the user wondering what happened. */}
        <Route path="*" element={<NotFound />} />
      </Route>
      </Routes>
    </Suspense>
  );
}

function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="sr-only">Loading page…</span>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-subtitle" />
      <div className="panel skeleton-card" />
    </div>
  );
}

function App() {
  const { loading } = useAuth();

  // Hold the whole app until Firebase has restored any existing session,
  // otherwise a protected route redirects a signed-in user on every reload.
  if (loading) {
    return (
      <div className="app-loading-screen" role="status" aria-live="polite">
        <div className="loading-orb" />
        <BrandLogo />
        <p>Syncing your workspace...</p>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {/* Mounted once, outside the routes, so a navigation never restarts the
          animation or leaves a second instance behind. */}
      <UdoBackground />

      {/* One stacking context for everything the app draws. The background is
          position: fixed, so without this it paints over any page whose own
          content is not positioned — Login and the 404 among them. Portalled
          overlays mount to document.body, outside this wrapper, so they still
          sit above it. */}
      <div className="app-layer">
        <AppRoutes />
      </div>
    </BrowserRouter>
  );
}

export default App;
