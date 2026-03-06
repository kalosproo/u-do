import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { POLICY_CODES, authorizeAuthAttempt } from "../services/authPolicy";
import { auth, googleProvider } from "../services/firebase";

const normalizeEmail = (value) => value.trim().toLowerCase();

const validateEmailDomain = (email) => {
  const [, domain = ""] = normalizeEmail(email).split("@");

  if (!domain) return "Enter a valid email address.";
  if (domain !== "svce.edu.in") return "Only @svce.edu.in email addresses are allowed.";
  return "";
};

const getPolicyErrorMessage = (policyCode) => {
  switch (policyCode) {
    case POLICY_CODES.INVALID_EMAIL:
      return "Please enter a valid email address.";
    case POLICY_CODES.DISPOSABLE_EMAIL_BLOCKED:
      return "Temporary/disposable emails are not allowed.";
    case POLICY_CODES.DOMAIN_NOT_ALLOWED:
      return "Only @svce.edu.in email addresses are allowed.";
    case POLICY_CODES.RATE_LIMITED:
      return "Too many login attempts. Please try again later.";
    default:
      return "Unable to verify this sign in attempt.";
  }
};

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSignup, setIsSignup] = useState(false);

  const resetMessages = () => {
    setError("");
  };

  const runPolicyCheck = async (authEmail, mode) => {
    const normalizedEmail = normalizeEmail(authEmail);

    try {
      const { normalizedEmail: approvedEmail } = await authorizeAuthAttempt({
        email: normalizedEmail,
        mode,
      });

      return approvedEmail || normalizedEmail;
    } catch (err) {
      if (err?.policyCode) {
        throw new Error(getPolicyErrorMessage(err.policyCode));
      }

      throw new Error("Could not verify email policy. Try again.");
    }
  };

  const emailLogin = async () => {
    resetMessages();

    const validationError = validateEmailDomain(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const formattedEmail = await runPolicyCheck(email, "login");
      await signInWithEmailAndPassword(auth, formattedEmail, password);
      navigate("/");
    } catch (err) {
      setError(err?.message || "Invalid email or password");
    }
  };

  const signupWithEmail = async () => {
    resetMessages();

    const validationError = validateEmailDomain(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const formattedEmail = await runPolicyCheck(email, "signup");
      await createUserWithEmailAndPassword(auth, formattedEmail, password);
      navigate("/");
    } catch (err) {
      setError(err?.message || "Something went wrong. Try again.");
    }
  };

  const googleLogin = async () => {
    resetMessages();

    try {
      await signInWithPopup(auth, googleProvider);
      navigate("/");
    } catch {
      setError("Google login failed");
    }
  };

  return (
    <section className="login-page">
      <div className="login-card">
        <BrandLogo />
        <p>Login to continue your system.</p>

        <div className="login-tabs" role="tablist" aria-label="Auth mode">
          <button type="button" onClick={() => { setIsSignup(false); resetMessages(); }} className={!isSignup ? "active" : ""}>
            Login
          </button>
          <button type="button" onClick={() => { setIsSignup(true); resetMessages(); }} className={isSignup ? "active" : ""}>
            Sign Up
          </button>
        </div>

        <button type="button" className="login-google" onClick={googleLogin}>Continue with Google</button>

        <div className="login-divider" />

        <label>
          Email
          <input type="email" placeholder="you@svce.edu.in" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        <label>
          Password
          <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <p className="login-error">{error}</p>}

        {isSignup ? (
          <button type="button" className="login-primary" onClick={signupWithEmail}>Create Account</button>
        ) : (
          <button type="button" className="login-primary" onClick={emailLogin}>Login</button>
        )}
      </div>
    </section>
  );
}

export default Login;
