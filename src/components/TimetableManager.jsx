import { useState } from "react";
import { FiTrash2 } from "react-icons/fi";

import { useAuth } from "../hooks/useAuth";
import { addClass, deleteClass } from "../services/timetable";
import { classesOn, validateClass, WEEKDAYS } from "../utils/timetable";
import { friendlyError } from "../utils/friendlyError";

const EMPTY = { subject: "", day: 1, start: "09:00", end: "10:00", room: "" };

/**
 * Add and remove classes in the weekly timetable. The Planner shows them in
 * each day's column; Home shows what's on now or next.
 */
function TimetableManager({ classes, onChange, onClose }) {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async (event) => {
    event.preventDefault();
    const problem = validateClass(form);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await addClass(user.uid, form);
      onChange([...classes, created]);
      // Keep the day and times: the next class is usually the same day.
      setForm((current) => ({ ...current, subject: "", room: "", start: current.end, end: nextHour(current.end) }));
    } catch (saveError) {
      setError(friendlyError(saveError, "Couldn't save that class."));
    }
    setBusy(false);
  };

  const remove = async (cls) => {
    onChange(classes.filter((item) => item.id !== cls.id));
    try {
      await deleteClass(user.uid, cls.id);
    } catch (removeError) {
      onChange(classes);
      setError(friendlyError(removeError, "Couldn't remove that class."));
    }
  };

  return (
    <div className="autoplan-overlay" role="dialog" aria-modal="true" aria-label="Timetable">
      <section className="autoplan-popup revision-popup timetable-popup">
        <div className="autoplan-header">
          <h4>Timetable</h4>
          <button type="button" className="autoplan-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <form className="timetable-form" onSubmit={add}>
          <input
            className="timetable-subject"
            placeholder="Subject"
            maxLength={40}
            value={form.subject}
            onChange={(event) => setForm({ ...form, subject: event.target.value })}
            aria-label="Subject"
          />
          <select value={form.day} onChange={(event) => setForm({ ...form, day: Number(event.target.value) })} aria-label="Day">
            {WEEKDAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>
          <input placeholder="Room (optional)" maxLength={30} value={form.room} onChange={(event) => setForm({ ...form, room: event.target.value })} aria-label="Room" />
          <input type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} aria-label="Starts" />
          <input type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} aria-label="Ends" />
          <button type="submit" className="autoplan-primary timetable-add" disabled={busy}>
            Add class
          </button>
        </form>
        {error ? <p className="autoplan-status">{error}</p> : null}

        {classes.length ? (
          <div className="timetable-week">
            {WEEKDAYS.map((day) => {
              const list = classesOn(classes, day.value);
              if (!list.length) return null;
              return (
                <div key={day.value} className="timetable-day">
                  <p className="completed-label">{day.label}</p>
                  {list.map((cls) => (
                    <div key={cls.id} className="timetable-row">
                      <span className="timetable-time">
                        {cls.start}–{cls.end}
                      </span>
                      <strong>{cls.subject}</strong>
                      {cls.room ? <span className="timetable-room">{cls.room}</span> : null}
                      <button type="button" className="task-delete" aria-label={`Remove ${cls.subject} on ${day.label}`} onClick={() => remove(cls)}>
                        <FiTrash2 />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="autoplan-muted">No classes yet. Add your first one above — it repeats every week.</p>
        )}
      </section>
    </div>
  );
}

const nextHour = (time) => {
  const [h, m] = time.split(":").map(Number);
  return `${String(Math.min(23, h + 1)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export default TimetableManager;
