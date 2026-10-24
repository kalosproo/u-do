import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiPlay, FiUsers } from "react-icons/fi";

import { AdhdPage, Chips } from "../../components/adhd/AdhdUI";
import { useAdhd } from "../../hooks/useAdhd";
import { useAuth } from "../../hooks/useAuth";
import { useFocus } from "../../hooks/useFocus";
import { fetchTasks } from "../../services/tasks";
import { todayPlan } from "../../utils/adhd";
import { toDateKey } from "../../utils/dateKeys";
import { formatClock, formatMinutes } from "../../utils/focusTimer";

const LENGTHS = [
  ["5", "5 min"],
  ["15", "15 min"],
  ["25", "25 min"],
];

/**
 * Focus in ADHD mode: how long (three choices), on what (your Now task, or
 * nothing in particular), and one big button. Study rooms and stats are a
 * tap away, not on the page.
 */
function AdhdFocus() {
  const { user } = useAuth();
  const focus = useFocus();
  const adhd = useAdhd();
  const [minutes, setMinutes] = useState(() => (LENGTHS.some(([key]) => Number(key) === focus?.setup?.minutes) ? String(focus.setup.minutes) : "15"));
  const [tasks, setTasks] = useState([]);
  const [on, setOn] = useState("");

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    fetchTasks(user.uid)
      .then((list) => !cancelled && setTasks(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  // What you might be focusing on: today's Now task and the next one.
  const plan = useMemo(() => todayPlan(tasks, adhd?.picks || []), [tasks, adhd?.picks]);
  const options = useMemo(() => {
    const picked = [plan.now, ...plan.next].filter(Boolean).slice(0, 2);
    return [...picked.map((task) => [task.id, task.title]), ["", "Just focus"]];
  }, [plan]);

  const session = focus?.session;
  const today = focus?.log?.[toDateKey(new Date())]?.minutes || 0;
  const calm = focus?.sound?.kind === "calm";

  return (
    <AdhdPage
      eyebrow="Focus"
      title="Let's"
      italic="focus."
      sub={today >= 1 ? `${formatMinutes(today)} of focus today. Every minute counts.` : "Nothing yet today. Any amount counts."}
      action={
        <Link to="/focus?full=1" className="adhd-ghost">
          Full view
        </Link>
      }
    >
      {session ? (
        <article className="adhd-card adhd-stage adhd-focus-live">
          <p className="adhd-eyebrow">
            <span className="adhd-pulse" aria-hidden="true" /> {session.phase === "break" ? "On a break" : session.paused ? "Paused" : "Focusing"}
          </p>
          <strong className="adhd-focus-clock">{formatClock(focus.remaining)}</strong>
          {session.subject ? <p className="adhd-sheet-meta">{session.subject}</p> : null}
          <button type="button" className="adhd-btn adhd-btn-primary" onClick={focus.open}>
            Open the timer
          </button>
        </article>
      ) : (
        <article className="adhd-card adhd-stage adhd-focus-card">
          <div className="adhd-sheet-section">
            <p className="adhd-eyebrow">How long</p>
            <Chips options={LENGTHS} value={minutes} onChange={setMinutes} label="How long" />
          </div>

          <div className="adhd-sheet-section">
            <p className="adhd-eyebrow">On what</p>
            <Chips options={options} value={options.some(([key]) => key === on) ? on : ""} onChange={setOn} label="On what" size="sm" stack />
          </div>

          <button
            type="button"
            className="adhd-focus-go"
            onClick={() => {
              const task = options.some(([key]) => key === on) ? tasks.find((item) => item.id === on) : null;
              focus.start(Number(minutes), task?.title || "", { taskId: task?.id || "" });
            }}
          >
            <span className="adhd-focus-go-ring" aria-hidden="true" />
            <span className="adhd-focus-go-inner">
              <FiPlay aria-hidden="true" />
              <strong>{minutes}:00</strong>
              <small>Start</small>
            </span>
          </button>

          <div className="adhd-toggle-row">
            <span>
              <strong>Calm sound</strong>
              <small>Soft, slow chords while you work</small>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={calm}
              aria-label="Calm sound"
              className={`adhd-switch${calm ? " is-on" : ""}`}
              onClick={() => focus.setSound({ kind: calm ? "off" : "calm" })}
            >
              <span />
            </button>
          </div>
        </article>
      )}

      <Link to="/focus?tab=room&full=1" className="adhd-card adhd-link-card">
        <FiUsers aria-hidden="true" />
        <span>
          <strong>Study with friends</strong>
          <small>Same timer, on video if you like</small>
        </span>
      </Link>
    </AdhdPage>
  );
}

export default AdhdFocus;
