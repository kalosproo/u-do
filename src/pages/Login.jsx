import { createUserWithEmailAndPassword, signInWithPopup, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, googleProvider } from "../services/firebase";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { isDisposableDomain, isPopularProvider, normalizeEmail } from "../utils/emailValidation";

const POPULAR_PROVIDER_ERROR = "Please use a popular email provider like Gmail, Outlook, Yahoo, iCloud, or Proton.";
const DISPOSABLE_DOMAIN_ERROR = "Disposable email addresses are not supported. Please use your personal email.";

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

  const validateEmailForAuth = (formattedEmail) => {
    if (!formattedEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return false;
    }

    if (isDisposableDomain(formattedEmail)) {
      setError(DISPOSABLE_DOMAIN_ERROR);
      return false;
    }

    if (!isPopularProvider(formattedEmail)) {
      setError(POPULAR_PROVIDER_ERROR);
      return false;
    }

    return true;
  };

  const emailLogin = async () => {
    const formattedEmail = normalizeEmail(email);

    if (!validateEmailForAuth(formattedEmail)) {
      return;
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
    const formattedEmail = normalizeEmail(email);

    if (!validateEmailForAuth(formattedEmail)) {
      return;
    }

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
          <input type="email" placeholder="you@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
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
