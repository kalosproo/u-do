import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth, googleProvider } from "../services/firebase";
import { signInWithPopup } from "firebase/auth";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BrandLogo from "../components/BrandLogo";

const POPULAR_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "zoho.com",
  "gmx.com",
  "mail.com",
  "yandex.com",
]);

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "tempmail.com",
  "tempmailo.com",
  "yopmail.com",
  "throwawaymail.com",
  "dispostable.com",
  "sharklasers.com",
  "fakeinbox.com",
  "trashmail.com",
  "maildrop.cc",
]);

const OTP_EXPIRY_MS = 5 * 60 * 1000;

const normalizeEmail = (value) => value.trim().toLowerCase();

const validateEmailProvider = (email) => {
  const [, domain = ""] = normalizeEmail(email).split("@");

  if (!domain) return "Enter a valid email address.";
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) return "Temporary/disposable emails are not allowed.";
  if (!POPULAR_EMAIL_DOMAINS.has(domain)) {
    return "Use a supported provider (Gmail, Outlook, Yahoo, iCloud, Proton, etc.).";
  }

  return "";
};

const sendOtpEmail = async ({ email, otp }) => {
  const serviceId = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const templateId = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const publicKey = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!serviceId || !templateId || !publicKey) return false;

  const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      template_params: {
        to_email: email,
        otp_code: otp,
      },
    }),
  });

  return response.ok;
};

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [otpInput, setOtpInput] = useState("");
  const [pendingOtp, setPendingOtp] = useState(null);
  const [pendingCredential, setPendingCredential] = useState(null);

  const isOtpMode = Boolean(pendingOtp && pendingCredential);

  const emailProviderError = useMemo(() => validateEmailProvider(email), [email]);

  const googleLogin = async () => {
    await signInWithPopup(auth, googleProvider);
    navigate("/");
  };

  const beginOtpStep = async (credentialResult, formattedEmail) => {
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = Date.now() + OTP_EXPIRY_MS;
    const sent = await sendOtpEmail({ email: formattedEmail, otp });

    setPendingCredential(credentialResult);
    setPendingOtp({ otp, expiresAt, email: formattedEmail });
    setOtpInput("");

    if (sent) {
      setInfo("OTP sent to your email. Enter the 6-digit code to finish login.");
      return;
    }

    setInfo(`OTP delivery is in demo mode. Use code: ${otp}`);
  };

  const emailLogin = async () => {
    const formattedEmail = normalizeEmail(email);
    setError("");
    setInfo("");

    if (emailProviderError) {
      setError(emailProviderError);
      return;
    }

    try {
      const credentialResult = await signInWithEmailAndPassword(auth, formattedEmail, password);
      await beginOtpStep(credentialResult, formattedEmail);
    } catch {
      setError("Invalid email or password");
    }
  };

  const verifyOtpAndCompleteLogin = async () => {
    if (!pendingOtp || !pendingCredential) return;

    if (Date.now() > pendingOtp.expiresAt) {
      await signOut(auth);
      setPendingCredential(null);
      setPendingOtp(null);
      setError("OTP expired. Please login again.");
      return;
    }

    if (otpInput.trim() !== pendingOtp.otp) {
      setError("Incorrect OTP.");
      return;
    }

    setPendingCredential(null);
    setPendingOtp(null);
    setOtpInput("");
    setError("");
    setInfo("");
    navigate("/");
  };

  const signupWithEmail = async () => {
    const formattedEmail = normalizeEmail(email);
    setError("");
    setInfo("");

    if (emailProviderError) {
      setError(emailProviderError);
      return;
    }

    try {
      await createUserWithEmailAndPassword(auth, formattedEmail, password);
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
        <BrandLogo />
        <p>Login to continue your system.</p>

        <div className="login-tabs" role="tablist" aria-label="Auth mode">
          <button
            onClick={() => {
              setIsSignup(false);
              setError("");
              setInfo("");
            }}
            className={!isSignup ? "active" : ""}
          >
            Login
          </button>
          <button
            onClick={() => {
              setIsSignup(true);
              setError("");
              setInfo("");
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

        {isOtpMode && !isSignup && (
          <label>
            Email OTP
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter 6-digit OTP"
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ""))}
            />
          </label>
        )}

        {error && <p className="login-error">{error}</p>}
        {info && <p className="login-info">{info}</p>}

        {isSignup ? (
          <button className="login-primary" onClick={signupWithEmail}>
            Create Account
          </button>
        ) : isOtpMode ? (
          <button className="login-primary" onClick={verifyOtpAndCompleteLogin}>
            Verify OTP
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
