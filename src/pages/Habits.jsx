import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../services/firebase";
import { publishHabitSummary } from "../services/friends";
import {
  getHabitStreakSnapshot,
  getRecentWindowKeys,
  getWindowKeyForDate,
  toDateKey,
} from "../utils/streaks";

const FILTER_OPTIONS = [
  ["all", "All"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
];

// How far back the completion rate looks, counted in windows for that frequency.
const RATE_WINDOW_COUNT = { daily: 30, weekly: 12 };

const habitsCacheKey = (uid) => `u_do_habits_${uid}`;

const getMonthCells = (baseDate) => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toDateKey(new Date(year, month, day)));
  }

  return cells;
};

const normalizeHabit = (raw) => ({
  id: raw.id,
  title: raw.title || "Untitled",
  frequency: raw.frequency || raw.type || "daily",
  logs: raw.logs || raw.completedDays || {},
  createdAt: raw.createdAt || new Date(),
});

const isCompletedOn = (habit, dateKey) => Boolean(habit.logs?.[dateKey]);

// Collapse every ticked date into the window it belongs to: the day itself for
// daily habits, the ISO week for weekly ones.
const getCompletedWindows = (habit, frequency) => {
  const completed = new Set();

  Object.entries(habit.logs || {}).forEach(([dateKey, done]) => {
    if (!done) return;
    completed.add(getWindowKeyForDate(new Date(`${dateKey}T00:00:00`), frequency));
  });

  return completed;
};

const getCompletionRate = (completedWindows, frequency, today) => {
  const count = RATE_WINDOW_COUNT[frequency] || RATE_WINDOW_COUNT.daily;
  const done = getRecentWindowKeys(frequency, count, today).filter((key) => completedWindows.has(key)).length;
  return Math.round((done / count) * 100);
};

