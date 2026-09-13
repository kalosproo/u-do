import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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

function App() {
  const { user, loading } = useAuth();

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
      <Sidebar user={user} />
      <QuickCapture />

      <main className="main-content with-sidebar">
        <Routes>
          <Route path="/login" element={<Login />} />

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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}

export default App;
