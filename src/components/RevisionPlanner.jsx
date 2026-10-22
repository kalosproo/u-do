import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../hooks/useAuth";
import { listExams } from "../services/exams";
import { createPlan } from "../services/planner";
import { toDateKey } from "../utils/dateKeys";
import { MAX_CHAPTERS, parseChapters, revisionPlan } from "../utils/revisionPlan";
import { friendlyError } from "../utils/friendlyError";

const formatDay = (key) =>
  new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/**
 * Revision planner: pick an exam (or a date), list the chapters, and the
 * plan spreads them over the days left with the last day kept for a full
 * revision. Shows the plan before adding anything to the Planner.
 */
function RevisionPlanner({ onClose, onAdded }) {
  const { user } = useAuth();
  const [exams, setExams] = useState(null);
  const [examId, setExamId] = useState("");
  const [customDate, setCustomDate] = useState("");
  const [chapterText, setChapterText] = useState("");
  const [reviewDay, setReviewDay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const todayKey = toDateKey(new Date());

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    listExams(user.uid)
      .then((list) => {
        if (cancelled) return;
        const upcoming = list.filter((exam) => exam.date > todayKey).sort((a, b) => a.date.localeCompare(b.date));
        setExams(upcoming);
        if (upcoming[0]) setExamId(upcoming[0].id);
      })
      .catch(() => !cancelled && setExams([]));
    return () => {
      cancelled = true;
    };
  }, [user, todayKey]);

  const exam = exams?.find((item) => item.id === examId) || null;
  const examKey = exam ? exam.date : customDate;
  const chapters = useMemo(() => parseChapters(chapterText), [chapterText]);
  const plan = useMemo(
    () =>
      examKey && chapters.length
        ? revisionPlan({ chapters, startKey: todayKey, examKey, examTitle: exam?.title || "", reviewDay })
        : { items: [], error: "" },
    [chapters, examKey, exam, reviewDay, todayKey]
  );

  const add = async () => {
    if (!user || !plan.items.length) return;
    setBusy(true);
    setStatus("");
    try {
      await Promise.all(plan.items.map((item, index) => createPlan(user.uid, { title: item.title, date: item.date, priority: "high", order: 100 + index })));
      onAdded?.(plan.items.length);
      onClose();
    } catch (error) {
      setStatus(friendlyError(error, "Couldn't add these to your planner. Try again."));
      setBusy(false);
    }
  };

  return (
    <div className="autoplan-overlay" role="dialog" aria-modal="true" aria-label="Plan revision">
      <section className="autoplan-popup revision-popup">
        <div className="autoplan-header">
          <h4>Plan revision</h4>
          <button type="button" className="autoplan-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <label className="revision-field">
          <span>Exam</span>
          {exams === null ? (
            <span className="autoplan-muted">Loading your exams…</span>
          ) : (
            <select value={examId} onChange={(event) => setExamId(event.target.value)}>
              {exams.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · {formatDay(item.date)}
                </option>
              ))}
              <option value="">Another date…</option>
            </select>
          )}
        </label>

        {exams !== null && !exam ? (
          <label className="revision-field">
            <span>Exam date</span>
            <input type="date" min={todayKey} value={customDate} onChange={(event) => setCustomDate(event.target.value)} />
          </label>
        ) : null}

        <label className="revision-field">
          <span>Chapters or topics · one per line</span>
          <textarea
            rows={5}
            value={chapterText}
            placeholder={"Optics\nWaves\nThermodynamics"}
            onChange={(event) => setChapterText(event.target.value)}
          />
          <small className="autoplan-muted">{chapters.length ? `${chapters.length} of ${MAX_CHAPTERS} max` : ""}</small>
        </label>

        <label className="revision-check">
          <input type="checkbox" checked={reviewDay} onChange={(event) => setReviewDay(event.target.checked)} />
          <span>Keep the day before the exam for a full revision</span>
        </label>

        {plan.error ? <p className="autoplan-status">{plan.error}</p> : null}

        {plan.items.length ? (
          <ol className="revision-preview">
            {plan.items.map((item, index) => (
              <li key={`${item.date}-${index}`}>
                <span>{formatDay(item.date)}</span>
                <strong>{item.title}</strong>
              </li>
            ))}
          </ol>
        ) : null}

        {status ? <p className="autoplan-status">{status}</p> : null}

        <div className="autoplan-cta-row">
          <button type="button" className="autoplan-primary" onClick={add} disabled={busy || !plan.items.length}>
            {busy ? "Adding…" : plan.items.length ? `Add ${plan.items.length} to Planner` : "Add to Planner"}
          </button>
          <button type="button" className="autoplan-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}

export default RevisionPlanner;
