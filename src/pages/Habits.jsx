import { useCallback, useEffect, useMemo, useState } from "react";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { fromDateKey, toDateKey } from "../utils/dateKeys";
import { clearHabits, createHabit, deleteHabit, fetchHabits, setHabitLogs } from "../services/habits";
import ClearDataButton from "../components/ClearDataButton";
import { Link } from "react-router-dom";
import FriendStreaks from "../components/FriendStreaks";
import PageMenu, { PageMenuLabel } from "../components/PageMenu";
import {
  getHabitStreakSnapshot,
  getRecentWindowKeys,
  getWindowKeyForDate,
} from "../utils/streaks";

const FILTER_OPTIONS = [
  ["all", "All"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
];

// How far back the completion rate looks, counted in windows for that frequency.
const RATE_WINDOW_COUNT = { daily: 30, weekly: 12 };

const STATE_LABEL = {
  onTrack: "On track",
  grace: "Due",
  frozen: "Freeze used",
  broken: "Broken",
  recovery: "Recoverable",
};

const getMonthCells = (baseDate) => {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(toDateKey(new Date(year, month, day)));

  return cells;
};

const isCompletedOn = (habit, dateKey) => Boolean(habit.logs?.[dateKey]);

// Collapse every ticked date into the window it belongs to: the day itself for
// daily habits, the ISO week for weekly ones.
const getCompletedWindows = (habit, frequency) => {
  const completed = new Set();

  Object.entries(habit.logs || {}).forEach(([dateKey, done]) => {
    if (!done) return;
    completed.add(getWindowKeyForDate(fromDateKey(dateKey), frequency));
  });

  return completed;
};

const getCompletionRate = (completedWindows, frequency, today) => {
  const count = RATE_WINDOW_COUNT[frequency] || RATE_WINDOW_COUNT.daily;
  const done = getRecentWindowKeys(frequency, count, today).filter((key) =>
    completedWindows.has(key)
  ).length;

  return Math.round((done / count) * 100);
};

function Habits() {
  const { user } = useAuth();
  const requireUser = useAuthGuard();

  const [habits, setHabits] = useState([]);
  const [title, setTitle] = useState("");
  const [frequency, setFrequency] = useState("daily");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);

  const loadHabits = useCallback(async () => {
    if (!user) return;
    setHabits(await fetchHabits(user));
  }, [user]);

  // Deferred a tick: loading sets state, and React warns about doing that
  // synchronously inside an effect. Every page in the app loads this way.
  useEffect(() => {
    const timer = setTimeout(loadHabits, 0);
    return () => clearTimeout(timer);
  }, [loadHabits]);

  const addHabit = async () => {
    const currentUser = requireUser();
    if (!currentUser || !title.trim()) return;

    try {
      await createHabit(currentUser.uid, { title: title.trim(), frequency });
      setTitle("");
      setFrequency("daily");
      setError("");
      loadHabits();
    } catch (addError) {
      setError(addError?.message || "Couldn't add that habit.");
    }
  };

  const toggleCurrentWindow = async (habit) => {
    const currentUser = requireUser();
    if (!currentUser) return;

    const habitFrequency = habit.frequency || "daily";
    const windowKey = getWindowKeyForDate(today, habitFrequency);
    const nextLogs = { ...(habit.logs || {}) };

    const inCurrentWindow = (dateKey) =>
      getWindowKeyForDate(fromDateKey(dateKey), habitFrequency) === windowKey;

    const alreadyDone = Object.keys(nextLogs).some(
      (dateKey) => nextLogs[dateKey] && inCurrentWindow(dateKey)
    );

    if (alreadyDone) {
      // A weekly habit may have been ticked on any day of the week, so untick
      // clears the whole window rather than just today.
      Object.keys(nextLogs).forEach((dateKey) => {
        if (inCurrentWindow(dateKey)) delete nextLogs[dateKey];
      });
    } else {
      nextLogs[todayKey] = true;
    }

    try {
      await setHabitLogs(currentUser.uid, habit.id, nextLogs);
      setError("");
      loadHabits();
    } catch (toggleError) {
      setError(toggleError?.message || "Couldn't save that. Check your connection.");
    }
  };

  const removeHabit = async (habit) => {
    const currentUser = requireUser();
    if (!currentUser) return;
    if (!window.confirm(`Delete "${habit.title}"? Its history goes too.`)) return;

    try {
      await deleteHabit(currentUser.uid, habit.id);
      setError("");
      loadHabits();
    } catch (removeError) {
      setError(removeError?.message || "Couldn't delete that habit.");
    }
  };

  const enrichedHabits = useMemo(
    () =>
      habits
        .filter((habit) => (filter === "all" ? true : habit.frequency === filter))
        .map((habit) => {
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
            bestStreak: snapshot.bestStreak,
            streakState: snapshot.streakState,
            completionRate: getCompletionRate(completedWindows, habitFrequency, today),
            weekDots: getRecentWindowKeys(habitFrequency, 7, today).map((key) =>
              completedWindows.has(key)
            ),
          };
        }),
    [filter, habits, today]
  );

  const monthCells = useMemo(() => getMonthCells(today), [today]);

  const summary = useMemo(() => {
    const doneNow = enrichedHabits.filter((habit) => habit.completedNow).length;
    const best = enrichedHabits.reduce((top, habit) => Math.max(top, habit.streak), 0);
    const average = enrichedHabits.length
      ? Math.round(
          enrichedHabits.reduce((total, habit) => total + habit.completionRate, 0) /
            enrichedHabits.length
        )
      : 0;

    return { doneNow, total: enrichedHabits.length, best, average };
  }, [enrichedHabits]);

  const monthlyProgress = useMemo(() => {
    const keys = monthCells.filter(Boolean).filter((key) => key <= todayKey);
    if (!keys.length) return 0;

    const complete = keys.filter((key) => habits.some((habit) => isCompletedOn(habit, key))).length;
    return Math.round((complete / keys.length) * 100);
  }, [habits, monthCells, todayKey]);

  return (
    <section className="habits-page">
      <header className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-title">Habits</h1>
            <p className="page-sub">
              {summary.doneNow} of {summary.total} done this window
            </p>
          </div>

          <PageMenu label="Habit actions">
            <PageMenuLabel>Danger zone</PageMenuLabel>
            <ClearDataButton
              label="Clear habits"
              noun="habits"
              count={habits.length}
              clear={clearHabits}
              onCleared={loadHabits}
            />
          </PageMenu>
        </div>

        <div className="habits-filter-group">
          {FILTER_OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`chip ${filter === value ? "active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="page-error">{error}</p> : null}

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Done now</span>
          <strong className="stat-value">
            {summary.doneNow}/{summary.total}
          </strong>
        </div>
        <div className="stat">
          <span className="stat-label">Longest streak</span>
          <strong className="stat-value">{summary.best}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">Average consistency</span>
          <strong className="stat-value">{summary.average}%</strong>
          <div className="bar">
            <span style={{ width: `${summary.average}%` }} />
          </div>
        </div>
        <div className="stat">
          <span className="stat-label">Month so far</span>
          <strong className="stat-value">{monthlyProgress}%</strong>
          <span className="stat-note">Days with any habit done</span>
        </div>
      </div>

      <div className="panel">
        <div className="habits-add-bar">
          <input
            placeholder="New habit — read, gym, no sugar…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addHabit();
            }}
          />
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} aria-label="Frequency">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
          <button type="button" className="btn btn-primary" onClick={addHabit}>
            <FiPlus /> Add
          </button>
        </div>
      </div>

      <div className="habits-grid">
        <section className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Today</h3>
            <span className="panel-note">Tap the circle to log it</span>
          </div>

          <div className="today-list is-scrollable">
            {enrichedHabits.map((habit) => (
              <article key={habit.id} className={`habit-row ${habit.completedNow ? "is-done" : ""}`}>
                <button
                  type="button"
                  className={`habit-checkbox ${habit.completedNow ? "checked" : ""}`}
                  onClick={() => toggleCurrentWindow(habit)}
                  aria-label={`${habit.completedNow ? "Untick" : "Tick"} ${habit.title}`}
                >
                  ✓
                </button>

                <div className="habit-body">
                  <span className="habit-name">{habit.title}</span>
                  <span className="habit-sub">
                    <span className={`state-${habit.streakState}`}>
                      {STATE_LABEL[habit.streakState] || habit.streakState}
                    </span>
                    · {habit.frequency} · {habit.completionRate}%
                  </span>
                </div>

                <div className="habit-side">
                  <div className="week-dots" aria-hidden>
                    {habit.weekDots.map((done, index) => (
                      <span
                        key={`${habit.id}-w-${index}`}
                        className={done ? "dot-filled" : "dot-empty"}
                      />
                    ))}
                  </div>

                  <span className={`streak-badge state-${habit.streakState}`}>
                    {habit.streak}
                    <small>{habit.unit}{habit.streak === 1 ? "" : "s"}</small>
                  </span>

                  <button
                    type="button"
                    className="habit-delete"
                    onClick={() => removeHabit(habit)}
                    aria-label={`Delete ${habit.title}`}
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </article>
            ))}

            {enrichedHabits.length === 0 ? (
              <p className="empty">
                {habits.length ? "No habits match this filter." : "No habits yet — add one above."}
              </p>
            ) : null}
          </div>
        </section>

        <section className="right-panel">
          <div className="panel">
            <div className="panel-head">
              <h3 className="panel-title">Consistency</h3>
              <span className="panel-note">
                {enrichedHabits[0]?.frequency === "weekly" ? "12 weeks" : "30 days"}
              </span>
            </div>

            <div className="analytics-list is-scrollable">
              {enrichedHabits.map((habit) => (
                <article key={`${habit.id}-analytics`} className="analytics-card">
                  <div>
                    <span className="habit-name">{habit.title}</span>
                    <div className="bar">
                      <span style={{ width: `${habit.completionRate}%` }} />
                    </div>
                  </div>
                  <div className="analytics-trend">
                    <strong>{habit.completionRate}%</strong>
                  </div>
                </article>
              ))}

              {enrichedHabits.length === 0 ? <p className="empty">Nothing to chart yet.</p> : null}
            </div>
          </div>

          <div className="panel">
            <div className="month-header">
              <h3 className="panel-title">
                {today.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </h3>
              <strong>{monthlyProgress}%</strong>
            </div>

            <div className="month-weekdays" aria-hidden>
              {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
                <span key={`${day}-${index}`}>{day}</span>
              ))}
            </div>

            <div className="month-grid" aria-hidden>
              {monthCells.map((dateKey, index) => {
                if (!dateKey) return <span key={`empty-${index}`} className="month-cell month-empty" />;

                const completed = habits.some((habit) => isCompletedOn(habit, dateKey));

                return (
                  <span
                    key={dateKey}
                    className={`month-cell ${completed ? "month-done" : ""} ${
                      dateKey === todayKey ? "month-today" : ""
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
      <article className="panel">
        <div className="panel-head">
          <h3 className="panel-title">Friends' streaks</h3>
          <Link to="/friends" className="panel-note panel-link">
            Manage
          </Link>
        </div>
        <FriendStreaks />
      </article>

    </section>
  );
}

export default Habits;
