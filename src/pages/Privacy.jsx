import { Link } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

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
        <p>
          U.Do is a personal productivity workspace. This page explains what it stores,
          where that data goes, and what you can do about it. It is written to match
          how the app actually behaves.
        </p>

        <h2>Who runs U.Do</h2>
        <p>
          U.Do is an independent project by Kalosproo. For any privacy question, or to
          ask for your account to be deleted, email{" "}
          <a href="mailto:muttukururahul@gmail.com">muttukururahul@gmail.com</a>.
        </p>

        <h2>What we collect</h2>

        <h3>Your account</h3>
        <p>
          Your email address, and a password you choose — stored only as a hash by
          Firebase Authentication, never in a form we or anyone else can read. If you
          sign in with Google instead, we receive your name, email address and profile
          picture from Google.
        </p>

        <h3>What you put in the app</h3>
        <p>
          Tasks and their due dates, planner entries, habits and the days you tick them,
          and finance entries including amounts, categories and whether each is income or
          an expense. This is the content of the app — it exists because you typed it.
        </p>

        <h3>Your profile and friends</h3>
        <p>
          A display name, a username, an invite code and a profile picture, which other
          signed-in people can see so that search and invite links work. If you add
          friends, they can additionally see a summary of your habits: their names, your
          streaks and your completion rates. They cannot see your tasks, your planner,
          your finances, or anything else.
        </p>

        <h3>On your device</h3>
        <p>
          Your theme choice and a cached copy of your expenses and habits are kept in
          your browser&apos;s local storage, so the app opens fast and survives a brief
          loss of connection. Clearing your browser data removes it.
        </p>

        <h2>Where your data goes</h2>

        <h3>Firebase (Google)</h3>
        <p>
          Everything above is stored in Google Firebase — Authentication for accounts and
          Cloud Firestore for content. Google processes it on our behalf. Access rules
          keep your workspace readable only by you; that includes the people who run
          U.Do, who cannot read your tasks, expenses or messages through the admin tools.
        </p>

        <h3>Vercel</h3>
        <p>
          The site is hosted on Vercel, which keeps standard server logs including IP
          addresses and request times, as any web host does.
        </p>

        <h3>The AI assistant — read this one</h3>
        <p>
          If you use the AI assistant, your question is sent to Groq along with a snapshot
          of your current workspace — your tasks, planner entries, habits and finance
          entries — because that is what lets it answer about your actual week rather
          than in general. That snapshot leaves U.Do and is processed by Groq under their
          terms. If you would rather that never happen, do not use the assistant; nothing
          else in the app sends your content anywhere.
        </p>

        <h3>Google AdSense</h3>
        <p>
          Signed-in pages show ads through Google AdSense, which sets its own cookies and
          may personalise what you see based on your browsing. That is Google&apos;s
          processing, not ours, and it is governed by{" "}
          <a
            href="https://policies.google.com/technologies/partner-sites"
            target="_blank"
            rel="noreferrer noopener"
          >
            Google&apos;s policy for partner sites
          </a>
          . We do not send your workspace content to AdSense.
        </p>

        <h2>What we do not do</h2>
        <ul>
          <li>We do not sell your data.</li>
          <li>We do not share your workspace content with anyone except as described above.</li>
          <li>We do not read your tasks, expenses, planner or AI prompts.</li>
          <li>We do not email you marketing.</li>
        </ul>

        <h2>Notifications</h2>
        <p>
          If you turn on reminders, your browser gives us a push token so we can send you
          a notification. We store that token, the time of day you chose, and which
          reminders you want. Turning reminders off deletes the token. We never use it
          for anything but the reminders you asked for.
        </p>

        <h2>Your controls</h2>
        <p>
          On your <Link to="/profile">Profile</Link> you can export everything you have
          put into U.Do as a JSON file, import it back, or permanently clear your entire
          workspace. Each page can also clear just its own data.
        </p>
        <p>
          There is no button that deletes your account itself yet. Email the address
          above and we will delete the account and everything attached to it.
        </p>

        <h2>How long we keep it</h2>
        <p>
          Until you delete it. Clearing your workspace removes the content immediately.
          Deleting your account removes the account and its content. Backups you
          exported yourself are on your own device and are yours to manage.
        </p>

        <h2>Children</h2>
        <p>
          U.Do is built for students and is not intended for children under 13. We do not
          knowingly collect data from them. If you believe a child has created an
          account, email us and we will remove it.
        </p>

        <h2>Changes</h2>
        <p>
          If this policy changes in a way that affects you, the app will ask you to read
          and accept the new version before you carry on. The version number at the top
          is how you can tell.
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

export default Privacy;
