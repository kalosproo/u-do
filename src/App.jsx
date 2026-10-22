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
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Landing = lazy(() => import("./pages/Landing"));
const Focus = lazy(() => import("./pages/Focus"));
const NotFound = lazy(() => import("./pages/NotFound"));
import Sidebar from "./components/Sidebar";
import BrandLogo from "./components/BrandLogo";
import ProtectedRoute from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import QuickCapture from "./components/QuickCapture";
import UdoBackground from "./components/UdoBackground";
import CommandPalette from "./components/CommandPalette";
import ConsentGate from "./components/ConsentGate";
import OfflineNotice from "./components/OfflineNotice";
import WelcomeTour from "./components/WelcomeTour";
import FocusScreen from "./components/focus/FocusScreen";
import FocusPill from "./components/focus/FocusPill";
import VerifyEmailBanner from "./components/VerifyEmailBanner";
import AdSlot from "./components/AdSlot";
import IndexingPolicy from "./components/IndexingPolicy";
import { usePlan } from "./hooks/usePlan";
import KeyboardShortcuts from "./components/KeyboardShortcuts";
import CoachMarks from "./components/CoachMarks";

/** The signed-in chrome. Login sits outside it, on its own full-page canvas. */
function AppLayout() {
  const { user } = useAuth();
  const { adsEnabled: showAds } = usePlan();

  return (
    <>
      <Sidebar user={user} />
      <QuickCapture />
      <CommandPalette />
      <KeyboardShortcuts />

      <AdSlot enabled={showAds} />
      <OfflineNotice />

      <main className="main-content with-sidebar">
        <VerifyEmailBanner />
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

      {/* Signed out, / is the landing page: what U.Do is and a way in.
          Signed in, it is Home inside the app shell. */}
      {user ? null : <Route path="/" element={<Landing />} />}

      <Route element={<AppLayout />}>
        {/* Browsable signed out: a guest sees the page and is sent to login
            only when they try to change something. */}
        {user ? <Route path="/" element={<Home />} /> : null}
        <Route path="/finance" element={<Finance />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/habits" element={<Habits />} />
        <Route path="/focus" element={<Focus />} />
        <Route path="/friends" element={<Friends />} />

        {/* Readable signed out, and readable while the consent prompt is up:
            someone deciding whether to accept has to be able to read it. */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />

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
      <IndexingPolicy />
      <div className="app-layer">
        <AppRoutes />
      </div>

      {/* The focus timer follows the person around the app: full screen or
          the small pill. */}
      <FocusPill />
      <FocusScreen />

      {/* Before the consent prompt, so the prompt renders above it. */}
      <WelcomeTour />

      {/* One-time arrows pointing at the main controls. */}
      <CoachMarks />

      {/* Outside the routes so it covers every page, and portalled to the body
          so it sits above the background layer. */}
      <ConsentGate />
    </BrowserRouter>
  );
}

export default App;
