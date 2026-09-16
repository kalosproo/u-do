import { useState } from "react";
import { Navigate } from "react-router-dom";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";

import { auth, googleProvider } from "../services/firebase.js";
import { useAdminAuth } from "../hooks/useAdminAuth.js";

/**
 * Sign-in is deliberately plain. It grants nothing on its own: the account
 * still has to carry the admin claim, which is checked on the next screen and
 * again by every rule and callable behind it.
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
    attempt(() => signInWithEmailAndPassword(auth, email.trim(), password));
  };

  return (
    <div className="gate">
      <form className="gate-card" onSubmit={submit}>
        <h1>U.Do operations</h1>
        <p>Admin accounts only. Everyone else should use the app.</p>

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

        <button
          type="button"
          className="button"
          data-variant="quiet"
          disabled={busy}
          onClick={() => attempt(() => signInWithPopup(auth, googleProvider))}
        >
          Continue with Google
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
    case "auth/popup-closed-by-user":
      return "The Google window closed before sign-in finished.";
    default:
      return cause?.message || "Sign-in failed.";
  }
}
