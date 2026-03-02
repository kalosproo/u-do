import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, googleProvider } from "../services/firebase";
import { signInWithPopup, signInWithEmailAndPassword } from "firebase/auth";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");

  const googleLogin = async () => {
    await signInWithPopup(auth, googleProvider);
    navigate("/");
  };

  const emailLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch {
      setError("Invalid email or password");
    }
  };

  const signupWithEmail = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered. Please login.");
      } else {
        setError("Something went wrong. Try again.");
      }
    }
  };

  return (
    <section className="login-page">
      <div className="login-card">
        <h2>U.Do</h2>
        <p>Sign in to continue your system.</p>

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
          <input placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
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
