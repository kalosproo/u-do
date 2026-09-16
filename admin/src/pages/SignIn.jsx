import { useState } from "react";
import { Navigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";

import { auth } from "../services/firebase.js";
import { useAdminAuth } from "../hooks/useAdminAuth.js";

const ADMIN_EMAILS = new Set([
  "muttukururahul@gmail.com",
  "haneeshvarma2006@gmail.com",
]);

/**
 * Admin sign-in uses Firebase email/password only.
 * The allowlist is a UX gate; actual admin authorization remains the
 * Firebase custom admin claim and server-side rules/callables.
 */
export default function SignIn() {
  const { status } = useAdminAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (status === "ready") return <Navigate to="/" replace />;

  const attempt = async (run) => {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!ADMIN_EMAILS.has(normalizedEmail)) {
      setError("This email is not authorized for U.Do admin access.");
      return;
    }

    attempt(() => signInWithEmailAndPassword(auth, normalizedEmail, password));
  };

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <h1>U.Do operations</h1>
        <p>Authorized admin accounts only.</p>

        {error ? <p className="notice">{error}</p> : null}

        <label>
          <span className="figure-label">Email</span>
          <input
            className="field"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>

        <label>
          <span className="figure-label">Password</span>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        <button type="submit" className="button" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

/** Firebase codes are precise but unreadable; say what to do instead. */
function readableError(cause) {
  switch (cause?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password do not match an account.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    default:
      return cause?.message || "Sign-in failed.";
  }
}
