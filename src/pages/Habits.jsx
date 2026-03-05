import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";
import { buildHabitMetadata, getHabitStreakSnapshot, getLastDateKeys, toDateKey } from "../utils/streaks";

const FILTER_OPTIONS = [
  ["all", "All"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
];

const normalizeHabit = (raw) => ({
  ...raw,
  frequency: raw.frequency || "daily",
  logs: raw.logs || {},
  streakMeta: raw.streakMeta || null,
  createdAt: raw.createdAt || new Date(),
});

const isCompletedOn = (habit, dateKey) => Boolean(habit.logs?.[dateKey]);

const getCompletionRate = (habit, todayKey, days = 30) => {
  const keys = getLastDateKeys(days, new Date(`${todayKey}T00:00:00`));
  const completed = keys.filter((key) => isCompletedOn(habit, key)).length;
  return Math.round((completed / days) * 100);
};

const getWeekDots = (habit, todayKey) => {
  const keys = getLastDateKeys(7, new Date(`${todayKey}T00:00:00`));
  return keys.map((key) => isCompletedOn(habit, key));
};

const getTenDayTrend = (habit, todayKey) => {
  const keys = getLastDateKeys(10, new Date(`${todayKey}T00:00:00`));
  return keys.map((key) => isCompletedOn(habit, key));
};

const getMonthDays = (baseDate) => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    cells.push(toDateKey(date));
  }

  return cells;
};

function Habits() {
  const [habits, setHabits] = useState([]);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [filter, setFilter] = useState("all");

  const user = auth.currentUser;
  const todayKey = toDateKey(new Date());

  const refreshHabits = async () => {
    if (!user) return;

    const snapshot = await getDocs(collection(db, "users", user.uid, "habits"));
    const list = snapshot.docs.map((habitDoc) =>
      normalizeHabit({
        id: habitDoc.id,
        ...habitDoc.data(),
      })
    );

    setHabits(list);
  };

  const addHabit = async () => {
    if (!title.trim() || !user) return;

    const habit = {
      title: title.trim(),
      frequency,
      logs: {},
      createdAt: new Date(),
    };

    await addDoc(collection(db, "users", user.uid, "habits"), {
      ...habit,
      streakMeta: buildHabitMetadata(habit),
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

    const nextHabit = { ...habit, logs: nextLogs };
    await updateDoc(doc(db, "users", user.uid, "habits", habit.id), {
      logs: nextLogs,
      streakMeta: buildHabitMetadata(nextHabit),
    });

    refreshHabits();
  };

  const removeHabit = async (habitId) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "habits", habitId));
    refreshHabits();
  };

  useEffect(() => {
    if (!user) return;

    getDocs(collection(db, "users", user.uid, "habits")).then((snapshot) => {
      const list = snapshot.docs.map((habitDoc) =>
        normalizeHabit({
          id: habitDoc.id,
          ...habitDoc.data(),
        })
      );

      setHabits(list);
    });
  }, [user]);

  const visibleHabits = useMemo(() => {
    return habits.filter((habit) => {
      if (filter === "all") return true;
      return habit.frequency === filter;
    });
  }, [filter, habits]);

  const enrichedHabits = useMemo(
    () =>
      visibleHabits.map((habit) => {
        const snapshot = getHabitStreakSnapshot(habit);
        const streakMeta = buildHabitMetadata(habit);
        const completionRate = getCompletionRate(habit, todayKey, 30);
        const weekDots = getWeekDots(habit, todayKey);
        const trend10 = getTenDayTrend(habit, todayKey);
        const completedToday = isCompletedOn(habit, todayKey);

        return {
          ...habit,
          streak: snapshot.currentStreak,
          completionRate,
          weekDots,
          trend10,
          completedToday,
          streakMeta,
        };
      }),
    [todayKey, visibleHabits]
  );

  const monthCells = useMemo(() => getMonthDays(new Date()), []);

  const monthlyProgress = useMemo(() => {
    const monthKeys = monthCells.filter(Boolean);
    if (!monthKeys.length) return 0;

    const completeDays = monthKeys.filter((key) =>
      enrichedHabits.some((habit) => isCompletedOn(habit, key))
    ).length;

    return Math.round((completeDays / monthKeys.length) * 100);
  }, [enrichedHabits, monthCells]);

  return (
    <section className="habits-page">
      <header className="habits-header glass-panel">
        <h2>Habit Tracker</h2>
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

        <button onClick={addHabit}>Add</button>
      </div>

      <div className="habits-grid">
        <section className="today-panel glass-panel">
          <h3>Today&apos;s Habits</h3>

          <div className="today-list">
            {enrichedHabits.map((habit) => (
              <article
                key={habit.id}
                className={`today-card state-${habit.streakMeta.streakState} ${habit.completedToday ? "today-done" : ""}`}
              >
                <div className="today-main">
                  <button
                    className={`habit-checkbox ${habit.completedToday ? "checked" : ""}`}
                    onClick={() => toggleToday(habit)}
                  >
                    {habit.completedToday ? "✓" : ""}
                  </button>

                  <div>
                    <p>{habit.title}</p>
                    <small>
                      {habit.frequency} • streak {habit.streakMeta.currentStreak} • best {habit.streakMeta.bestStreak}
                    </small>
                    <small>
                      freeze {habit.streakMeta.freezesLeft}/{habit.streakMeta.freezeAllowance} • {habit.streakMeta.streakState}
                    </small>
                  </div>
                </div>

                <div className="today-meta">
                  <span>{habit.completionRate}%</span>
                  <div className="week-dots" aria-hidden>
                    {habit.weekDots.map((done, index) => (
                      <span key={`${habit.id}-w-${index}`} className={done ? "dot-filled" : "dot-empty"} />
                    ))}
                  </div>
                  <button className="habit-delete" onClick={() => removeHabit(habit.id)}>
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
                    <small>
                      {habit.streakMeta.currentWindowLabel} • {habit.streakMeta.missedWindows} miss window(s)
                    </small>
                    <small>
                      Milestones: {habit.streakMeta.milestoneHistory.map((entry) => entry.milestone).join(", ") || "none"}
                    </small>
                  </div>
                  <div className="analytics-trend">
                    <div className="trend-dots" aria-hidden>
                      {habit.trend10.map((done, index) => (
                        <span key={`${habit.id}-t-${index}`} className={done ? "dot-filled" : "dot-empty"} />
                      ))}
                    </div>
                    <strong>{habit.streakMeta.nextMilestone ? `${habit.streakMeta.nextMilestone - habit.streakMeta.currentStreak} left` : "Max"}</strong>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="month-panel glass-panel">
            <div className="month-header">
              <h3>
                {new Date().toLocaleDateString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </h3>
              <strong>{monthlyProgress}%</strong>
            </div>

            <div className="month-weekdays">
              {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>

            <div className="month-grid" aria-hidden>
              {monthCells.map((dateKey, index) => {
                if (!dateKey) {
                  return <span key={`empty-${index}`} className="month-cell month-empty" />;
                }

                const completed = enrichedHabits.some((habit) => isCompletedOn(habit, dateKey));
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
