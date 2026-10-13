import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import AdminShell from "./components/AdminShell.jsx";
import { SECTIONS } from "./navigation.js";
import RequireAdmin from "./components/RequireAdmin.jsx";

const SignIn = lazy(() => import("./pages/SignIn.jsx"));
const Overview = lazy(() => import("./pages/Overview.jsx"));
const Users = lazy(() => import("./pages/Users.jsx"));
const Activity = lazy(() => import("./pages/Activity.jsx"));
const Subscriptions = lazy(() => import("./pages/Subscriptions.jsx"));
const Payments = lazy(() => import("./pages/Payments.jsx"));
const Revenue = lazy(() => import("./pages/Revenue.jsx"));
const Usage = lazy(() => import("./pages/Usage.jsx"));
const Errors = lazy(() => import("./pages/Errors.jsx"));
const Webhooks = lazy(() => import("./pages/Webhooks.jsx"));
const Limits = lazy(() => import("./pages/Limits.jsx"));
const Audit = lazy(() => import("./pages/Audit.jsx"));
const Reports = lazy(() => import("./pages/Reports.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
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
            <Route path="/users" element={<Users />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/subscriptions" element={<Subscriptions />} />
            <Route path="/payments" element={<Payments />} />
            <Route path="/revenue" element={<Revenue />} />
            <Route path="/usage" element={<Usage />} />
            <Route path="/errors" element={<Errors />} />
            <Route path="/webhooks" element={<Webhooks />} />
            <Route path="/limits" element={<Limits />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />

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
