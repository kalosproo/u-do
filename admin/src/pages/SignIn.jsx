import { useState } from "react";
import { Navigate } from "react-router-dom";
import { signInWithPopup, signOut } from "firebase/auth";

import { auth, googleProvider } from "../services/firebase.js";
import { useAdminAuth } from "../hooks/useAdminAuth.js";

const ADMIN_EMAILS = new Set([
  "muttukururahul@gmail.com",
  "haneeshvarma2006@gmail.com",
]);

/**
 * Admin sign-in uses Google only. The email allowlist is an entry-point gate;
 * actual authorization remains the Firebase custom admin claim and the
 * server-side rules/callables.
 */
export default function SignIn() {
  const { status } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (status === "ready") return <Navigate to="/" replace />;

  const signIn = async () => {
    setBusy(true);
    setError(null);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email?.trim().toLowerCase();

      if (!email || !ADMIN_EMAILS.has(email)) {
        await signOut(auth);
        setError("This Google account is not authorized for U.Do admin access.");
      }
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate">
      <div className="gate-card">
        <h1>U.Do operations</h1>
        <p>Authorized admin accounts only.</p>

        {error ? <p className="notice">{error}</p> : null}

        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={signIn}
        >
          {busy ? "Signing in…" : "Continue with Google"}
        </button>
      </div>
    </div>
  );
}

function readableError(cause) {
  switch (cause?.code) {
    case "auth/popup-closed-by-user":
      return "The Google sign-in window was closed before sign-in finished.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in popup. Allow popups and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    default:
      return cause?.message || "Sign-in failed.";
  }
}
