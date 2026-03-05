import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";
import { toDateKey } from "../utils/streaks";

const FILTER_OPTIONS = [
  ["all", "All"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["completed", "Completed"],
  ["pending", "Pending"],
];

const normalizeHabit = (raw) => ({
  ...raw,
  frequency: raw.frequency || "daily",
  logs: raw.logs || {},
  createdAt: raw.createdAt || new Date(),
});

const isCompletedOn = (habit, dateKey) => Boolean(habit.logs?.[dateKey]);

function Habits() {
  const [habits, setHabits] = useState([]);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [filter, setFilter] = useState("all");

  const user = auth.currentUser;
  const todayKey = toDateKey(new Date());

  const refreshHabits = useCallback(async () => {
    if (!user) return;

    const snapshot = await getDocs(collection(db, "users", user.uid, "habits"));
    const list = snapshot.docs.map((habitDoc) =>
      normalizeHabit({
        id: habitDoc.id,
        ...habitDoc.data(),
      })
    );

    setHabits(list);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const timer = setTimeout(() => {
      refreshHabits();
    }, 0);

    return () => clearTimeout(timer);
  }, [refreshHabits, user]);

  const addHabit = async () => {
    if (!title.trim() || !user) return;

    await addDoc(collection(db, "users", user.uid, "habits"), {
      title: title.trim(),
      frequency,
      logs: {},
      createdAt: new Date(),
    });

    setTitle("");
    setFrequency("daily");
    refreshHabits();
  };

  const toggleToday = async (habit) => {
    if (!user) return;

    const nextLogs = { ...(habit.logs || {}) };
    if (nextLogs[todayKey]) {
      delete nextLogs[todayKey];
    } else {
      nextLogs[todayKey] = true;
    }

    await updateDoc(doc(db, "users", user.uid, "habits", habit.id), {
      logs: nextLogs,
    });

    refreshHabits();
  };

  const removeHabit = async (habitId) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "habits", habitId));
    refreshHabits();
  };

  const visibleHabits = useMemo(() => {
    return habits.filter((habit) => {
      const completedToday = isCompletedOn(habit, todayKey);

      if (filter === "all") return true;
      if (filter === "completed") return completedToday;
      if (filter === "pending") return !completedToday;
      return habit.frequency === filter;
    });
  }, [filter, habits, todayKey]);

  const summary = useMemo(() => {
    const total = habits.length;
    const completed = habits.filter((habit) => isCompletedOn(habit, todayKey)).length;
    const pending = total - completed;

    return { total, completed, pending };
  }, [habits, todayKey]);

  return (
    <section className="habits-page">
      <header className="habits-header glass-panel">
        <h2>Habits</h2>
        <div className="habits-filter-group">
          {FILTER_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              className={`habit-filter-pill ${filter === value ? "active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="habits-add-bar glass-panel">
        <input
          placeholder="Enter new habit..."
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />

        <select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>

        <button onClick={addHabit}>Add Habit</button>
      </div>

      <section className="glass-panel" style={{ marginBottom: "16px", display: "flex", gap: "16px" }}>
        <p>Total: <strong>{summary.total}</strong></p>
        <p>Done Today: <strong>{summary.completed}</strong></p>
        <p>Pending: <strong>{summary.pending}</strong></p>
      </section>

      <section className="today-panel glass-panel">
        <h3>Habit List</h3>
        <div className="today-list">
          {visibleHabits.length === 0 ? (
            <p className="text-muted">No habits found for this filter.</p>
          ) : (
            visibleHabits.map((habit) => {
              const completedToday = isCompletedOn(habit, todayKey);

              return (
                <article key={habit.id} className={`today-card ${completedToday ? "today-done" : ""}`}>
                  <div className="today-main">
                    <button
                      className={`habit-checkbox ${completedToday ? "checked" : ""}`}
                      onClick={() => toggleToday(habit)}
                      aria-label={`Toggle ${habit.title}`}
                    >
                      {completedToday ? "✓" : ""}
                    </button>

                    <div>
                      <p>{habit.title}</p>
                      <small>{habit.frequency}</small>
                    </div>
                  </div>

                  <div className="today-meta">
                    <button className="habit-delete" onClick={() => removeHabit(habit.id)}>
                      ×
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </section>
  );
}

export default Habits;
