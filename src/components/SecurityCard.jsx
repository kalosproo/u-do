import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { sendPasswordReset, signOutEverywhere, usesPassword } from "../services/account";

const when = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "—";
};

/**
 * What protects this account, and the two controls that matter if it's at
 * risk: a new password and ending every other session. Nothing here is
 * stored by U.Do — it is read straight from the signed-in Firebase user.
 */
function SecurityCard() {
  const { user } = useAuth();
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState({ tone: "", text: "" });

  if (!user) return null;

  const password = usesPassword(user);

  const reset = async () => {
    setBusy("reset");
    try {
      await sendPasswordReset(user.email);
      setNote({ tone: "success", text: `Sent a link to ${user.email} to set a new password.` });
    } catch (error) {
      setNote({ tone: "error", text: error?.code === "auth/too-many-requests" ? "Too many requests. Try again in a few minutes." : "Couldn't send the link. Try again." });
    } finally {
      setBusy("");
    }
  };

  const everywhere = async () => {
    if (!window.confirm("Sign out of U.Do on every device, including this one?\n\nOther devices lose access within an hour.")) return;
    setBusy("everywhere");
    try {
      await signOutEverywhere();
      // Signed out here too; the auth listener takes it from here.
    } catch (error) {
      setNote({ tone: "error", text: error.message });
      setBusy("");
    }
  };

  return (
    <article className="panel profile-card">
      <div className="panel-head">
        <h3 className="panel-title">Security</h3>
      </div>

      <div className="import-preview">
        <span className="import-row">
          <span>Sign-in</span>
          <strong>{password ? "Email and password" : "Google"}</strong>
        </span>
        <span className="import-row">
          <span>Email</span>
          <strong>{user.emailVerified ? "Confirmed" : "Not confirmed"}</strong>
        </span>
        <span className="import-row">
          <span>Last sign-in</span>
          <strong>{when(user.metadata?.lastSignInTime)}</strong>
        </span>
        <span className="import-row">
          <span>Account created</span>
          <strong>{when(user.metadata?.creationTime)}</strong>
        </span>
      </div>

      <p className="profile-data-copy">
        {password
          ? "Change your password if you've used it anywhere else or think someone knows it."
          : "Your password and two-step verification are managed by your Google account."}{" "}
        If you didn&apos;t sign in somewhere, sign out everywhere, then change your password.
        U.Do will never ask for your password by email or message.
      </p>

      <div className="profile-actions">
        {password ? (
          <button type="button" className="btn" onClick={reset} disabled={busy !== ""}>
            {busy === "reset" ? "Sending…" : "Change password"}
          </button>
        ) : null}
        <button type="button" className="btn" onClick={everywhere} disabled={busy !== ""}>
          {busy === "everywhere" ? "Signing out…" : "Sign out everywhere"}
        </button>
      </div>

      <p className="panel-note">
        <Link to="/terms">Terms of Service</Link> · <Link to="/privacy">Privacy Policy</Link>
      </p>

      {note.text ? <p className={`profile-status is-${note.tone}`}>{note.text}</p> : null}
    </article>
  );
}

export default SecurityCard;
