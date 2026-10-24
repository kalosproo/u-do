import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { FiActivity, FiCalendar, FiCheckCircle, FiCreditCard, FiGrid, FiPlayCircle, FiPlus, FiSun, FiUser, FiUsers } from "react-icons/fi";

import ErrorBoundary from "../ErrorBoundary";
import OfflineNotice from "../OfflineNotice";
import VerifyEmailBanner from "../VerifyEmailBanner";
import { useAuth } from "../../hooks/useAuth";
import { createTask } from "../../services/tasks";
import { TASKS_CHANGED, WHEN, dueFor } from "../../utils/adhd";
import { Ambient } from "./AdhdBits";
import { Chips, Sheet } from "./AdhdUI";

const MORE = [
  ["/habits", "Habits", <FiActivity key="i" aria-hidden="true" />, "Little things, every day"],
  ["/planner", "Planner", <FiCalendar key="i" aria-hidden="true" />, "Today and tomorrow"],
  ["/finance", "Money", <FiCreditCard key="i" aria-hidden="true" />, "What went out"],
  ["/friends", "Friends", <FiUsers key="i" aria-hidden="true" />, "Your people"],
  ["/profile", "You", <FiUser key="i" aria-hidden="true" />, "Settings and ADHD mode"],
];

/**
 * ADHD mode's whole app: no sidebar, no menus, no header — the screen, the
 * light behind it, and a dock with the four places that matter plus a way
 * to get a thought out of your head from anywhere.
 */
function AdhdShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [more, setMore] = useState(false);
  const [adding, setAdding] = useState(false);
  const inMore = MORE.some(([path]) => location.pathname.startsWith(path));

  // The app's usual "capture" shortcut opens the quick add here too.
  useEffect(() => {
    const open = () => setAdding(true);
    window.addEventListener("udo:quick-capture", open);
    return () => window.removeEventListener("udo:quick-capture", open);
  }, []);

  return (
    <>
      <Ambient />
      <OfflineNotice />

      <main className="main-content adhd-main">
        <VerifyEmailBanner />
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>

      <nav className="adhd-dock" aria-label="Main">
        <NavLink to="/" end>
          <FiSun aria-hidden="true" />
          <span>Today</span>
        </NavLink>
        <NavLink to="/tasks">
          <FiCheckCircle aria-hidden="true" />
          <span>Tasks</span>
        </NavLink>
        <button type="button" className="adhd-dock-add" aria-label="Add something" onClick={() => setAdding(true)}>
          <FiPlus aria-hidden="true" />
        </button>
        <NavLink to="/focus">
          <FiPlayCircle aria-hidden="true" />
          <span>Focus</span>
        </NavLink>
        <button type="button" className={inMore ? "active" : ""} aria-haspopup="dialog" onClick={() => setMore(true)}>
          <FiGrid aria-hidden="true" />
          <span>More</span>
        </button>
      </nav>

      <Sheet open={more} onClose={() => setMore(false)} label="More">
        <h2 className="adhd-sheet-title">
          Where <em>to?</em>
        </h2>
        <div className="adhd-more">
          {MORE.map(([path, label, icon, hint]) => (
            <button
              key={path}
              type="button"
              className={`adhd-more-tile${location.pathname.startsWith(path) ? " is-here" : ""}`}
              onClick={() => {
                setMore(false);
                navigate(path);
              }}
            >
              {icon}
              <strong>{label}</strong>
              <small>{hint}</small>
            </button>
          ))}
        </div>
      </Sheet>

      <QuickAdd open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

/**
 * Brain dump: type it, pick when, done. It stays open for the next thought,
 * and shows what's gone in so far.
 */
function QuickAdd({ open, onClose }) {
  const { user } = useAuth();
  const [text, setText] = useState("");
  const [when, setWhen] = useState("today");
  const [added, setAdded] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const close = () => {
    setText("");
    setAdded([]);
    setError("");
    setWhen("today");
    onClose();
  };

  const submit = async (event) => {
    event.preventDefault();
    const title = text.trim();
    if (!user || !title || busy) return;
    setBusy(true);
    setError("");
    try {
      await createTask(user.uid, { title, dueDate: dueFor(when), priority: "medium" });
      setAdded((list) => [{ title, when }, ...list].slice(0, 4));
      setText("");
      window.dispatchEvent(new Event(TASKS_CHANGED));
    } catch {
      setError("Couldn't add that. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const whenLabel = Object.fromEntries(WHEN);

  return (
    <Sheet open={open} onClose={close} label="Add something">
      <h2 className="adhd-sheet-title">
        What&apos;s on your <em>mind?</em>
      </h2>
      <form className="adhd-quick" onSubmit={submit}>
        <input
          className="adhd-quick-input"
          value={text}
          maxLength={200}
          placeholder="Type it before it's gone"
          aria-label="What's on your mind?"
          enterKeyHint="done"
          onChange={(event) => setText(event.target.value)}
        />
        <Chips options={WHEN} value={when} onChange={setWhen} label="When" />
        <button type="submit" className="adhd-btn adhd-btn-primary adhd-quick-add" disabled={!text.trim() || busy}>
          Add
        </button>
      </form>
      {error ? (
        <p className="adhd-error" role="alert">
          {error}
        </p>
      ) : null}
      {added.length ? (
        <ul className="adhd-quick-added" aria-label="Just added">
          {added.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <FiCheckCircle aria-hidden="true" />
              <span>{item.title}</span>
              <small>{whenLabel[item.when]}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="adhd-quick-hint">Get it out of your head. You can sort it later.</p>
      )}
      {added.length ? (
        <button type="button" className="adhd-link adhd-link-center" onClick={close}>
          Done
        </button>
      ) : null}
    </Sheet>
  );
}

export default AdhdShell;
