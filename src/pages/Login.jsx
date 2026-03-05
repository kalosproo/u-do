import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { completeEmailLogin, sendOtpEmail } from "../services/emailOtpAuth";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const finishLogin = async () => {
      setStatus("checking-link");

      try {
        const { signedIn } = await completeEmailLogin();

        if (signedIn) {
          setStatus("success");
          navigate("/", { replace: true });
          return;
        }

        setStatus("idle");
      } catch (error) {
        setStatus("error");
        setMessage(error.message || "Unable to complete login. Please try again.");
      }
    };

    finishLogin();
  }, [navigate]);

  const handleSendOtp = async () => {
    setStatus("sending");
    setMessage("");

    try {
      await sendOtpEmail(email);
      setStatus("sent");
      setMessage("Check your email to continue login");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Failed to send login link. Please try again.");
    }
  };

  return (
    <section className="login-page">
      <div className="login-card">
        <BrandLogo />
        <h2>Login</h2>
        <p>Enter your email</p>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={status === "sending" || status === "checking-link"}
        />

        <button
          className="login-primary"
          onClick={handleSendOtp}
          disabled={status === "sending" || status === "checking-link"}
        >
          {status === "sending" ? "Sending..." : "Send OTP"}
        </button>

        {status === "checking-link" && <p>Completing sign-in...</p>}
        {message && <p className={status === "error" ? "login-error" : "login-success"}>{message}</p>}
      </div>
    </section>
  );
}

export default Login;
