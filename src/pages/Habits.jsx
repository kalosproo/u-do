import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";

const FILTER_OPTIONS = [
  ["all", "All"],
  ["daily", "Daily"],
  ["weekly", "Weekly"],
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
  ...raw,
  frequency: raw.frequency || "daily",
  logs: raw.logs || {},
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
  const [habitType, setHabitType] = useState("strict");
  const [reminderTime, setReminderTime] = useState("");

  const user = auth.currentUser;
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);
  const yesterdayKey = useMemo(() => {
    const previous = new Date(today);
    previous.setDate(today.getDate() - 1);
    return toDateKey(previous);
  }, [today]);

  const refreshHabits = useCallback(async () => {
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
      type: habitType,
      reminderTime: reminderTime || null,
      streak: 0,
      completedDays: {},
      createdAt: new Date(),
    });

    setTitle("");
    setReminderTime("");
    setHabitType("strict");
    fetchHabits();
  };

  const toggleHabitForToday = async (habit, day) => {
    if (!user || day !== today) return;

    const completedDays = { ...(habit.completedDays || {}) };
    const alreadyDone = completedDays[day] === true;
    let newStreak = Number(habit.streak || 0);

    if (alreadyDone) {
      delete completedDays[day];
      newStreak = Math.max(newStreak - 1, 0);
    } else {
      completedDays[day] = true;

      if (habit.type === "strict") {
        const yesterday = new Date(day);
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = getDateKey(yesterday);
        newStreak = habit.completedDays?.[yKey] ? newStreak + 1 : 1;
      } else {
        newStreak = Object.keys(completedDays).length;
      }
    }

    await updateDoc(doc(db, "users", user.uid, "habits", habit.id), {
      logs: nextLogs,
    });

    fetchHabits();
  };

  const deleteHabitItem = async (habitId) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "habits", habitId));
    fetchHabits();
  };

  const visibleHabits = useMemo(() => {
    return habits.filter((habit) => (filter === "all" ? true : habit.frequency === filter));
  }, [filter, habits]);

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

      <table>
        <thead>
          <tr>
            <th>Habit</th>
            {days.map((day) => (
              <th key={day}>{day.slice(8)}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {habits.map((habit) => (
            <tr
              key={habit.id}
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.05)",
                height: "44px",
                backgroundColor: isReminderMissed(habit) ? "rgba(255, 0, 0, 0.08)" : "transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="habits-add-bar glass-panel">
        <input
          placeholder="Enter habit name..."
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
                className={`today-card ${habit.completedToday ? "today-done" : ""} ${
                  !habit.completedToday && habit.missedYesterday ? "today-muted" : ""
                }`}
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
                    <small>Streak: {habit.streak} day{habit.streak === 1 ? "" : "s"}</small>
                    <small>Completion: {habit.completionRate}%</small>
                    <div className="week-dots" aria-hidden>
                      {habit.weekDots.map((done, index) => (
                        <span key={`${habit.id}-w-${index}`} className={done ? "dot-filled" : "dot-empty"} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="today-meta">
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
                    <small>Streak: {habit.streak} days</small>
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
              {["S", "M", "T", "W", "T", "F", "S"].map((day) => (
                <span key={day}>{day}</span>
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
