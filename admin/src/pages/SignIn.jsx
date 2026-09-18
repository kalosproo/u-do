import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";

import { auth, googleProvider } from "../services/firebase.js";
import { useAdminAuth } from "../hooks/useAdminAuth.js";

const ADMIN_EMAILS = new Set([
  "muttukururahul@gmail.com",
  "haneeshvarma2006@gmail.com",
]);

/**
 * Admin sign-in is a Google popup, with redirect only as a fallback.
 *
 * The order matters and it is not a preference. signInWithRedirect hands the
 * credential back through the Firebase authDomain — u-do-0.firebaseapp.com —
 * which is a different site from wherever this console is deployed. Browsers
 * that partition third-party storage (Safari always, Chrome increasingly) drop
 * that handoff, so getRedirectResult resolves to null and the app returns to
 * this screen with nothing to show for the round trip. A popup keeps the
 * credential in a window this origin opened, so it survives that partitioning.
 * The consumer app signs in the same way, against the same project.
 *
 * Redirect is still kept for the one case a popup genuinely cannot serve: a
 * browser that blocks it, or an embedded webview with no popup support. There
 * it is the degraded path rather than the default.
 *
 * The email allowlist is an entry-point gate only. Authorization is the
 * Firebase custom admin claim plus the server-side rules and callables, and
 * this list changes neither. It runs on both paths below, because a check that
 * only covers one of them is not a check.
 */
export default function SignIn() {
  const { status } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const enforceAllowlist = useCallback(async (user) => {
    const email = user?.email?.trim().toLowerCase();
    if (email && ADMIN_EMAILS.has(email)) return true;

    await signOut(auth);
    setError("This Google account is not authorized for U.Do admin access.");
    return false;
  }, []);

  // Only ever resolves to a user on the redirect fallback. On the popup path it
  // resolves to null, which is not an error and must not be treated as one.
  useEffect(() => {
    let cancelled = false;

    getRedirectResult(auth)
      .then((result) => {
        if (cancelled || !result?.user) return;
        return enforceAllowlist(result.user);
      })
      .catch((cause) => {
        if (!cancelled) setError(readableError(cause));
      });

    return () => {
      cancelled = true;
    };
  }, [enforceAllowlist]);

  if (status === "ready") return <Navigate to="/" replace />;

  const signIn = async () => {
    setBusy(true);
    setError(null);

    try {
      const result = await signInWithPopup(auth, googleProvider);
      await enforceAllowlist(result.user);
      setBusy(false);
    } catch (cause) {
      if (needsRedirect(cause)) {
        try {
          // Leaves the page. Nothing after this runs on success, and the effect
          // above is what picks the sign-in back up on return.
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectCause) {
          setBusy(false);
          setError(readableError(redirectCause));
          return;
        }
      }

      setBusy(false);
      if (!isDismissal(cause)) setError(readableError(cause));
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
          {busy ? "Opening Google…" : "Continue with Google"}
        </button>
      </div>
    </div>
  );
}

/** A popup the browser refused, rather than one the person closed. */
const needsRedirect = (cause) =>
  cause?.code === "auth/popup-blocked" ||
  cause?.code === "auth/operation-not-supported-in-this-environment";

/** Closing the popup is a decision, not a failure — it gets no error message. */
const isDismissal = (cause) =>
  cause?.code === "auth/popup-closed-by-user" ||
  cause?.code === "auth/cancelled-popup-request" ||
  cause?.code === "auth/user-cancelled";

function readableError(cause) {
  switch (cause?.code) {
    case "auth/unauthorized-domain":
      return `${window.location.hostname} is not an authorized domain for this Firebase project. Add it in Firebase Console → Authentication → Settings → Authorized domains, then try again.`;
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid-please-pass-a-valid-api-key":
      return "This deployment's Firebase API key is wrong or missing. Check VITE_FIREBASE_API_KEY.";
    case "auth/network-request-failed":
      return "Could not reach Firebase. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    default:
      return cause?.message || "Sign-in failed.";
  }
}
