import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import { AdminAuthProvider } from "./context/AdminAuthContext.jsx";
import "./styles/admin.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AdminAuthProvider>
      <App />
    </AdminAuthProvider>
  </StrictMode>,
);
