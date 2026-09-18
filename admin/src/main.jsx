import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import SetupNeeded from "./pages/SetupNeeded.jsx";
import { AdminAuthProvider } from "./context/AdminAuthContext.jsx";
import { applyStoredTheme } from "./hooks/useTheme.js";
import { MISSING_ENV } from "./services/firebase.js";
import "./styles/tokens.css";
import "./styles/admin.css";

applyStoredTheme();

// Firebase never initialised, so nothing below it can mount — including the
// auth provider, which would call onAuthStateChanged on a null instance.
const tree =
  MISSING_ENV.length > 0 ? (
    <SetupNeeded missing={MISSING_ENV} />
  ) : (
    <AdminAuthProvider>
      <App />
    </AdminAuthProvider>
  );

createRoot(document.getElementById("root")).render(<StrictMode>{tree}</StrictMode>);
