import { useCallback, useEffect, useMemo, useState } from "react";

import { Confetti } from "../../components/adhd/AdhdBits";
import { AddBar, AdhdPage, Chips, FullView, Sheet, Tick, Toast } from "../../components/adhd/AdhdUI";
import { enrichHabit, toggledLogs } from "../../components/adhd/habitBits";
import { useToast } from "../../components/adhd/useToast";
import { useWarm } from "../../components/adhd/useWarm";
import { useAuth } from "../../hooks/useAuth";
import { createHabit, deleteHabit, fetchHabits, setHabitLogs, updateHabit } from "../../services/habits";
import { streakWords } from "../../utils/adhd";

const HOW_OFTEN = [
  ["daily", "Every day"],
  ["weekly", "Once a week"],
];

/**
 * Habits in ADHD mode: a big tick per habit and the last seven days as
 * dots. No percentages, no "broken" — a run gets mentioned only when there
 * is one to be pleased about.
 */
function AdhdHabits() {
  const { user } = useAuth();
  const [habits, setHabits] = useWarm(user ? `${user.uid}:habits` : "");
  const [often, setOften] = useState("daily");
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast(3000);

  const load = useCallback(async () => {
    if (!user) return;
    setHabits(await fetchHabits(user));
  }, [user, setHabits]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const today = useMemo(() => new Date(), []);
  const list = useMemo(() => (habits || []).map((habit) => enrichHabit(habit, today)), [habits, today]);
  const done = list.filter((habit) => habit.doneNow).length;
  const selected = list.find((habit) => habit.id === openId) || null;
  const [party, setParty] = useState(0);

  const toggle = async (habit) => {
    const logs = toggledLogs(habit, today);
    setHabits((current) => (current || []).map((item) => (item.id === habit.id ? { ...item, logs } : item)));
    if (!habit.doneNow) {
      const left = list.filter((item) => !item.doneNow && item.id !== habit.id).length;
      showToast(left ? "Ticked. Lovely." : "All done for today.");
      if (!left) setParty((n) => n + 1);
    }
    try {
      await setHabitLogs(user.uid, habit.id, logs);
    } catch {
      setError("Couldn't save that. Check your connection.");
      load();
    }
  };

  const add = async (title) => {
    try {
      await createHabit(user.uid, { title, frequency: often });
      await load();
      return true;
    } catch {
      setError("Couldn't add that habit.");
      return false;
    }
  };

  const change = async (habit, frequency) => {
    setHabits((current) => (current || []).map((item) => (item.id === habit.id ? { ...item, frequency } : item)));
    try {
      await updateHabit(user.uid, habit.id, { frequency });
    } catch {
      setError("Couldn't change that.");
      load();
    }
  };

  const remove = async (habit) => {
    setOpenId(null);
    setHabits((current) => (current || []).filter((item) => item.id !== habit.id));
    try {
      await deleteHabit(user.uid, habit.id);
    } catch {
      setError("Couldn't delete that habit.");
      load();
    }
  };

  return (
    <AdhdPage
      title="Habits"
      sub={
        habits === null
          ? " "
          : list.length
            ? done === list.length
              ? "Everything ticked today. That's it — go live a little."
              : `${done} of ${list.length} done today.`
            : "Add one small thing you'd like to do most days."
      }
      action={<FullView to="/habits?full=1" />}
    >
      {error ? (
        <p className="adhd-error" role="alert">
          {error}
        </p>
      ) : null}

      {habits === null ? (
        <div className="adhd-skeleton" aria-busy="true" aria-label="Loading habits">
          <span />
          <span />
        </div>
      ) : list.length ? (
        <ul className="adhd-habits adhd-card adhd-group">
          {list.map((habit) => {
            const words = streakWords(habit.streak, habit.frequency);
            return (
              <li key={habit.id} className={`adhd-habit${habit.doneNow ? " is-done" : ""}`}>
                <Tick size="lg" done={habit.doneNow} onToggle={() => toggle(habit)} label={habit.doneNow ? `Untick ${habit.title}` : `Tick ${habit.title}`} />
                <button type="button" className="adhd-habit-main" onClick={() => setOpenId(habit.id)}>
                  <span className="adhd-habit-title">{habit.title}</span>
                  <span className="adhd-habit-meta">
                    {habit.frequency === "weekly" ? "This week" : "Today"}
                    {words ? ` · ${words}` : ""}
                  </span>
                  <span className="adhd-dots" aria-hidden="true">
                    {habit.dots.map((on, index) => (
                      <i key={index} className={on ? "is-on" : ""} />
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="adhd-card adhd-tasks-add">
        <AddBar placeholder="A new little habit" onAdd={add}>
          <Chips options={HOW_OFTEN} value={often} onChange={setOften} label="How often" size="sm" />
        </AddBar>
      </div>

      <Sheet open={Boolean(selected)} onClose={() => setOpenId(null)} label={selected?.title || "Habit"}>
        {selected ? (
          <div className="adhd-task-sheet">
            <h2 className="adhd-sheet-title adhd-sheet-task">{selected.title}</h2>
            <p className="adhd-sheet-meta">{streakWords(selected.streak, selected.frequency) || "Every tick counts."}</p>
            <div className="adhd-sheet-section">
              <p className="adhd-eyebrow">How often</p>
              <Chips options={HOW_OFTEN} value={selected.frequency} onChange={(value) => change(selected, value)} label="How often" />
            </div>
            <DeleteTwice label="Delete habit" confirm="Tap again — its history goes too" onDelete={() => remove(selected)} />
          </div>
        ) : null}
      </Sheet>

      <Toast message={toast?.message} />
      {party ? <Confetti key={party} /> : null}
    </AdhdPage>
  );
}

/** A delete that asks once more in place, instead of a pop-up. */
function DeleteTwice({ label, confirm, onDelete }) {
  const [armed, setArmed] = useState(false);
  return (
    <button type="button" className={`adhd-link adhd-link-center adhd-danger${armed ? " is-armed" : ""}`} onClick={() => (armed ? onDelete() : setArmed(true))}>
      {armed ? confirm : label}
    </button>
  );
}

export default AdhdHabits;
