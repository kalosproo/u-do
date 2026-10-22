import { useEffect, useMemo, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";

import { useAuth } from "../hooks/useAuth";
import { addGrade, deleteGrade, listGrades } from "../services/grades";
import { toDateKey } from "../utils/dateKeys";
import { gradeSummary, percentOf, validateGrade } from "../utils/grades";

const EMPTY = { subject: "", title: "", score: "", outOf: "100" };
const pct = (n) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

/**
 * Marks per subject: an average for each and overall, the latest result and
 * how it moved. Tap a subject for its marks.
 */
function GradesCard() {
  const { user } = useAuth();
  const [state, setState] = useState({ uid: null, grades: [] });
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    listGrades(user.uid)
      .then((grades) => !cancelled && setState({ uid: user.uid, grades }))
      .catch(() => !cancelled && setState({ uid: user.uid, grades: [] }));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const grades = user && state.uid === user.uid ? state.grades : null;
  const summary = useMemo(() => gradeSummary(grades || []), [grades]);
  if (!user || grades === null) return null;

  const save = async (event) => {
    event.preventDefault();
    const problem = validateGrade(form);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    try {
      const created = await addGrade(user.uid, { ...form, date: toDateKey(new Date()) });
      setState({ uid: user.uid, grades: [...grades, created] });
      setForm((current) => ({ ...EMPTY, subject: current.subject, outOf: current.outOf }));
    } catch (saveError) {
      setError(saveError?.message || "Couldn't save that mark.");
    }
  };

  const remove = async (grade) => {
    setState({ uid: user.uid, grades: grades.filter((item) => item.id !== grade.id) });
    try {
      await deleteGrade(user.uid, grade.id);
    } catch {
      setState({ uid: user.uid, grades });
      setError("Couldn't remove that mark.");
    }
  };

  return (
    <section className="panel grades-card" aria-label="Grades">
      <div className="panel-head">
        <div>
          <p className="eyebrow">GRADES</p>
          <h3 className="panel-title">{summary.overall === null ? "Your marks" : `Average ${pct(summary.overall)}`}</h3>
        </div>
        {form ? null : (
          <button type="button" className="btn btn-sm" onClick={() => setForm(EMPTY)}>
            <FiPlus aria-hidden="true" /> Add mark
          </button>
        )}
      </div>

      {form ? (
        <form className="grades-form" onSubmit={save}>
          <input
            className="grades-subject"
            list="grade-subjects"
            placeholder="Subject"
            maxLength={40}
            value={form.subject}
            onChange={(event) => setForm({ ...form, subject: event.target.value })}
            aria-label="Subject"
          />
          <datalist id="grade-subjects">
            {summary.subjects.map((s) => (
              <option key={s.subject} value={s.subject} />
            ))}
          </datalist>
          <input
            className="grades-title"
            placeholder="What was it? (optional)"
            maxLength={80}
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            aria-label="Test or assignment"
          />
          <input type="number" inputMode="decimal" min="0" placeholder="Score" value={form.score} onChange={(event) => setForm({ ...form, score: event.target.value })} aria-label="Score" />
          <input type="number" inputMode="decimal" min="1" placeholder="Out of" value={form.outOf} onChange={(event) => setForm({ ...form, outOf: event.target.value })} aria-label="Out of" />
          <button type="button" className="btn" onClick={() => { setForm(null); setError(""); }}>
            Done
          </button>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </form>
      ) : null}
      {error ? <p className="login-error">{error}</p> : null}

      {summary.subjects.length ? (
        <ul className="grades-list">
          {summary.subjects.map((s) => (
            <li key={s.subject} className={open === s.subject ? "is-open" : ""}>
              <button type="button" className="grades-row" aria-expanded={open === s.subject} onClick={() => setOpen(open === s.subject ? "" : s.subject)}>
                <span className="grades-name">
                  <strong>{s.subject}</strong>
                  <small>
                    {s.count} {s.count === 1 ? "mark" : "marks"} · latest {pct(s.latest)}
                    {s.change ? ` (${s.change > 0 ? "+" : ""}${s.change})` : ""}
                  </small>
                </span>
                <span className="grades-bar" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, s.average)}%` }} />
                </span>
                <span className="grades-avg">{pct(s.average)}</span>
              </button>
              {open === s.subject ? (
                <ul className="grades-marks">
                  {[...s.marks].reverse().map((mark) => (
                    <li key={mark.id}>
                      <span>{mark.title || "Mark"}</span>
                      <span className="grades-score">
                        {mark.score}/{mark.outOf} · {pct(Math.round(percentOf(mark) * 10) / 10)}
                      </span>
                      <button type="button" className="task-delete" aria-label={`Remove ${mark.title || "mark"}`} onClick={() => remove(mark)}>
                        <FiTrash2 />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : form ? null : (
        <p className="panel-note">Add a test or assignment mark and see your average per subject, and whether it's going up.</p>
      )}
    </section>
  );
}

export default GradesCard;
