import { useEffect, useState } from "react";
import { FiPlus, FiX } from "react-icons/fi";

import { useAuth } from "../hooks/useAuth";
import { useFocus } from "../hooks/useFocus";
import { deleteExam, listExams, saveExam } from "../services/exams";
import { toDateKey } from "../utils/dateKeys";
import { countdownLabel, daysUntil, minutesStudied, upcomingExams } from "../utils/exams";
import { formatMinutes } from "../utils/focusTimer";
import FlipCard from "./focus/FlipCard";

const SHOWN = 4;

const longDate = (key) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/**
 * Exam countdowns: days left on a small flip card, and how much focus time
 * has gone to that subject. The subject links the two — focus sessions
 * started with the same subject count toward the exam.
 */
function ExamCountdowns() {
  const { user } = useAuth();
  const focus = useFocus();
  const [state, setState] = useState({ uid: null, exams: [] });
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    listExams(user.uid)
      .then((exams) => !cancelled && setState({ uid: user.uid, exams }))
      .catch(() => !cancelled && setState({ uid: user.uid, exams: [] }));
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || state.uid !== user.uid) return null;

  const upcoming = upcomingExams(state.exams);
  const todayKey = toDateKey(new Date());

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.date) {
      setError("Give it a name and a date.");
      return;
    }
    try {
      const saved = await saveExam(user.uid, form);
      setState((current) => ({ ...current, exams: [...current.exams.filter((e) => e.id !== saved.id), saved] }));
      setForm(null);
      setError("");
    } catch {
      setError("Couldn't save that. Try again.");
    }
  };

  const remove = async (exam) => {
    if (!window.confirm(`Remove "${exam.title}"?`)) return;
    setState((current) => ({ ...current, exams: current.exams.filter((e) => e.id !== exam.id) }));
    await deleteExam(user.uid, exam.id).catch(() => {});
  };

  return (
    <section className="panel exams-card" aria-label="Countdowns">
      <div className="panel-head">
        <div>
          <p className="eyebrow">COUNTDOWNS</p>
          <h3 className="panel-title">Exams and deadlines</h3>
        </div>
        {form ? null : (
          <button type="button" className="btn btn-sm" onClick={() => setForm({ title: "", date: "", subject: "" })}>
            <FiPlus /> Add
          </button>
        )}
      </div>

      {form ? (
        <form className="exam-form" onSubmit={submit}>
          <input placeholder="Physics final" value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Exam or deadline" autoFocus />
          <input type="date" value={form.date} min={todayKey} onChange={(e) => setForm({ ...form, date: e.target.value })} aria-label="Date" />
          <input placeholder="Subject for focus time (optional)" value={form.subject} maxLength={40} onChange={(e) => setForm({ ...form, subject: e.target.value })} aria-label="Subject" />
          <div className="exam-form-actions">
            <button type="button" className="btn" onClick={() => { setForm(null); setError(""); }}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
          {error ? <p className="login-error">{error}</p> : null}
        </form>
      ) : null}

      {upcoming.length ? (
        <ul className="exam-list">
          {upcoming.slice(0, SHOWN).map((exam) => {
            const days = daysUntil(exam.date);
            const studied = minutesStudied(exam, focus?.log);
            return (
              <li key={exam.id} className={days <= 3 ? "is-close" : ""}>
                <span className="exam-flip" aria-hidden="true">
                  {days > 99 ? <span className="exam-days-plain">{days}</span> : <FlipCard value={String(days).padStart(2, "0")} />}
                </span>
                <span className="exam-text">
                  <strong>{exam.title}</strong>
                  <small>
                    {countdownLabel(days)} · {longDate(exam.date)}
                    {studied ? ` · ${formatMinutes(studied)} studied` : ""}
                  </small>
                </span>
                <button type="button" className="icon-btn" onClick={() => remove(exam)} aria-label={`Remove ${exam.title}`}>
                  <FiX />
                </button>
              </li>
            );
          })}
        </ul>
      ) : form ? null : (
        <p className="panel-note">Add an exam or a deadline and count down to it. Give it a subject and your focus time counts toward it.</p>
      )}
    </section>
  );
}

export default ExamCountdowns;
