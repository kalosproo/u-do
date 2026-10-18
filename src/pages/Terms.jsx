import { Link } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

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
        <p>
          These terms are the agreement between you and U.Do, an independent project by
          Kalosproo. By creating an account or using U.Do you accept them. If you
          don&apos;t, please don&apos;t use the app. How we handle your data is in the{" "}
          <Link to="/privacy">Privacy Policy</Link>, which is part of these terms.
        </p>

        <h2>Who can use U.Do</h2>
        <p>
          You must be at least 13. If you&apos;re under 18, you need a parent or
          guardian&apos;s permission. One person per account — don&apos;t share an
          account or create one for someone else without their permission.
        </p>

        <h2>Keeping your account secure</h2>
        <ul>
          <li>Keep your password private and don&apos;t reuse one from another site.</li>
          <li>You&apos;re responsible for what happens in your account, so sign out on shared or public devices.</li>
          <li>
            If you think someone else got in, reset your password and use{" "}
            <strong>Profile → Security → Sign out everywhere</strong>, then email us.
          </li>
          <li>U.Do will never ask for your password by email, message or phone.</li>
        </ul>

        <h2>Your content</h2>
        <p>
          Your tasks, habits, planner and transactions are yours. We store them only to
          run U.Do for you, and we don&apos;t claim any ownership of them. What you share
          with friends in the app is visible to them. You&apos;re responsible for what you
          put in — don&apos;t store anything you don&apos;t have the right to.
        </p>

        <h2>What you must not do</h2>
        <ul>
          <li>Try to get into another person&apos;s account or data, or test the app&apos;s security without our written permission.</li>
          <li>Disrupt the service, overload it, or scrape it with automated tools.</li>
          <li>Get around plan limits, rate limits or payments, or open accounts to dodge them.</li>
          <li>Use U.Do, including the AI assistant, for anything illegal, abusive or harmful.</li>
        </ul>
        <p>
          If you find a security problem, please email us instead of using it. We&apos;ll
          thank you, not chase you.
        </p>

        <h2>The AI assistant</h2>
        <p>
          The assistant&apos;s suggestions can be wrong. Check anything important. Nothing
          in U.Do — including the finance pages — is financial, medical or legal advice.
        </p>

        <h2>Pro and payments</h2>
        <ul>
          <li>Pro is a subscription paid through Razorpay. It renews automatically each period until you cancel.</li>
          <li>Cancel any time in <strong>Profile → Plan</strong>. You keep Pro until the end of the period you&apos;ve paid for, and you won&apos;t be charged again.</li>
          <li>Payments aren&apos;t refunded for part of a period, except where the law requires it or you were charged by mistake — email us within 7 days and we&apos;ll put it right.</li>
          <li>If the price changes, we&apos;ll tell you before it applies, and never in the middle of a period you&apos;ve paid for.</li>
          <li>The Free plan shows ads. Pro doesn&apos;t.</li>
        </ul>

        <h2>Deleting your account</h2>
        <p>
          You can delete your account any time in <strong>Profile → Delete account</strong>.
          Deletion is permanent and immediate:
        </p>
        <ul>
          <li>Your tasks, habits, planner, transactions, profile and friends are removed. We can&apos;t bring them back.</li>
          <li>A Pro subscription is cancelled first, so nothing more is charged. The rest of a paid period isn&apos;t refunded.</li>
          <li>Your username becomes free for someone else to take.</li>
          <li>Copies in our daily backups expire within 7 days and are never restored on purpose.</li>
          <li>Payment records are kept as tax and accounting law requires.</li>
        </ul>
        <p>
          Export your data from <strong>Profile → Your data</strong> first if you want a copy.
          <strong> Clear all data</strong> is different: it empties your workspace but keeps
          your account, friends and plan.
        </p>

        <h2>If we suspend an account</h2>
        <p>
          We may suspend or close an account that breaks these terms or puts other people
          or the service at risk. Where it&apos;s reasonable, we&apos;ll tell you first and
          give you a chance to export your data.
        </p>

        <h2>The service itself</h2>
        <p>
          We work to keep U.Do running and your data safe, and we back it up daily, but
          the app is provided as it is, without a guarantee that it will always be
          available or free of mistakes. Keep your own exports of anything you can&apos;t
          afford to lose. As far as the law allows, we aren&apos;t liable for indirect
          losses, and our total liability is limited to what you paid us in the 12
          months before the problem. Nothing here takes away rights the law gives you
          that can&apos;t be signed away.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          If these terms change in a way that matters, we&apos;ll tell you in the app
          before the change applies. The version number at the top is how you can tell.
        </p>

        <h2>Law and contact</h2>
        <p>
          These terms are governed by the laws of India. Questions, security reports and
          complaints:{" "}
          <a href="mailto:muttukururahul@gmail.com">muttukururahul@gmail.com</a>.
        </p>

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
