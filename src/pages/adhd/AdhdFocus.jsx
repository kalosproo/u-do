import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FiChevronRight, FiPlay, FiUsers } from "react-icons/fi";

import { AdhdPage, Chips, FullView } from "../../components/adhd/AdhdUI";
import { useWarm } from "../../components/adhd/useWarm";
import { useAdhd } from "../../hooks/useAdhd";
import { useAuth } from "../../hooks/useAuth";
import { useFocus } from "../../hooks/useFocus";
import { fetchTasks } from "../../services/tasks";
import { todayPlan } from "../../utils/adhd";
import { quietMotion } from "../../utils/morph";
import { toDateKey } from "../../utils/dateKeys";
import { formatClock, formatMinutes } from "../../utils/focusTimer";

const LENGTHS = [
  ["5", "5 min"],
  ["15", "15 min"],
  ["25", "25 min"],
];

/** A minute mark for every minute of the hour, like the face of a kitchen timer. */
const MARKS = Array.from({ length: 60 }, (_, minute) => minute);

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
  const [loaded, setTasks] = useWarm(user ? `${user.uid}:tasks` : "");
  const tasks = useMemo(() => loaded || [], [loaded]);
  const [on, setOn] = useState("");
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    fetchTasks(user.uid)
      .then((list) => !cancelled && setTasks(list))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, setTasks]);

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
      title="Focus"
      sub={today >= 1 ? `${formatMinutes(today)} of focus today. Every minute counts.` : "Nothing yet today. Any amount counts."}
      action={<FullView to="/focus?full=1" />}
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
            className={`adhd-focus-go${launching ? " is-launching" : ""}`}
            disabled={launching}
            aria-label={`Start ${minutes} minutes of focus`}
            onClick={() => {
              const task = options.some(([key]) => key === on) ? tasks.find((item) => item.id === on) : null;
              // The button swells into the timer before it opens.
              setLaunching(true);
              setTimeout(
                () => {
                  setLaunching(false);
                  focus.start(Number(minutes), task?.title || "", { taskId: task?.id || "" });
                },
                quietMotion() ? 0 : 260
              );
            }}
          >
            {/* The minutes you picked light up around the face, one mark each. */}
            <svg className="adhd-dial" viewBox="0 0 200 200" aria-hidden="true">
              {MARKS.map((minute) => (
                <line
                  key={minute}
                  x1="100"
                  y1="8"
                  x2="100"
                  y2={minute % 5 === 0 ? 21 : 15}
                  transform={`rotate(${minute * 6} 100 100)`}
                  className={`${minute % 5 === 0 ? "is-major" : ""}${minute < Number(minutes) ? " is-lit" : ""}`}
                  style={{ "--i": minute }}
                />
              ))}
            </svg>
            <span className="adhd-focus-go-inner" aria-hidden="true">
              <strong>{minutes}:00</strong>
              <small>
                <FiPlay /> Start
              </small>
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
        <FiChevronRight className="adhd-link-card-go" aria-hidden="true" />
      </Link>
    </AdhdPage>
  );
}

export default AdhdFocus;
