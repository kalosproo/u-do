import { useState } from "react";
import { createPortal } from "react-dom";
import { FiActivity, FiCheckSquare, FiUsers, FiZap } from "react-icons/fi";

import { useAuth } from "../hooks/useAuth";

const SLIDES = [
  {
    icon: <FiZap />,
    title: "Welcome to U.Do",
    body: "Your tasks, plans, habits and money in one calm place. Tap Capture (+) anywhere to jot something down before it slips.",
  },
  {
    icon: <FiCheckSquare />,
    title: "Plan the week, finish the day",
    body: "Give tasks a date and a time to get a reminder. The Planner lays your week out day by day.",
  },
  {
    icon: <FiActivity />,
    title: "Build habits that stick",
    body: "Tick a habit once a day or once a week. Streaks grow as long as you keep showing up.",
  },
  {
    icon: <FiUsers />,
    title: "Keep each other going",
    body: "Add friends to see each other's streaks — only habit names and streaks, nothing else.",
  },
];

/** Only accounts this new see the tour; everyone who signed up before it never does. */
const NEW_ACCOUNT_DAYS = 3;
const seenKey = (uid) => `u_do_tour_seen_${uid}`;

const shouldShow = (user) => {
  if (!user) return false;
  const created = Date.parse(user.metadata?.creationTime || "");
  if (!Number.isFinite(created) || Date.now() - created > NEW_ACCOUNT_DAYS * 86_400_000) return false;
  try {
    return localStorage.getItem(seenKey(user.uid)) !== "1";
  } catch {
    return false;
  }
};

/**
 * Four short slides on a brand-new account's first visit. Skippable from the
 * first one, and remembered once closed. The consent prompt mounts after
 * this, so it sits on top until accepted and the tour is what follows.
 */
function WelcomeTour() {
  const { user } = useAuth();
  const [closedFor, setClosedFor] = useState(null);
  const [index, setIndex] = useState(0);

  if (!user || closedFor === user.uid || !shouldShow(user)) return null;

  const close = () => {
    try {
      localStorage.setItem(seenKey(user.uid), "1");
    } catch {
      /* Closed for this visit regardless. */
    }
    setClosedFor(user.uid);
  };

  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  return createPortal(
    <div className="modal-overlay tour-overlay">
      <section className="modal-card tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        <div key={index} className="tour-icon" aria-hidden="true">{slide.icon}</div>
        <h3 id="tour-title" className="tour-title">{slide.title}</h3>
        <p className="tour-body">{slide.body}</p>

        <div className="tour-dots" aria-label={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((item, i) => (
            <span key={item.title} className={i === index ? "is-active" : ""} />
          ))}
        </div>

        <div className="tour-actions">
          <button type="button" className="btn" onClick={close}>
            Skip
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => (last ? close() : setIndex(index + 1))}
            autoFocus
          >
            {last ? "Get started" : "Next"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export default WelcomeTour;
