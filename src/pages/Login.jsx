import { auth, googleProvider } from "../services/firebase";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useState } from "react";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const googleLogin = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  const emailLogin = async () => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  return (
    <div>
      <h2>Login to U. Do</h2>

      <button onClick={googleLogin}>Login with Google</button>

      <hr />

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <button onClick={emailLogin}>Login</button>
    </div>
  );
}

export default Login;
