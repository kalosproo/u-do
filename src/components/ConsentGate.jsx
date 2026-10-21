import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";

import { auth } from "../services/firebase";
import { fetchConsent, recordConsent, syncPendingConsent } from "../services/consent";
import { consentOutdated, needsConsent, PRIVACY_POLICY_VERSION, TERMS_VERSION } from "../utils/consent";
import AgreementReader from "./legal/AgreementReader";
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
  const [agreed, setAgreed] = useState(false);

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
  if (!current) return null;

  // Accepted an earlier version: a small notice with a link, never a wall.
  // "Got it" records the current versions so it doesn't come back.
  if (!needsConsent(current.record)) {
    if (!consentOutdated(current.record) || pathname === "/privacy" || pathname === "/terms") return null;
    const acknowledge = async () => {
      setSettled({ uid: user.uid, record: { privacyVersion: PRIVACY_POLICY_VERSION, termsVersion: TERMS_VERSION } });
      await recordConsent(user.uid, "notice");
    };
    return createPortal(
      <div className="policy-notice" role="status">
        <span>We&apos;ve updated our Terms and Privacy Policy.</span>
        <Link to="/privacy" className="policy-notice-link">Read</Link>
        <button type="button" className="btn btn-sm" onClick={acknowledge}>Got it</button>
      </div>,
      document.body,
    );
  }

  // Never cover the policy itself. Someone who navigated here to read it before
  // deciding must not find the decision sitting on top of the document.
  if (pathname === "/privacy" || pathname === "/terms") return null;

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

    setSettled({ uid: user.uid, record: { privacyVersion: PRIVACY_POLICY_VERSION, termsVersion: TERMS_VERSION } });
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
            Before you carry on
          </h3>
        </div>

        <p className="panel-note">
          Read U.Do&apos;s Terms of Service and Privacy Policy to the end and accept them
          to carry on. You&apos;ll only be asked this once.
        </p>

        <p className="panel-note">
          The short version: your tasks, habits, planner and finances stay yours and
          nobody else reads them. The one thing that leaves U.Do is what you send to the
          AI assistant.
        </p>

        <AgreementReader checked={agreed} onChange={setAgreed} />

        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={accept} disabled={saving || !agreed}>
            {saving ? "Saving…" : "Accept"}
          </button>

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
