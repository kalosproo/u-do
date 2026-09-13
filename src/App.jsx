import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";

import Login from "./pages/Login";
import Home from "./pages/Home";
import Finance from "./pages/Finance";
import Planner from "./pages/Planner";
import Tasks from "./pages/Tasks";
import Habits from "./pages/Habits";
import Friends from "./pages/Friends";
import Profile from "./pages/Profile";
import Sidebar from "./components/Sidebar";
import BrandLogo from "./components/BrandLogo";
import ProtectedRoute from "./components/ProtectedRoute";
import QuickCapture from "./components/QuickCapture";

/** The signed-in chrome. Login sits outside it, on its own full-page canvas. */
function AppLayout() {
  const { user } = useAuth();

  return (
    <>
      <Sidebar user={user} />
      <QuickCapture />

      <main className="main-content with-sidebar">
        <Outlet />
      </main>
    </>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
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
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