function Habits() {
  const [habits, setHabits] = useState([]);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [filter, setFilter] = useState("all");

  const user = auth.currentUser;
  const navigate = useNavigate();
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);

  const fetchHabits = useCallback(async () => {
    if (!user) return;

    const cacheKey = habitsCacheKey(user.uid);

    try {
      const snapshot = await getDocs(collection(db, "users", user.uid, "habits"));
      const list = snapshot.docs.map((item) => normalizeHabit({ id: item.id, ...item.data() }));
      setHabits(list);
      localStorage.setItem(cacheKey, JSON.stringify(list));

      // Refresh what friends see. Best-effort: a failure here must never stop
      // you ticking a habit, and it no-ops for accounts without a username.
      publishHabitSummary(user, list).catch(() => {});
    } catch {
      const local = localStorage.getItem(cacheKey);
      setHabits(local ? JSON.parse(local) : []);
    }
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchHabits();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchHabits]);

  const addHabit = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");
    if (!title.trim()) return;

    await addDoc(collection(db, "users", currentUser.uid, "habits"), {
      title: title.trim(),
      frequency,
      createdAt: new Date(),
      logs: {},
    });

    setTitle("");
    setFrequency("daily");
    fetchHabits();
  };

  const toggleCurrentWindow = async (habit) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");

    const habitFrequency = habit.frequency || "daily";
    const windowKey = getWindowKeyForDate(today, habitFrequency);
    const nextLogs = { ...(habit.logs || {}) };

    const inCurrentWindow = (dateKey) =>
      getWindowKeyForDate(new Date(`${dateKey}T00:00:00`), habitFrequency) === windowKey;

    const alreadyDone = Object.keys(nextLogs).some((dateKey) => nextLogs[dateKey] && inCurrentWindow(dateKey));

    if (alreadyDone) {
      // A weekly habit may have been ticked on any day of the week, so untick
      // clears the whole window rather than just today.
      Object.keys(nextLogs).forEach((dateKey) => {
        if (inCurrentWindow(dateKey)) delete nextLogs[dateKey];
      });
    } else {
      nextLogs[todayKey] = true;
    }

    await updateDoc(doc(db, "users", currentUser.uid, "habits", habit.id), {
      logs: nextLogs,
    });

    fetchHabits();
  };

  const removeHabit = async (habitId) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");
    await deleteDoc(doc(db, "users", currentUser.uid, "habits", habitId));
    fetchHabits();
  };

  const visibleHabits = useMemo(
    () => habits.filter((habit) => (filter === "all" ? true : habit.frequency === filter)),
    [filter, habits]
  );

  const enrichedHabits = useMemo(
    () =>
      visibleHabits.map((habit) => {
        const habitFrequency = habit.frequency || "daily";
        const completedWindows = getCompletedWindows(habit, habitFrequency);
        const snapshot = getHabitStreakSnapshot(habit, today);
        const [previousWindow, currentWindow] = getRecentWindowKeys(habitFrequency, 2, today);

        return {
          ...habit,
          frequency: habitFrequency,
          unit: habitFrequency === "weekly" ? "week" : "day",
          completedNow: completedWindows.has(currentWindow),
          missedPrevious: !completedWindows.has(previousWindow),
          streak: snapshot.currentStreak,
          completionRate: getCompletionRate(completedWindows, habitFrequency, today),
          weekDots: getRecentWindowKeys(habitFrequency, 7, today).map((key) => completedWindows.has(key)),
          trend10: getRecentWindowKeys(habitFrequency, 10, today).map((key) => completedWindows.has(key)),
        };
      }),
    [today, visibleHabits]
  );

  const monthCells = useMemo(() => getMonthCells(today), [today]);

  const monthlyProgress = useMemo(() => {
    const keys = monthCells.filter(Boolean);
    if (!keys.length) return 0;

    const completeDays = keys.filter((key) => habits.some((habit) => isCompletedOn(habit, key))).length;
    return Math.round((completeDays / keys.length) * 100);
  }, [habits, monthCells]);

  return (
    <section className="habits-page">
      <header className="habits-header glass-panel">
        <h2>Habit Tracker</h2>
        <div className="habits-filter-group" role="tablist" aria-label="Habit filter">
          {FILTER_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`habit-filter-pill button-secondary ${filter === value ? "active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="habits-add-bar glass-panel">
        <input
          placeholder="Habit name"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addHabit();
          }}
        />

        <select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>

        <button type="button" className="button-primary" onClick={addHabit}>
          Add
        </button>
      </div>

      <div className="habits-grid">
        <section className="today-panel glass-panel">
          <h3>Today&apos;s Habits</h3>
          <div className="today-list">
            {enrichedHabits.map((habit) => (
              <article
                key={habit.id}
                className={`today-card ${habit.completedNow ? "today-done" : ""} ${
                  !habit.completedNow && habit.missedPrevious ? "today-muted" : ""
                }`}
              >
                <div className="today-main">
                  <button
                    type="button"
                    className={`habit-checkbox ${habit.completedNow ? "checked" : ""}`}
                    onClick={() => toggleCurrentWindow(habit)}
                  >
                    {habit.completedNow ? "✓" : ""}
                  </button>

                  <div>
                    <p>{habit.title}</p>
                    <small>Streak: {habit.streak} {habit.unit}{habit.streak === 1 ? "" : "s"}</small>
                    <small>Completion: {habit.completionRate}%</small>
                    <div className="week-dots" aria-hidden>
                      {habit.weekDots.map((done, index) => (
                        <span key={`${habit.id}-w-${index}`} className={done ? "dot-filled" : "dot-empty"} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="today-meta">
                  <button type="button" className="habit-delete" onClick={() => removeHabit(habit.id)}>
                    ×
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="right-panel">
          <div className="analytics-panel glass-panel">
            <h3>Habit Analytics</h3>
            <div className="analytics-list">
              {enrichedHabits.map((habit) => (
                <article key={`${habit.id}-analytics`} className="analytics-card">
                  <div>
                    <p>{habit.title}</p>
                    <small>Streak: {habit.streak} {habit.unit}{habit.streak === 1 ? "" : "s"}</small>
                    <div className="trend-dots" aria-hidden>
                      {habit.trend10.map((done, index) => (
                        <span key={`${habit.id}-t-${index}`} className={done ? "dot-filled" : "dot-empty"} />
                      ))}
                    </div>
                  </div>

                  <div className="analytics-trend">
                    <strong>{habit.completionRate}%</strong>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="month-panel glass-panel">
            <div className="month-header">
              <h3>
                {today.toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <strong>{monthlyProgress}%</strong>
            </div>

            <div className="month-weekdays">
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <span key={`${day}-${index}`}>{day}</span>
              ))}
            </div>

            <div className="month-grid" aria-hidden>
              {monthCells.map((dateKey, index) => {
                if (!dateKey) {
                  return <span key={`empty-${index}`} className="month-cell month-empty" />;
                }

                const completed = habits.some((habit) => isCompletedOn(habit, dateKey));
                const isToday = dateKey === todayKey;

                return (
                  <span
                    key={dateKey}
                    className={`month-cell ${completed ? "month-done" : "month-missed"} ${
                      isToday ? "month-today" : ""
                    }`}
                  >
                    {Number(dateKey.slice(8))}
                  </span>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

export default Habits;
