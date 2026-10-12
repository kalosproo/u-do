import { useState } from "react";
import { auth } from "../services/firebase";
import { useAuth } from "../hooks/useAuth";
import { sendVerification } from "../services/verification";

const DISMISS_KEY = "u_do_verify_dismissed";

const dismissedThisSession = () => {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Asks an email-and-password account to confirm its address.
 *
 * It asks; it does not block. Every email account that exists today is
 * unverified, because nothing ever sent the email, so gating the app on it
 * would lock out every one of them on the day this ships. Google accounts are
 * verified by Google and never see this.
 *
 * Verifying is what makes a password reset safe to rely on: a reset goes to
 * the address on the account, and an unconfirmed address may be a typo that
 * belongs to someone else.
 */
function VerifyEmailBanner() {
  const { user } = useAuth();
  const [verified, setVerified] = useState(false);
  const [hidden, setHidden] = useState(dismissedThisSession);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const usesPassword = user?.providerData?.some((provider) => provider.providerId === "password");
  if (!user || !usesPassword || user.emailVerified || verified || hidden) return null;

  const resend = async () => {
    setBusy("send");
    setNote("");
    try {
      await sendVerification(auth.currentUser || user);
      setNote(`Sent to ${user.email}. Check your spam folder too.`);
    } catch (error) {
      setNote(
        error?.code === "auth/too-many-requests"
          ? "Too many emails sent just now. Wait a few minutes and try again."
          : "Couldn't send it. Check your connection and try again."
      );
    } finally {
      setBusy("");
    }
  };

  // The ID token keeps the old flag until it is refreshed, so the profile is
  // reloaded rather than trusting what was true at sign-in.
  const recheck = async () => {
    setBusy("check");
    setNote("");
    try {
      const current = auth.currentUser || user;
      await current.reload();
      if (current.emailVerified) {
        await current.getIdToken(true);
        setVerified(true);
      } else {
        setNote("Not verified yet. Open the link in the email, then try again.");
      }
    } catch {
      setNote("Couldn't check right now. Try again in a moment.");
    } finally {
      setBusy("");
    }
  };

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* Hidden for this render only. */
    }
    setHidden(true);
  };

  return (
    <div className="verify-banner" role="status">
      <div className="verify-copy">
        <strong>Confirm your email</strong>
        <span>
          We'll only use it to get you back into your account. {note}
        </span>
      </div>
      <div className="verify-actions">
        <button type="button" className="btn btn-sm" onClick={resend} disabled={busy !== ""}>
          {busy === "send" ? "Sending…" : "Send link"}
        </button>
        <button type="button" className="btn btn-sm" onClick={recheck} disabled={busy !== ""}>
          {busy === "check" ? "Checking…" : "I've verified"}
        </button>
        <button type="button" className="verify-dismiss" onClick={dismiss} aria-label="Hide until next visit">
          Later
        </button>
      </div>
    </div>
  );
}

export default VerifyEmailBanner;
