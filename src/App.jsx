import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "./services/firebase";

import Login from "./pages/Login";
import Home from "./pages/Home";
import Finance from "./pages/Finance";
import Planner from "./pages/Planner";
import Tasks from "./pages/Tasks";
import Habits from "./pages/Habits";
import Sidebar from "./components/Sidebar";

function Protected({ user, children }) {
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return <p>Loading...</p>;

  return (
    <BrowserRouter>
      {user && <Sidebar onLogout={() => signOut(auth)} />}

      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <Protected user={user}>
              <Home />
            </Protected>
          }
        />

        <Route path="/finance" element={<Protected user={user}><Finance /></Protected>} />
        <Route path="/planner" element={<Protected user={user}><Planner /></Protected>} />
        <Route path="/tasks" element={<Protected user={user}><Tasks /></Protected>} />
        <Route path="/habits" element={<Protected user={user}><Habits /></Protected>} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
