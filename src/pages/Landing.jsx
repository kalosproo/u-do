import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  FiActivity,
  FiArrowRight,
  FiCalendar,
  FiCheckSquare,
  FiClock,
  FiDollarSign,
  FiLock,
  FiUsers,
} from "react-icons/fi";

import BrandLogo from "../components/BrandLogo";
import FlipCard from "../components/focus/FlipCard";
import { quoteFor } from "../utils/quotes";

const FEATURES = [
  {
    icon: <FiCheckSquare />,
    title: "Tasks that remind you",
    body: "Due dates, times and repeats. Reminders keep nudging inside the hours you choose until it's done.",
  },
  {
    icon: <FiCalendar />,
    title: "A week you can see",
    body: "Lay the week out day by day, or let the AI planner spread your tasks across it.",
  },
  {
    icon: <FiActivity />,
    title: "Habits that stick",
    body: "Tick a habit daily or weekly and watch the streak grow. Miss a day and it tells you plainly.",
  },
  {
    icon: <FiClock />,
    title: "Focus like it matters",
    body: "A flip-clock study timer with rain and wave sounds, breaks built in, and your focus time tracked.",
  },
  {
    icon: <FiDollarSign />,
    title: "Money, without the spreadsheet",
    body: "Log what comes in and goes out, see the month at a glance, export it whenever you like.",
  },
  {
    icon: <FiUsers />,
    title: "Keep each other going",
    body: "Add friends to see each other's streaks — habit names and streaks only, nothing else.",
  },
];

/**
 * What a signed-out visitor sees at /: what U.Do is, in one screen, and a way
 * in. Signed-in people never see it; / is their Home. Indexable, because this
 * is the page search engines and the AdSense review should find.
 *
 * Every claim on it describes something the app does today.
 */
function Landing() {
  const quote = quoteFor();

  useEffect(() => {
    const previous = document.title;
    document.title = "U.Do — Tasks, habits, focus and money in one calm place";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="landing">
      <header className="landing-nav">
        <BrandLogo />
        <nav className="landing-nav-links" aria-label="Account">
          <Link to="/login" className="landing-link">
            Log in
          </Link>
          <Link to="/login?mode=signup" className="btn btn-primary">
            Get started
          </Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="eyebrow">TASKS · HABITS · FOCUS · MONEY</p>
            <h1 className="landing-title">One calm place for everything you&apos;re doing.</h1>
            <p className="landing-sub">
              Plan the week, build habits that last, study with a timer that feels like a desk
              clock, and keep an eye on your money. Free to use, on your phone or laptop.
            </p>
            <div className="landing-cta">
              <Link to="/login?mode=signup" className="btn btn-primary landing-cta-main">
                Get started — it&apos;s free <FiArrowRight />
              </Link>
              <Link to="/login" className="btn">
                I have an account
              </Link>
            </div>
          </div>

          <div className="landing-device" aria-hidden="true">
            <div className="landing-device-screen">
              <span className="landing-device-label">Physics — Chapter 4</span>
              <div className="landing-flip">
                <FlipCard value="25" />
                <FlipCard value="00" />
              </div>
              <span className="landing-device-label landing-caps">Focus · Rain</span>
            </div>
          </div>
        </section>

        <section className="landing-features" aria-label="What U.Do does">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="landing-feature">
              <span className="landing-feature-icon" aria-hidden="true">
                {feature.icon}
              </span>
              <h2>{feature.title}</h2>
              <p>{feature.body}</p>
            </article>
          ))}
        </section>

        <section className="landing-trust">
          <FiLock aria-hidden="true" />
          <div>
            <h2>Your data stays yours.</h2>
            <p>
              We don&apos;t sell it and we don&apos;t read it. Export everything as a file, or delete
              your account and all of it in one go, whenever you want.{" "}
              <Link to="/privacy">How we handle data</Link>
            </p>
          </div>
        </section>

        <figure className="landing-quote">
          <blockquote>&ldquo;{quote.text}&rdquo;</blockquote>
          <figcaption>{quote.author}</figcaption>
        </figure>

        <section className="landing-final">
          <h2>Start with one thing you want to get done.</h2>
          <Link to="/login?mode=signup" className="btn btn-primary landing-cta-main">
            Create your free account <FiArrowRight />
          </Link>
        </section>
      </main>

      <footer className="landing-footer">
        <p>© 2026 U.Do — Crafted by Rahul Muttukuru · Designed by Haneesh Varma</p>
        <nav aria-label="Legal">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  );
}

export default Landing;
