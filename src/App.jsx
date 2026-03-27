import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "./services/firebase";

import Login from "./pages/Login";
import Home from "./pages/Home";
import Finance from "./pages/Finance";
import Planner from "./pages/Planner";
import Tasks from "./pages/Tasks";
import Habits from "./pages/Habits";
import Profile from "./pages/Profile";
import Sidebar from "./components/Sidebar";
import BrandLogo from "./components/BrandLogo";

function Protected({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

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
    {user && (
      <Sidebar/>
    )}

    <main className={`main-content ${user ? "with-sidebar" : "no-sidebar"}`}>
      
      <Routes>
        {/* LOGIN */}
        <Route path="/login" element={<Login />} />

        {/* PROTECTED ROUTES */}
        <Route
          path="/"
          element={
            <Protected user={user}>
              <Home />
            </Protected>
          }
        />

        <Route
          path="/finance"
          element={
            <Protected user={user}>
              <Finance />
            </Protected>
          }
        />

        <Route
          path="/planner"
          element={
            <Protected user={user}>
              <Planner />
            </Protected>
          }
        />

        <Route
          path="/tasks"
          element={
            <Protected user={user}>
              <Tasks />
            </Protected>
          }
        />

        <Route
          path="/habits"
          element={
            <Protected user={user}>
              <Habits />
            </Protected>
          }
        />

        <Route
          path="/profile"
          element={
            <Protected user={user}>
              <Profile />
            </Protected>
          }
        />

        {/* CATCH ALL */}
        <Route
          path="*"
          element={<Navigate to={user ? "/" : "/login"} replace />}
        />
      </Routes>
    </main>
  </BrowserRouter>
)};
export default App;
