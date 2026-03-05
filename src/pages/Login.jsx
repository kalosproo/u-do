import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";
import { auth, functions, googleProvider } from "../services/firebase";

const ALLOWED_DOMAIN = "@svce.edu.in";
const OTP_LENGTH = 6;

const normalizeEmail = (value) => value.trim().toLowerCase();
const isAllowedEmail = (value) => normalizeEmail(value).endsWith(ALLOWED_DOMAIN);

function Login() {
  const navigate = useNavigate();

  const requestOtp = useMemo(() => httpsCallable(functions, "requestEmailOtp"), []);
  const verifyOtp = useMemo(() => httpsCallable(functions, "verifyEmailOtp"), []);
  const finalizeEmailOtpLogin = useMemo(() => httpsCallable(functions, "finalizeEmailOtpLogin"), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpMessage, setOtpMessage] = useState("");

  const [otpStage, setOtpStage] = useState("credentials");
  const [challengeId, setChallengeId] = useState("");
  const [gateToken, setGateToken] = useState("");
  const [otpExpiresAtMs, setOtpExpiresAtMs] = useState(null);
  const [resendAvailableAtMs, setResendAvailableAtMs] = useState(0);
  const [secondsLeftToResend, setSecondsLeftToResend] = useState(0);

  useEffect(() => {
    if (!resendAvailableAtMs) {
      setSecondsLeftToResend(0);
      return;
    }

    const updateCountdown = () => {
      const diffSeconds = Math.max(0, Math.ceil((resendAvailableAtMs - Date.now()) / 1000));
      setSecondsLeftToResend(diffSeconds);
    };

    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);
    return () => clearInterval(intervalId);
  }, [resendAvailableAtMs]);

  const resetOtpFlow = () => {
    setOtpStage("credentials");
    setChallengeId("");
    setGateToken("");
    setOtp("");
    setOtpExpiresAtMs(null);
    setResendAvailableAtMs(0);
    setOtpMessage("");
  };

  const googleLogin = async () => {
    await signInWithPopup(auth, googleProvider);
    navigate("/");
  };

  const startOtpChallenge = async () => {
    const formattedEmail = normalizeEmail(email);

    if (!isAllowedEmail(formattedEmail)) {
      setError("Only @svce.edu.in email addresses are allowed.");
      return;
    }

    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const { data } = await requestOtp({ email: formattedEmail });
      setChallengeId(data.challengeId);
      setOtpExpiresAtMs(data.expiresAtMs);
      setResendAvailableAtMs(data.resendAvailableAtMs);
      setOtpStage("otp");
      setOtpMessage("OTP sent. Enter the 6-digit code to continue.");

      if (data.debugOtp) {
        setOtpMessage(`OTP sent. Emulator OTP: ${data.debugOtp}`);
      }
    } catch (err) {
      const retryAfterMs = err?.details?.retryAfterMs;
      if (retryAfterMs) {
        setResendAvailableAtMs(Date.now() + retryAfterMs);
        setError(`Please wait ${Math.ceil(retryAfterMs / 1000)} seconds before requesting another OTP.`);
      } else {
        setError(err?.message || "Unable to request OTP. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtpCode = async () => {
    const formattedEmail = normalizeEmail(email);

    if (otp.length !== OTP_LENGTH) {
      setError("Enter the 6-digit OTP.");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const { data } = await verifyOtp({
        email: formattedEmail,
        challengeId,
        otp: otp.trim(),
      });

      setGateToken(data.gateToken);
      setOtpStage("verified");
      setOtpMessage("OTP verified. Completing sign-in...");
      await completeEmailAuth(data.gateToken);
    } catch (err) {
      if (err?.code?.includes("deadline-exceeded")) {
        setError("OTP expired. Please request a new code.");
      } else if (err?.code?.includes("invalid-argument")) {
        const attemptsRemaining = err?.details?.attemptsRemaining;
        setError(
          typeof attemptsRemaining === "number"
            ? `Invalid OTP. ${attemptsRemaining} attempt(s) left.`
            : "Invalid OTP. Please try again.",
        );
      } else if (err?.code?.includes("resource-exhausted")) {
        setError("Too many invalid attempts. Request a new OTP.");
      } else {
        setError(err?.message || "OTP verification failed.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const completeEmailAuth = async (tokenOverride) => {
    const formattedEmail = normalizeEmail(email);
    const activeToken = tokenOverride || gateToken;

    if (!activeToken || !challengeId) {
      setError("OTP verification is required before login.");
      return;
    }

    setError("");

    try {
      if (isSignup) {
        await createUserWithEmailAndPassword(auth, formattedEmail, password);
      } else {
        await signInWithEmailAndPassword(auth, formattedEmail, password);
      }

      await finalizeEmailOtpLogin({ gateToken: activeToken, challengeId });
      navigate("/");
    } catch (err) {
      if (err.code === "auth/email-already-in-use") {
        setError("This email is already registered. Please login.");
      } else if (err.code === "auth/invalid-credential") {
        setError("Invalid email or password.");
      } else if (err?.code?.includes("deadline-exceeded")) {
        setError("OTP verification expired. Please restart login.");
      } else if (err?.code?.includes("failed-precondition")) {
        setError("OTP verification missing. Please verify OTP again.");
      } else {
        setError(err?.message || "Unable to complete login.");
      }

      resetOtpFlow();
    }
  };

  const otpExpired = otpExpiresAtMs ? Date.now() >= otpExpiresAtMs : false;

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
              resetOtpFlow();
            }}
            className={!isSignup ? "active" : ""}
          >
            Login
          </button>
          <button
            onClick={() => {
              setIsSignup(true);
              setError("");
              resetOtpFlow();
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
          <input
            type="email"
            placeholder="you@svce.edu.in"
            value={email}
            disabled={otpStage !== "credentials"}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label>
          Password
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            disabled={otpStage !== "credentials"}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {otpStage === "otp" && (
          <>
            <label>
              OTP
              <input
                type="text"
                inputMode="numeric"
                maxLength={OTP_LENGTH}
                placeholder="Enter 6-digit OTP"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
              />
            </label>

            <div className="login-otp-meta">
              <span>{otpExpired ? "OTP expired." : "OTP active."}</span>
              <button
                type="button"
                className="login-otp-link"
                disabled={secondsLeftToResend > 0 || isLoading}
                onClick={startOtpChallenge}
              >
                {secondsLeftToResend > 0 ? `Resend in ${secondsLeftToResend}s` : "Resend OTP"}
              </button>
            </div>
          </>
        )}

        {otpMessage && <p className="login-info">{otpMessage}</p>}
        {error && <p className="login-error">{error}</p>}

        {otpStage === "credentials" && (
          <button className="login-primary" onClick={startOtpChallenge} disabled={isLoading}>
            {isLoading ? "Requesting OTP..." : "Request OTP"}
          </button>
        )}

        {otpStage === "otp" && (
          <button className="login-primary" onClick={verifyOtpCode} disabled={isLoading || otpExpired}>
            {isLoading ? "Verifying..." : "Verify OTP"}
          </button>
        )}

        {otpStage !== "credentials" && (
          <button
            type="button"
            className="login-secondary"
            onClick={() => {
              setError("");
              resetOtpFlow();
            }}
            disabled={isLoading}
          >
            Edit email/password
          </button>
        )}
      </div>
    </section>
  );
}

export default Login;
