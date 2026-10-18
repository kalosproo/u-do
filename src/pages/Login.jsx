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
import { authorizeAttempt } from "../services/authGuard";
import { sendVerification } from "../services/verification";
import { sendPasswordReset } from "../services/account";
import AgreementReader from "../components/legal/AgreementReader";

const MIN_PASSWORD_LENGTH = 6;

const normalizeEmail = (value) => value.trim().toLowerCase();

/**
 * Worded the same whether or not the address has an account, so the form
 * cannot be used to find out who is signed up.
 */
const RESET_SENT =
  "If an account uses that email, a reset link is on its way. Check your spam folder too.";

const isEmail = (value) => {
  const normalized = normalizeEmail(value);
  const [, domain = ""] = normalized.split("@");
  return normalized.includes("@") && domain.includes(".");
};


const validate = (email, password) => {
  if (!isEmail(email)) return "Enter a valid email address.";
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
    // A password signup cannot hide that an address is taken — the account
    // was not created, and that is the answer. What it can avoid is saying so
    // outright, and the attempt is rate-limited like a login, so the form is
    // not a fast way to check a list of addresses.
    case "auth/email-already-in-use":
      return "Couldn't create an account with that email. If it's yours, log in or reset your password.";
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
  const [isReset, setIsReset] = useState(false);
  const [notice, setNotice] = useState("");

  const requestReset = async () => {
    if (!isEmail(email)) {
      setError("Enter the email you signed up with.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const formattedEmail = normalizeEmail(email);
      // Counted like a login: an open reset form is a free way to flood
      // someone's inbox otherwise.
      await authorizeAttempt({ email: formattedEmail, mode: "reset" });
      await sendPasswordReset(formattedEmail);
      setNotice(RESET_SENT);
    } catch (resetError) {
      if (resetError?.code === "auth/user-not-found") {
        setNotice(RESET_SENT);
      } else {
        setError(resetError?.policyCode ? resetError.message : describeAuthError(resetError));
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    const validationError = validate(email, password);

    if (validationError) {
      setError(validationError);
      return;
    }

    if (isSignup && !agreed) {
      setError("Please read and accept the Terms and Privacy Policy to create an account.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      const formattedEmail = normalizeEmail(email);

      // Before Firebase sees a credential at all, so a guessing run is
      // counted and stopped rather than merely failing one attempt at a time.
      await authorizeAttempt({
        email: formattedEmail,
        mode: isSignup ? "signup" : "login",
      });

      if (isSignup) {
        const created = await createUserWithEmailAndPassword(auth, formattedEmail, password);
        // Recorded after the account exists, because the record is keyed by uid
        // and the rules only accept it from the account it describes.
        await recordConsent(created.user.uid, "signup");
        // Best effort: the account exists either way, and the banner in the
        // app offers to send it again.
        await sendVerification(created.user).catch(() => {});
      } else {
        await signInWithEmailAndPassword(auth, formattedEmail, password);
      }

      navigate("/", { replace: true });
    } catch (authError) {
      setError(authError?.policyCode ? authError.message : describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  };

  const googleLogin = async () => {
    if (isSignup && !agreed) {
      setError("Please read and accept the Terms and Privacy Policy to create an account.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      await authorizeAttempt({ email: "", mode: "google" });

      const result = await signInWithPopup(auth, googleProvider);

      // Google is a signup path as much as a login one, and there is no flag on
      // the result that reliably separates the two across providers. Recording
      // on the signup tab only is enough: an existing account that skips this
      // is caught by the consent gate on its next load.
      if (isSignup) await recordConsent(result.user.uid, "signup-google");

      navigate("/", { replace: true });
    } catch (authError) {
      setError(authError?.policyCode ? authError.message : describeAuthError(authError));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (signup) => {
    setIsSignup(signup);
    setIsReset(false);
    setError("");
    setNotice("");
    setAgreed(false);
  };

  const showReset = (on) => {
    setIsReset(on);
    setError("");
    setNotice("");
  };

  if (isReset) {
    return (
      <section className="login-page">
        <div className="login-card">
          <BrandLogo />
          <p>Enter your email and we'll send you a link to set a new password.</p>

          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") requestReset();
              }}
            />
          </label>

          {error ? <p className="login-error">{error}</p> : null}
          {notice ? <p className="login-note" role="status">{notice}</p> : null}

          <button
            type="button"
            className="btn btn-primary login-primary"
            onClick={requestReset}
            disabled={busy}
          >
            {busy ? "Please wait…" : "Send reset link"}
          </button>

          <button type="button" className="login-link" onClick={() => showReset(false)}>
            Back to login
          </button>
        </div>
      </section>
    );
  }

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
          <AgreementReader checked={agreed} onChange={setAgreed} />
        ) : null}

        {!isSignup ? (
          <button type="button" className="login-link login-forgot" onClick={() => showReset(true)}>
            Forgot password?
          </button>
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
