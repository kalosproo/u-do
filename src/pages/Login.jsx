import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { auth, googleProvider } from "../services/firebase";
import { recordConsent } from "../services/consent";

const MIN_PASSWORD_LENGTH = 6;

const normalizeEmail = (value) => value.trim().toLowerCase();

const validate = (email, password) => {
  const normalized = normalizeEmail(email);
  const [, domain = ""] = normalized.split("@");

  if (!normalized.includes("@") || !domain.includes(".")) return "Enter a valid email address.";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return "";
};

/** Firebase error codes are not for reading aloud. */
const describeAuthError = (error) => {
  switch (error?.code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match an account.";
    case "auth/email-already-in-use":
      return "An account already uses that email. Try logging in.";
    case "auth/weak-password":
      return `Password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network problem — check your connection.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    default:
      return "Something went wrong. Please try again.";
  }
};

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const submit = async () => {
    const validationError = validate(email, password);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (isSignup && !agreed) {
      setError("Please read and accept the Privacy Policy to create an account.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const formattedEmail = normalizeEmail(email);

      if (isSignup) {
        const created = await createUserWithEmailAndPassword(auth, formattedEmail, password);
        // Recorded after the account exists, because the record is keyed by uid
        // and the rules only accept it from the account it describes.
        await recordConsent(created.user.uid, "signup");
      } else {
        await signInWithEmailAndPassword(auth, formattedEmail, password);
      }

      navigate("/", { replace: true });
    } catch (authError) {
      setError(describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = async () => {
    if (isSignup && !agreed) {
      setError("Please read and accept the Privacy Policy to create an account.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await signInWithPopup(auth, googleProvider);

      // Google is a signup path as much as a login one, and there is no flag on
      // the result that reliably separates the two across providers. Recording
      // on the signup tab only is enough: an existing account that skips this
      // is caught by the consent gate on its next load.
      if (isSignup) await recordConsent(result.user.uid, "signup-google");

      navigate("/", { replace: true });
    } catch (authError) {
      setError(describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (signup) => {
    setIsSignup(signup);
    setError("");
    setAgreed(false);
  };

  return (
    <section className="login-page">
      <div className="login-card">
        <BrandLogo />
        <p>{isSignup ? "Create an account to get started." : "Log in to pick up where you left off."}</p>

        <div className="login-tabs" role="tablist" aria-label="Auth mode">
          <button
            type="button"
            role="tab"
            aria-selected={!isSignup}
            className={!isSignup ? "active" : ""}
            onClick={() => switchMode(false)}
          >
            Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={isSignup}
            className={isSignup ? "active" : ""}
            onClick={() => switchMode(true)}
          >
            Sign Up
          </button>
        </div>

        <button type="button" className="btn login-google" onClick={googleLogin} disabled={busy}>
          Continue with Google
        </button>

        <div className="login-divider" />

        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>

        {isSignup ? (
          <label className="consent-check">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I have read and accept the{" "}
              <Link to="/privacy" target="_blank" rel="noreferrer">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        ) : null}

        {error ? <p className="login-error">{error}</p> : null}

        <button
          type="button"
          className="btn btn-primary login-primary"
          onClick={submit}
          disabled={busy || (isSignup && !agreed)}
        >
          {busy ? "Please wait…" : isSignup ? "Create Account" : "Login"}
        </button>
      </div>
    </section>
  );
}

export default Login;
