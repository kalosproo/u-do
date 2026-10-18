import { Link } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

import PrivacyContent from "../components/legal/PrivacyContent";
import { PRIVACY_POLICY_VERSION, PRIVACY_POLICY_UPDATED } from "../utils/consent";

/**
 * The privacy policy, written from what the code actually does.
 *
 * Every claim below is checkable against a file in this repo. Where U.Do falls
 * short of what a policy usually promises — the AI snapshot leaving the app,
 * account deletion being a manual request — it says so rather than implying a
 * control that does not exist. A policy that overstates is worse than none,
 * because it is the thing people rely on.
 *
 * Reachable signed out, because someone deciding whether to sign up is exactly
 * who needs to read it.
 */
function Privacy() {
  return (
    <section className="page legal-page">
      <header className="page-head">
        <h1 className="page-title">Privacy Policy</h1>
        <p className="page-sub">
          Version {PRIVACY_POLICY_VERSION} · Last updated {PRIVACY_POLICY_UPDATED}
        </p>
      </header>

      <div className="panel legal-body">
        <PrivacyContent />

        <div className="toolbar legal-foot">
          <Link to="/" className="btn">
            <FiArrowLeft /> Back to U.Do
          </Link>
        </div>
      </div>
    </section>
  );
}

export default Privacy;
