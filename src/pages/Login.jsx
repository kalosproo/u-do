import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, googleProvider } from "../services/firebase";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
} from "firebase/auth";
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
    <div style={{ padding: "20px" }}>
      <h2>Login to U. Do</h2>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
        <button
          onClick={() => {
            setIsSignup(false);
            setError("");
          }}
          style={{
            background: isSignup ? "#333" : "#555",
            color: "#fff",
            padding: "6px 12px",
          }}
        >
          Login
        </button>

        <button
          onClick={() => {
            setIsSignup(true);
            setError("");
          }}
          style={{
            background: isSignup ? "#555" : "#333",
            color: "#fff",
            padding: "6px 12px",
          }}
        >
          Sign Up
        </button>
      </div>

      <button onClick={googleLogin}>Login with Google</button>

      <hr />

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <br />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <br />

      {error && <p style={{ color: "red" }}>{error}</p>}

      {isSignup ? (
        <button onClick={signupWithEmail}>Sign Up</button>
      ) : (
        <button onClick={emailLogin}>Login</button>
      )}
    </div>
  );
}

export default Login;
