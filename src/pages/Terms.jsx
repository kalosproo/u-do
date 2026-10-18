import { Link } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

import TermsContent from "../components/legal/TermsContent";
import { TERMS_UPDATED, TERMS_VERSION } from "../utils/consent";

/**
 * The Terms of Service, in plain words.
 *
 * Like the privacy policy, every statement about what the app does is
 * checkable in this repo: deletion, Pro cancellation, backups and sign-out
 * all describe code that exists. Readable signed out, because it is what
 * someone signing up agrees to.
 */
function Terms() {
  return (
    <section className="page legal-page">
      <header className="page-head">
        <h1 className="page-title">Terms of Service</h1>
        <p className="page-sub">
          Version {TERMS_VERSION} · Last updated {TERMS_UPDATED}
        </p>
      </header>

      <div className="panel legal-body">
        <TermsContent />

        <div className="toolbar legal-foot">
          <Link to="/" className="btn">
            <FiArrowLeft /> Back to U.Do
          </Link>
        </div>
      </div>
    </section>
  );
}

export default Terms;
