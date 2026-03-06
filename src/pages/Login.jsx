import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { auth, googleProvider } from "../services/firebase";

const normalizeEmail = (value) => value.trim().toLowerCase();

const validateEmail = (email) => {
  const normalized = normalizeEmail(email);
  const hasAt = normalized.includes("@");
  const [, domain = ""] = normalized.split("@");

  if (!hasAt || !domain) return "Enter a valid email address.";
  return "";
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

  const emailLogin = async () => {
    resetMessages();

    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const formattedEmail = normalizeEmail(email);
      await signInWithEmailAndPassword(auth, formattedEmail, password);
      navigate("/");
    } catch (err) {
      setError(err?.message || "Invalid email or password");
    }
  };

  const signupWithEmail = async () => {
    resetMessages();

    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const formattedEmail = normalizeEmail(email);
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
          <input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
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
