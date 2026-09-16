import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getRedirectResult, signInWithRedirect, signOut } from "firebase/auth";

import { auth, googleProvider } from "../services/firebase.js";
import { useAdminAuth } from "../hooks/useAdminAuth.js";

const ADMIN_EMAILS = new Set([
  "muttukururahul@gmail.com",
  "haneeshvarma2006@gmail.com",
]);

/**
 * Admin sign-in uses Google redirect only. The email allowlist is an
 * entry-point gate; actual authorization remains the Firebase custom admin
 * claim and the server-side rules/callables.
 */
export default function SignIn() {
  const { status } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const finishRedirect = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result?.user || cancelled) return;

        const email = result.user.email?.trim().toLowerCase();
        if (!email || !ADMIN_EMAILS.has(email)) {
          await signOut(auth);
          if (!cancelled) {
            setError("This Google account is not authorized for U.Do admin access.");
          }
        }
      } catch (cause) {
        if (!cancelled) setError(readableError(cause));
      }
    };

    finishRedirect();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "ready") return <Navigate to="/" replace />;

  const signIn = async () => {
    setBusy(true);
    setError(null);

    try {
      await signInWithRedirect(auth, googleProvider);
    } catch (cause) {
      setBusy(false);
      setError(readableError(cause));
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
          {busy ? "Redirecting to Google…" : "Continue with Google"}
        </button>
      </div>
    </div>
  );
}

function readableError(cause) {
  switch (cause?.code) {
    case "auth/unauthorized-domain":
      return "This admin domain is not authorized in Firebase Authentication. Add the deployed admin domain to Authorized domains in Firebase Console.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    default:
      return cause?.message || "Sign-in failed.";
  }
}
