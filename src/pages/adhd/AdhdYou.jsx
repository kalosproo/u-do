import { useEffect } from "react";
import { signOut } from "firebase/auth";
import { Link } from "react-router-dom";
import { FiChevronRight, FiLogOut, FiSettings } from "react-icons/fi";

import { AdhdPage, Chips } from "../../components/adhd/AdhdUI";
import { useProgress } from "../../components/adhd/useProgress";
import { useWarm } from "../../components/adhd/useWarm";
import { useAdhd } from "../../hooks/useAdhd";
import { useAuth } from "../../hooks/useAuth";
import { useTheme } from "../../hooks/useTheme";
import { auth } from "../../services/firebase";
import { fetchHabits } from "../../services/habits";
import { fetchTasks } from "../../services/tasks";
import { DEFAULT_PICKS, MAX_PICKS, POINTS } from "../../utils/adhd";
import { resolveUserPhoto } from "../../utils/profilePhoto";

const THEMES = [
  ["dark", "Dark"],
  ["light", "Light"],
];

const MOTIONS = [
  ["lively", "Lively"],
  ["calm", "Calm"],
];

const TEXT_SIZES = [
  ["standard", "Standard"],
  ["large", "Large"],
  ["larger", "Larger"],
];

const PICK_COUNTS = Array.from({ length: MAX_PICKS }, (_, index) => [index + 1, String(index + 1)]);

const PICK_WORDS = {
  1: "Just the one. Good for a hard day.",
  2: "Two, and the rest can wait.",
  3: "Three. Enough to matter, few enough to finish.",
  4: "Four. A fuller day.",
  5: "Five. A big day, so keep them small.",
};

// The parts of Today that can be put away, in the order they appear.
const PARTS = [
  ["time", "Time left in the day", "The line that fills as the day goes"],
  ["level", "Points and level", `Your level on Today, and +${POINTS.task} when you finish something`],
  ["coming", "Coming up", "Your next class and nearest exam"],
  ["habits", "Little things", "Your habits, one tap each"],
  ["run", "Days in a row", "Beside the date, from two days on"],
];

/**
 * You, in ADHD mode: your level, the switch that brings the full app back,
 * how it looks, what Today shows, and a way out. Everything else on the full
 * profile page is one tap away.
 */
function AdhdYou() {
  const { user } = useAuth();
  const adhd = useAdhd();
  const { theme, setTheme } = useTheme();
  const name = user?.displayName || user?.email?.split("@")[0] || "You";
  const photo = resolveUserPhoto(user);
  const limit = adhd?.pickLimit || DEFAULT_PICKS;
  const parts = adhd?.todayParts || {};
  const pointsOn = parts.level !== false;

  // Points come from the records, so they're read here too, fresh, like on
  // every other screen; a copy from earlier shows in the meantime.
  const [tasks, setTasks] = useWarm(user ? `${user.uid}:tasks` : "");
  const [habits, setHabits] = useWarm(user ? `${user.uid}:habits` : "");
  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const [freshTasks, freshHabits] = await Promise.all([fetchTasks(user.uid), fetchHabits(user)]);
        if (cancelled) return;
        setTasks(freshTasks);
        setHabits(freshHabits);
      } catch {
        /* The level waits for the next screen that loads them. */
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [user, setTasks, setHabits]);
  const progress = useProgress(tasks, habits);

  return (
    <AdhdPage title="You" sub={user?.email}>
      <div className="adhd-card adhd-you">
        {photo ? <img className="adhd-avatar is-big" src={photo} alt="" referrerPolicy="no-referrer" /> : <span className="adhd-avatar is-big">{name.charAt(0).toUpperCase()}</span>}
        <span>
          <strong>{name}</strong>
          <small>ADHD mode is on</small>
        </span>
      </div>

      {pointsOn && progress.shown ? (
        <div className="adhd-card adhd-progress">
          <div className="adhd-progress-top">
            <p className="adhd-eyebrow">Your level</p>
            <span className="adhd-progress-today">{progress.today ? `+${progress.today} today` : "Nothing yet today"}</span>
          </div>
          <p className="adhd-progress-level">
            <strong>Level {progress.level}</strong>
            <small>{progress.total.toLocaleString()} points</small>
          </p>
          <span className="adhd-level-track is-big" aria-hidden="true">
            <span style={{ "--p": progress.progress }} />
          </span>
          <p className="adhd-progress-next">
            {progress.toNext} more to level {progress.level + 1}
          </p>
          <p className="adhd-progress-how">
            {POINTS.task} for a finished task · {POINTS.habit} for a habit tick · {POINTS.minute} for each minute of focus
          </p>
        </div>
      ) : null}

      <div className="adhd-card adhd-settings">
        <div className="adhd-toggle-row">
          <span>
            <strong>ADHD mode</strong>
            <small>Turn off to go back to the full app. Nothing you've added changes.</small>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(adhd?.enabled)}
            aria-label="ADHD mode"
            className={`adhd-switch${adhd?.enabled ? " is-on" : ""}`}
            onClick={() => adhd?.setEnabled(!adhd.enabled)}
          >
            <span />
          </button>
        </div>
        <div className="adhd-toggle-row">
          <span>
            <strong>Look</strong>
            <small>Whatever is easier on your eyes</small>
          </span>
          <Chips options={THEMES} value={theme} onChange={setTheme} label="Theme" size="sm" />
        </div>
        <div className="adhd-toggle-row is-wide">
          <span>
            <strong>Text size</strong>
            <small>Bigger words on every ADHD screen, on this device</small>
          </span>
          <Chips options={TEXT_SIZES} value={adhd?.textSize || "standard"} onChange={(value) => adhd?.setTextSize(value)} label="Text size" size="sm" />
        </div>
        <div className="adhd-toggle-row">
          <span>
            <strong>Motion</strong>
            <small>{adhd?.motion === "calm" ? "Still and quiet. No confetti." : "Confetti, sparks and swoops for every win"}</small>
          </span>
          <Chips options={MOTIONS} value={adhd?.motion || "lively"} onChange={(value) => adhd?.setMotion(value)} label="Motion" size="sm" />
        </div>
      </div>

      <div className="adhd-card adhd-settings">
        <p className="adhd-eyebrow">Today</p>
        <div className="adhd-toggle-row">
          <span>
            <strong>Things a day</strong>
            <small>{PICK_WORDS[limit]}</small>
          </span>
          <Chips options={PICK_COUNTS} value={limit} onChange={(value) => adhd?.setPickLimit(value)} label="Things a day" size="sm" />
        </div>
        {PARTS.map(([part, title, detail]) => {
          const shown = parts[part] !== false;
          return (
            <div className="adhd-toggle-row" key={part}>
              <span>
                <strong>{title}</strong>
                <small>{detail}</small>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={shown}
                aria-label={title}
                className={`adhd-switch${shown ? " is-on" : ""}`}
                onClick={() => adhd?.setTodayPart(part, !shown)}
              >
                <span />
              </button>
            </div>
          );
        })}
      </div>

      <Link to="/profile?full=1" className="adhd-card adhd-link-card">
        <FiSettings aria-hidden="true" />
        <span>
          <strong>All settings</strong>
          <small>Reminders, emails, your data, your account</small>
        </span>
        <FiChevronRight className="adhd-link-card-go" aria-hidden="true" />
      </Link>

      <button type="button" className="adhd-link adhd-link-center" onClick={() => signOut(auth)}>
        <FiLogOut aria-hidden="true" /> Sign out
      </button>
    </AdhdPage>
  );
}

export default AdhdYou;
