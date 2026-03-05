import { createUserWithEmailAndPassword, signInWithPopup, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, googleProvider } from "../services/firebase";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { authorizeAuthAttempt, POLICY_CODES } from "../services/authPolicy";

const normalizeEmail = (value) => value.trim().toLowerCase();

const POLICY_ERROR_MESSAGES = {
  [POLICY_CODES.INVALID_EMAIL]: "Please enter a valid email address.",
  [POLICY_CODES.DISPOSABLE_EMAIL_BLOCKED]: "Disposable email providers are blocked. Use a permanent email address.",
  [POLICY_CODES.DOMAIN_NOT_ALLOWED]: "This email provider is not supported. Use a supported domain to continue.",
  [POLICY_CODES.RATE_LIMITED]: "Too many attempts were detected. Please wait a bit and try again.",
};

const getErrorMessage = (err, fallback) => {
  if (err?.policyCode && POLICY_ERROR_MESSAGES[err.policyCode]) {
    return POLICY_ERROR_MESSAGES[err.policyCode];
  }

  if (err?.code === "auth/email-already-in-use") {
    return "This email is already registered. Please login.";
  }

  return fallback;
};

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");

  const runPolicyCheck = async (authEmail, mode) => {
    const { normalizedEmail } = await authorizeAuthAttempt({
      email: normalizeEmail(authEmail),
      mode,
    });

    return normalizedEmail;
  };

  const googleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await runPolicyCheck(result.user.email || "", "google-login");
      navigate("/");
    } catch (err) {
      await signOut(auth);
      setError(getErrorMessage(err, "Unable to sign in with Google. Please try again."));
    }
  };

  const emailLogin = async () => {
    try {
      const formattedEmail = await runPolicyCheck(email, "login");
      await signInWithEmailAndPassword(auth, formattedEmail, password);
      navigate("/");
    } catch (err) {
      setError(getErrorMessage(err, "Invalid email or password"));
    }
  };

  const signupWithEmail = async () => {
    try {
      const formattedEmail = await runPolicyCheck(email, "signup");
      await createUserWithEmailAndPassword(auth, formattedEmail, password);
      navigate("/");
    } catch (err) {
      setError(getErrorMessage(err, "Something went wrong. Try again."));
    }
  };

  return (
    <section className="login-page">
      <div className="login-card">
        <BrandLogo />
        <p>Login to continue your system.</p>

        <div className="login-tabs" role="tablist" aria-label="Auth mode">
          <button
            onClick={() => {
              setIsSignup(false);
              setError("");
            }}
            className={!isSignup ? "active" : ""}
          >
            Login
          </button>
          <button
            onClick={() => {
              setIsSignup(true);
              setError("");
            }}
            className={isSignup ? "active" : ""}
          >
            Sign Up
          </button>
        </div>

        <button className="login-google" onClick={googleLogin}>
          Continue with Google
        </button>

        <div className="login-divider" />

        <label>
          Email
          <input type="email" placeholder="you@svce.edu.in" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        <label>
          Password
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="login-error">{error}</p>}

        {isSignup ? (
          <button className="login-primary" onClick={signupWithEmail}>
            Create Account
          </button>
        ) : (
          <button className="login-primary" onClick={emailLogin}>
            Login
          </button>
        )}
      </div>
    </section>
  );
}

export default Login;
