import { useState } from "react";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { auth, googleProvider } from "../services/firebase";

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

  const submit = async () => {
    const validationError = validate(email, password);

    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError("");

    try {
      const formattedEmail = normalizeEmail(email);

      if (isSignup) {
        await createUserWithEmailAndPassword(auth, formattedEmail, password);
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
    setBusy(true);
    setError("");

    try {
      await signInWithPopup(auth, googleProvider);
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

        {error ? <p className="login-error">{error}</p> : null}

        <button type="button" className="btn btn-primary login-primary" onClick={submit} disabled={busy}>
          {busy ? "Please wait…" : isSignup ? "Create Account" : "Login"}
        </button>
      </div>
    </section>
  );
}

export default Login;
