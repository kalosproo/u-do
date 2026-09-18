import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";

import { auth } from "../services/firebase";
import { fetchConsent, recordConsent, syncPendingConsent } from "../services/consent";
import { needsConsent, PRIVACY_POLICY_VERSION } from "../utils/consent";
import { useAuth } from "../hooks/useAuth";

/**
 * Asks an existing account to accept the policy it has not seen.
 *
 * New accounts tick the box at signup. Everyone who had an account before the
 * policy existed — and everyone still on an older version of it — is caught
 * here instead, because consent recorded against version 1 says nothing about
 * version 2.
 *
 * The policy opens in a new tab rather than replacing this dialog, so the
 * prompt can require a decision without ever standing between someone and the
 * document they are being asked to decide about.
 */
function ConsentGate() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [settled, setSettled] = useState({ uid: null, record: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;

    fetchConsent(user.uid).then(async (record) => {
      if (cancelled) return;
      setSettled({ uid: user.uid, record });

      // A consent given while the rules were still undeployed lands on its own
      // now, without asking anybody to accept twice.
      if (record?.pending) await syncPendingConsent(user.uid, record);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Nothing is shown until the record for *this* account has actually been
  // read. Rendering on an unsettled value would flash the dialog at people who
  // accepted long ago, every single load.
  const current = user && settled.uid === user.uid ? settled : null;
  if (!current || !needsConsent(current.record)) return null;

  // Never cover the policy itself. Someone who navigated here to read it before
  // deciding must not find the decision sitting on top of the document.
  if (pathname === "/privacy") return null;

  /**
   * Accepting always lets the person through.
   *
   * They agreed; whether our backend managed to write it down is our problem.
   * recordConsent keeps the acceptance on the device when the server refuses
   * it, and the effect above retries the write on the next load — so a failure
   * here costs a sync, not access to someone's own tasks. Blocking them would
   * not produce the record either; it would only break the app.
   */
  const accept = async () => {
    setSaving(true);

    const result = await recordConsent(user.uid, "prompt");
    setSaving(false);

    if (!result.synced) {
      console.warn(`ConsentGate: accepted locally, server sync pending (${result.reason})`);
    }

    setSettled({ uid: user.uid, record: { privacyVersion: PRIVACY_POLICY_VERSION } });
  };

  const leave = () => signOut(auth);

  return createPortal(
    <div className="modal-overlay">
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
      >
        <div className="modal-head">
          <h3 id="consent-title">
            {current.record ? "Our Privacy Policy has changed" : "Before you carry on"}
          </h3>
        </div>

        <p className="panel-note">
          {current.record
            ? "We've updated what U.Do stores and where it goes. Please read the new version and accept it to keep using your account."
            : "U.Do now has a privacy policy covering what it stores and where that goes. Please read it and accept to keep using your account."}
        </p>

        <p className="panel-note">
          The short version: your tasks, habits, planner and finances stay yours and
          nobody else reads them. The one thing that leaves U.Do is what you send to the
          AI assistant.
        </p>

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={accept} disabled={saving}>
            {saving ? "Saving…" : "Accept"}
          </button>

          <Link to="/privacy" target="_blank" rel="noreferrer" className="btn">
            Open the policy
          </Link>

          <button type="button" className="btn" onClick={leave} disabled={saving}>
            Sign out
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default ConsentGate;
