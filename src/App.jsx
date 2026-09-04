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
import QuickCapture from "./components/QuickCapture";

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
    <>
      <Sidebar user={user} />
      <QuickCapture />
    </>

    <main className="main-content with-sidebar">
      
      <Routes>
        {/* LOGIN */}
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<Home />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/planner" element={<Planner />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/habits" element={<Habits />} />
        <Route path="/profile" element={<Profile />} />

        {/* CATCH ALL */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </main>
  </BrowserRouter>
)};
export default App;
