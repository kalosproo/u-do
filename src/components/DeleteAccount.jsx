import { useState } from "react";
import { FiAlertTriangle } from "react-icons/fi";
import { Link } from "react-router-dom";

import { deleteAccount, reauthenticate, reauthMethod } from "../services/account";

/**
 * The control the privacy policy promised and the app did not have.
 *
 * Three deliberate steps, not one button. Deleting an account is the only
 * action in U.Do that cannot be undone by any means — no export, no support
 * request, no backup on our side brings it back — so it asks for intent
 * (open it), proof of identity (re-authenticate), and an unambiguous
 * confirmation (type the word).
 *
 * The typed word is not theatre: it is the step that survives a mis-tap on a
 * phone, which "are you sure?" does not.
 */
function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const method = reauthMethod();
  const ready = confirm.trim().toUpperCase() === "DELETE" &&
    (method === "google" || password.length > 0);

  const close = () => {
    setOpen(false);
    setPassword("");
    setConfirm("");
    setError("");
  };

  const run = async () => {
    setBusy(true);
    setError("");

    try {
      // The server refuses a token older than five minutes, so this is the
      // step that makes the call possible at all.
      await reauthenticate({ password });
      await deleteAccount();
      // deleteAccount signs out; the auth listener takes it from here.
    } catch (cause) {
      setError(cause?.message || "Couldn't delete your account.");
      setBusy(false);
    }
  };

  return (
    <article className="panel profile-card">
      <div className="panel-head">
        <h3 className="panel-title">Delete account</h3>
      </div>

      <p className="profile-data-copy">
        Permanently deletes your account and everything in it. Read this first:
      </p>
      <ul className="danger-list">
        <li>Your tasks, habits, planner, transactions, profile and friends are removed at once.</li>
        <li>It can&apos;t be undone. We can&apos;t recover it for you, even if you ask.</li>
        <li>A Pro subscription is cancelled first. The rest of a paid period isn&apos;t refunded.</li>
        <li>Your username becomes free for someone else to take.</li>
        <li>Backup copies expire within 7 days and are never restored.</li>
      </ul>
      <p className="panel-note">
        Want a copy? Use Export in Your data above first. Details in the{" "}
        <Link to="/terms">Terms</Link>.
      </p>

      {open ? (
        <div className="danger-zone">
          <p className="panel-note">
            <FiAlertTriangle aria-hidden="true" />{" "}
            {method === "password"
              ? "Enter your password, then type DELETE to confirm."
              : "You'll be asked to sign in with Google again, then type DELETE to confirm."}
          </p>

          {method === "password" ? (
            <label className="danger-field">
              <span>Password</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
            </label>
          ) : null}

          <label className="danger-field">
            <span>Type DELETE</span>
            <input
              type="text"
              value={confirm}
              autoComplete="off"
              spellCheck="false"
              onChange={(event) => setConfirm(event.target.value)}
              disabled={busy}
            />
          </label>

          {error ? <p className="login-error">{error}</p> : null}

          <div className="profile-actions">
            <button
              type="button"
              className="btn btn-danger"
              onClick={run}
              disabled={!ready || busy}
            >
              {busy ? "Deleting…" : "Delete my account permanently"}
            </button>

            <button type="button" className="btn" onClick={close} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="profile-actions">
          <button type="button" className="btn" onClick={() => setOpen(true)}>
            <FiAlertTriangle /> Delete account
          </button>
        </div>
      )}
    </article>
  );
}

export default DeleteAccount;
