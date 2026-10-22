import { Link } from "react-router-dom";

/**
 * The privacy text itself, shared by the /privacy page and the
 * read-and-accept box, so what people scroll through to agree is exactly
 * what the page says.
 */
function PrivacyContent() {
  return (
    <>
      <p>
        U.Do is a personal productivity workspace. This page explains what it stores,
        where that data goes, and what you can do about it. It is written to match
        how the app actually behaves.
      </p>

      <h2>Who runs U.Do</h2>
      <p>
        U.Do is an independent project by Rahul Muttukuru, and using it is covered
        by the <Link to="/terms">Terms of Service</Link>. For any privacy question,
        or to ask for your account to be deleted, email{" "}
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
      <p>
        If you use the focus timer while signed in, how many minutes you focused each
        day, how many sessions, and the subject you typed for them, so your study stats
        follow you between devices. Exam and deadline countdowns you add — a title, a
        date and an optional subject — are kept the same way, readable only by you.
      </p>

      <h3>Your profile and friends</h3>
      <p>
        A display name, a username, an invite code and a profile picture, which other
        signed-in people can see so that search and invite links work. If you add
        friends, they can additionally see a summary of your habits: their names, your
        streaks and your completion rates. While you run a focus session they can also
        see that you are focusing and how long is left, and the leaderboard shows them
        your total focus time this week. They never see what you are studying, and you
        can turn both off on the Focus page. They can see which achievement
        badges you have earned and when. They cannot see your tasks, your planner, your
        finances, your exams, or anything else.
      </p>
      <p>
        If you open a study room, the friends you invite can see your display name,
        who else has joined, and the room&apos;s timer. If you join one, the host and the
        others in it see your display name. A room never holds what anyone is studying,
        and it is deleted when the host closes it.
      </p>

      <h3>How the service is used</h3>
      <p>
        To run U.Do we keep counts of what each account has — how many active tasks,
        habits and friends, and how many transactions, plans and assistant requests
        this month — and when it was last active. We also keep a log of what kind of
        thing happened and when, such as &quot;added a transaction&quot; or
        &quot;completed a task&quot;. Neither ever includes what you wrote: not a title,
        not an amount, not a note. Deleting your account deletes both.
      </p>

      <h3>Error reports</h3>
      <p>
        If the app crashes while you are signed in, it sends us a report of the error
        and the page it happened on, so we can fix it. Before a report is stored,
        email addresses, long numbers and anything after a &quot;?&quot; in a web
        address are removed, and no account id is attached — we cannot tell whose
        error it was. Reports are deleted after 30 days.
      </p>

      <h3>On your device</h3>
      <p>
        Your theme choice, your focus-timer settings, a running session, and a cached
        copy of your expenses and habits are kept in your browser&apos;s local storage, so the app opens fast and survives a brief
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

      <h3>Resend (email)</h3>
      <p>
        If you turn on the morning summary or the monthly report email, Resend sends it
        for us. It receives your email address and that email&apos;s content — for the
        morning summary, the titles of what&apos;s due, planned and to tick; for the
        monthly report, last month&apos;s totals for focus time, tasks, habits and
        spending — and nothing else. Both are off unless you switch them on, and every
        email has a one-tap unsubscribe.
      </p>

      <h3>Razorpay</h3>
      <p>
        If you buy Pro, the payment is handled by Razorpay. Your card, UPI or bank
        details go to Razorpay directly and never reach us. Razorpay tells us whether
        the subscription is active and the amount, date and status of each payment,
        and we keep that to know who is on Pro. Razorpay processes your payment under
        its own privacy policy and the law that applies to payment providers.
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
        <strong>Delete account</strong> at the bottom of Profile permanently removes
        the account itself and everything attached to it: your tasks, habits, planner
        and transactions, your profile and handle, your billing and reminder records,
        and your place in anyone else&apos;s friends list. It asks you to sign in again
        first, because an unattended laptop should not be two clicks from destroying
        an account. It cannot be undone and we cannot recover it for you.
      </p>

      <h2>How long we keep it</h2>
      <p>
        Until you delete it. Clearing your workspace removes the content immediately.
        Deleting your account removes the account and its content, including the
        record of your having accepted this policy. Backups you exported yourself are
        on your own device and are yours to manage.
      </p>
      <p>
        Three things outlive a deletion and it would be wrong not to say so. Our
        database is backed up daily so that a mistake or an outage cannot wipe out
        everyone&apos;s data; a deleted account remains in those backups until they
        expire, which is at most 7 days later, and is never restored from them on
        purpose. Vercel&apos;s server logs keep IP addresses and request times on their
        own retention schedule, as any web host does. And anything you sent to the AI
        assistant was processed by Groq under their terms — we cannot reach into their
        systems to remove it.
      </p>
      <p>
        A fourth applies only if you paid for Pro. Deleting your account cancels the
        subscription first, so nothing more is charged, but the record of each payment — amount, date, status —
        is kept for as long as tax and accounting law requires, without your workspace
        content, and Razorpay keeps its own records under its own obligations.
      </p>

      <h2>Children</h2>
      <p>
        U.Do is built for students and is not intended for children under 13. We do not
        knowingly collect data from them. If you believe a child has created an
        account, email us and we will remove it.
      </p>

      <h2>Changes</h2>
      <p>
        If this policy changes in a way that affects you, the app shows a notice with a
        link to the new version. The version number at the top is how you can tell.
      </p>
    </>
  );
}

export default PrivacyContent;
