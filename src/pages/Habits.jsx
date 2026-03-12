import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";

const FILTER_OPTIONS = [
  ["all", "All"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
];

const VIEW_OPTIONS = [
  ["balanced", "Balanced"],
  ["focus", "Focus"],
  ["analytics", "Analytics"],
  ["compact", "Compact"],
];

const toDateKey = (date) => date.toISOString().split("T")[0];

const getDateKeysBackward = (count, fromDate = new Date()) =>
  Array.from({ length: count }, (_, index) => {
    const d = new Date(fromDate);
    d.setDate(fromDate.getDate() - index);
    return toDateKey(d);
  });

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

const calculateStreak = (habit, today = new Date()) => {
  let streak = 0;
  const cursor = new Date(today);

  while (true) {
    const key = toDateKey(cursor);
    if (!habit.logs?.[key]) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};

const completionRate30 = (habit, today = new Date()) => {
  const keys = getDateKeysBackward(30, today);
  const done = keys.filter((key) => habit.logs?.[key]).length;
  return Math.round((done / 30) * 100);
};

function Habits() {
  const [habits, setHabits] = useState([]);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [filter, setFilter] = useState("all");
  const [viewMode, setViewMode] = useState("balanced");

  const user = auth.currentUser;
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const yesterdayKey = useMemo(() => {
    const previous = new Date(today);
    previous.setDate(today.getDate() - 1);
    return toDateKey(previous);
  }, [today]);

  const fetchHabits = useCallback(async () => {
    if (!user) return;

    try {
      const snapshot = await getDocs(collection(db, "users", user.uid, "habits"));
      const list = snapshot.docs.map((item) => normalizeHabit({ id: item.id, ...item.data() }));
      setHabits(list);
      localStorage.setItem("u_do_habits", JSON.stringify(list));
    } catch {
      const local = localStorage.getItem("u_do_habits");
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
    if (!title.trim() || !user) return;

    await addDoc(collection(db, "users", user.uid, "habits"), {
      title: title.trim(),
      frequency,
      createdAt: new Date(),
      logs: {},
    });

    setTitle("");
    setFrequency("daily");
    fetchHabits();
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

    fetchHabits();
  };

  const removeHabit = async (habitId) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "habits", habitId));
    fetchHabits();
  };

  const visibleHabits = useMemo(
    () => habits.filter((habit) => (filter === "all" ? true : habit.frequency === filter)),
    [filter, habits]
  );

  const enrichedHabits = useMemo(
    () =>
      visibleHabits.map((habit) => ({
        ...habit,
        completedToday: isCompletedOn(habit, todayKey),
        missedYesterday: !isCompletedOn(habit, yesterdayKey),
        streak: calculateStreak(habit, today),
        completionRate: completionRate30(habit, today),
        weekDots: getDateKeysBackward(7, today).reverse().map((key) => isCompletedOn(habit, key)),
        trend10: getDateKeysBackward(10, today).reverse().map((key) => isCompletedOn(habit, key)),
      })),
    [today, todayKey, visibleHabits, yesterdayKey]
  );

  const monthCells = useMemo(() => getMonthCells(today), [today]);

  const monthlyProgress = useMemo(() => {
    const keys = monthCells.filter(Boolean);
    if (!keys.length) return 0;

    const completeDays = keys.filter((key) => habits.some((habit) => isCompletedOn(habit, key))).length;
    return Math.round((completeDays / keys.length) * 100);
  }, [habits, monthCells]);

  const summary = useMemo(() => {
    const total = enrichedHabits.length;
    const doneToday = enrichedHabits.filter((habit) => habit.completedToday).length;
    const consistency = total ? Math.round((doneToday / total) * 100) : 0;
    const strongestStreak = enrichedHabits.reduce((best, habit) => Math.max(best, habit.streak), 0);
    const avgCompletion =
      total > 0
        ? Math.round(
            enrichedHabits.reduce((sum, habit) => sum + habit.completionRate, 0) / total
          )
        : 0;

    return {
      total,
      doneToday,
      consistency,
      strongestStreak,
      avgCompletion,
    };
  }, [enrichedHabits]);

  const topHabits = useMemo(
    () => [...enrichedHabits].sort((a, b) => b.completionRate - a.completionRate).slice(0, 3),
    [enrichedHabits]
  );

  return (
    <section className={`habits-page habits-view-${viewMode}`}>
      <header className="habits-hero glass-panel">
        <div>
          <p className="habits-overline">Habit OS</p>
          <h2>Upgrade your habit engine</h2>
          <p className="habits-subtitle">Plan, execute, and analyze your daily system with flexible layouts.</p>
        </div>
        <div className="habits-summary-strip" aria-label="Habit summary">
          <article className="habit-kpi-card">
            <span>Today</span>
            <strong>
              {summary.doneToday}/{summary.total}
            </strong>
          </article>
          <article className="habit-kpi-card">
            <span>Consistency</span>
            <strong>{summary.consistency}%</strong>
          </article>
          <article className="habit-kpi-card">
            <span>Top Streak</span>
            <strong>{summary.strongestStreak}d</strong>
          </article>
          <article className="habit-kpi-card">
            <span>30d Avg</span>
            <strong>{summary.avgCompletion}%</strong>
          </article>
        </div>
      </header>

      <div className="habits-toolbar glass-panel">
        <div className="habits-filter-group" role="tablist" aria-label="Habit filter">
          {FILTER_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`habit-filter-pill ${filter === value ? "active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="habits-filter-group" role="tablist" aria-label="Layout options">
          {VIEW_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`habit-filter-pill ${viewMode === value ? "active" : ""}`}
              onClick={() => setViewMode(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="habits-add-bar glass-panel">
        <input
          placeholder="Create a new habit"
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

        <button type="button" onClick={addHabit}>
          Add habit
        </button>
      </div>

      <div className="habits-grid">
        <section className="today-panel glass-panel">
          <div className="panel-title-row">
            <h3>Execution board</h3>
            <small>{enrichedHabits.length} active</small>
          </div>
          <div className="today-list">
            {enrichedHabits.map((habit) => (
              <article
                key={habit.id}
                className={`today-card ${habit.completedToday ? "today-done" : ""} ${
                  !habit.completedToday && habit.missedYesterday ? "today-muted" : ""
                }`}
              >
                <div className="today-main">
                  <button
                    type="button"
                    className={`habit-checkbox ${habit.completedToday ? "checked" : ""}`}
                    onClick={() => toggleToday(habit)}
                  >
                    {habit.completedToday ? "✓" : ""}
                  </button>

                  <div>
                    <p>{habit.title}</p>
                    <small>
                      {habit.frequency} • streak {habit.streak} day{habit.streak === 1 ? "" : "s"}
                    </small>
                    <div className="week-dots" aria-hidden>
                      {habit.weekDots.map((done, index) => (
                        <span key={`${habit.id}-w-${index}`} className={done ? "dot-filled" : "dot-empty"} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="today-meta">
                  <strong>{habit.completionRate}%</strong>
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
            <div className="panel-title-row">
              <h3>Insights</h3>
              <small>Top performers</small>
            </div>

            <div className="top-habits-row">
              {topHabits.map((habit) => (
                <article key={`${habit.id}-top`} className="top-habit-chip">
                  <p>{habit.title}</p>
                  <strong>{habit.completionRate}%</strong>
                </article>
              ))}
            </div>

            <div className="analytics-list">
              {enrichedHabits.map((habit) => (
                <article key={`${habit.id}-analytics`} className="analytics-card">
                  <div>
                    <p>{habit.title}</p>
                    <small>Streak: {habit.streak} day{habit.streak === 1 ? "" : "s"}</small>
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
