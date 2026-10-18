import { useEffect, useRef, useState } from "react";

import PrivacyContent from "./PrivacyContent";
import TermsContent from "./TermsContent";
import {
  PRIVACY_POLICY_UPDATED,
  PRIVACY_POLICY_VERSION,
  TERMS_UPDATED,
  TERMS_VERSION,
} from "../../utils/consent";

/** Close enough to the end to count, so a rounding pixel never blocks anyone. */
const END_SLACK = 24;

/**
 * The Terms and the Privacy Policy in one scrolling box, with the tick that
 * accepts them locked until the reader reaches the end.
 *
 * Reaching the end is checked on scroll and once on mount — a tall screen
 * that shows the whole text without scrolling has nothing left to read.
 * The text is the same component the /terms and /privacy pages render.
 */
function AgreementReader({ checked, onChange }) {
  const boxRef = useRef(null);
  const [progress, setProgress] = useState(0);
  const reachedEnd = progress >= 100;

  const measure = () => {
    const box = boxRef.current;
    if (!box) return;
    const range = box.scrollHeight - box.clientHeight;
    const done = range <= END_SLACK || box.scrollTop >= range - END_SLACK;
    // Never moves backwards: scrolling up to re-read keeps the box unlocked.
    setProgress((current) => Math.max(current, done ? 100 : Math.round((box.scrollTop / range) * 100)));
  };

  useEffect(() => {
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="agreement">
      <div
        ref={boxRef}
        className="agreement-box legal-body"
        onScroll={measure}
        tabIndex={0}
        role="document"
        aria-label="Terms of Service and Privacy Policy"
      >
        <p className="agreement-version">
          Terms of Service · version {TERMS_VERSION} · {TERMS_UPDATED}
        </p>
        <h2 className="agreement-title">Terms of Service</h2>
        <TermsContent />

        <hr className="agreement-rule" />

        <p className="agreement-version">
          Privacy Policy · version {PRIVACY_POLICY_VERSION} · {PRIVACY_POLICY_UPDATED}
        </p>
        <h2 className="agreement-title">Privacy Policy</h2>
        <PrivacyContent />

        <p className="agreement-end">End of the Terms and Privacy Policy.</p>
      </div>

      <div className="agreement-track" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>

      <label className={`consent-check ${reachedEnd ? "" : "is-locked"}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={!reachedEnd}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          {reachedEnd
            ? "I have read and accept the Terms of Service and the Privacy Policy."
            : "Scroll to the end to accept."}
        </span>
      </label>
    </div>
  );
}

export default AgreementReader;
