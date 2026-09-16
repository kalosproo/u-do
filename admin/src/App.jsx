import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AdminShell from "./components/AdminShell.jsx";
import { SECTIONS } from "./navigation.js";
import RequireAdmin from "./components/RequireAdmin.jsx";

const SignIn = lazy(() => import("./pages/SignIn.jsx"));
const Overview = lazy(() => import("./pages/Overview.jsx"));
const NotInstrumented = lazy(() => import("./pages/NotInstrumented.jsx"));

const pending = SECTIONS.filter((section) => !section.built);

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="gate"><p className="page-note">Loading…</p></div>}>
        <Routes>
          <Route path="/sign-in" element={<SignIn />} />

          <Route
            element={
              <RequireAdmin>
                <AdminShell />
              </RequireAdmin>
            }
          >
            <Route index element={<Overview />} />

            {/* Every section is routable from the start. The ones without a
                screen say so plainly rather than 404ing. */}
            {pending.map((section) => (
              <Route
                key={section.path}
                path={section.path}
                element={<NotInstrumented />}
              />
            ))}
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
