import { useCallback, useEffect, useMemo, useState } from "react";
import { getDocs } from "firebase/firestore";
import { useAuth } from "../hooks/useAuth";
import { fromDateKey, todayKey as getTodayKey } from "../utils/dateKeys";
import { workspaceCollection } from "../services/paths";
import {
  buildHabitMetadata,
  getRecentWindowKeys,
  isHabitCompletedInWindow,
} from "../utils/streaks";

function Home() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(() => Boolean(user));
  const [tasks, setTasks] = useState([]);
  const [plans, setPlans] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [habits, setHabits] = useState([]);
  const [error, setError] = useState("");

  const todayKey = getTodayKey();

  const loadDashboard = useCallback(async () => {
    if (!user) return;

    const read = async (name) =>
      (await getDocs(workspaceCollection(user.uid, name))).docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

    try {
      const [nextTasks, nextPlans, nextExpenses, nextHabits] = await Promise.all([
        read("tasks"),
        read("planner"),
        read("expenses"),
        read("habits"),
      ]);

      setTasks(nextTasks);
      setPlans(nextPlans);
      setExpenses(nextExpenses);
      setHabits(nextHabits);
      setError("");
    } catch (loadError) {
      // Without this the dashboard used to sit on zeros with nothing said.
      setError(loadError?.message || "Couldn't load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Deferred a tick: loading sets state, and React warns about doing that
  // synchronously inside an effect. Every page in the app loads this way.
  useEffect(() => {
    const timer = setTimeout(loadDashboard, 0);
    return () => clearTimeout(timer);
  }, [loadDashboard]);

  const summary = useMemo(() => {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task) => task.status === "done" || task.completed).length;
    const pendingTasks = totalTasks - completedTasks;
    const todayPlans = plans.filter((plan) => plan.date === todayKey).length;

    const todayAmount = expenses
      .filter((expense) => expense.date === todayKey)
      .reduce((sum, expense) => sum + (expense.type === "income" ? expense.amount : -expense.amount), 0);

    const now = new Date();
    const monthAmount = expenses
      .filter((expense) => {
        const date = new Date(expense.date);
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      })
      .reduce((sum, expense) => sum + (expense.type === "income" ? expense.amount : -expense.amount), 0);

    const progress = expenses.length
      ? Math.min(
          100,
          Math.round(
            (expenses.filter((expense) => expense.type === "expense").reduce((a, b) => a + b.amount, 0) /
              (expenses.reduce((a, b) => a + Math.abs(b.amount || 0), 0) || 1)) *
              100
          )
        )
      : 0;

    const upcomingPlans = [...plans]
      .filter((plan) => !plan.completed)
      .sort((a, b) => {
        if ((a.date || "") !== (b.date || "")) return (a.date || "").localeCompare(b.date || "");
        return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
      })
      .slice(0, 3);

    const habitPreview = habits
      .map((habit) => {
        const logs = habit.logs || {};
        const streakMeta = buildHabitMetadata(habit);
        const frequency = habit.frequency || "daily";
        const keys = getRecentWindowKeys(frequency, 7, fromDateKey(todayKey));
        return {
          id: habit.id,
          title: habit.title,
          frequency,
          streakMeta,
          dots: keys.map((windowKey) => isHabitCompletedInWindow({ ...habit, logs }, windowKey, frequency)),
        };
      })
      .slice(0, 3);

    return {
      totalTasks,
      completedTasks,
      pendingTasks,
      todayPlans,
      todayAmount,
      monthAmount,
      progress,
      upcomingPlans,
      habitPreview,
    };
  }, [expenses, habits, plans, tasks, todayKey]);



  if (loading) {
    return <section className="dashboard-page"><p>Loading dashboard...</p></section>;
  }

  return (
    <section className="dashboard-page">
      <header className="dashboard-header-block">
        <h1>Dashboard</h1>
        <p>Today you have {summary.pendingTasks} pending task{summary.pendingTasks === 1 ? "" : "s"}.</p>
        {error ? <p className="page-error">{error}</p> : null}
      </header>

      <div className="dashboard-layout-grid">
        <div className="dashboard-left-stack">
          <article className="wire-card">
            <h3>Today Summary</h3>
            <div className="summary-metrics-grid">
              <div><span>Total Tasks</span><strong>{summary.totalTasks}</strong></div>
              <div><span>Completed</span><strong>{summary.completedTasks}</strong></div>
              <div><span>Pending</span><strong>{summary.pendingTasks}</strong></div>
              <div><span>Today&apos;s Plans</span><strong>{summary.todayPlans}</strong></div>
            </div>
          </article>

          <article className="wire-card">
            <h3>Upcoming Plans</h3>
            <div className="line-list">
              {summary.upcomingPlans.length === 0 ? (
                <p className="muted-line">No upcoming plans.</p>
              ) : (
                summary.upcomingPlans.map((plan) => (
                  <div key={plan.id} className="line-row upcoming-plan-row">
                    <span className="date-badge">{plan.date || "No date"}{plan.time ? ` • ${plan.time}` : ""}</span>
                    <strong>{plan.title}</strong>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>

        <div className="dashboard-right-stack">
          <article className="wire-card finance-card">
            <h3>Finance</h3>
            <div className="finance-amounts">
              <p><span>Today</span><strong>₹ {summary.todayAmount}</strong></p>
              <p><span>This Month</span><strong>₹ {summary.monthAmount}</strong></p>
            </div>
            <div className="wire-progress"><span style={{ width: `${summary.progress}%` }} /></div>
            <small>{summary.progress}% spend ratio</small>
          </article>

          <article className="wire-card">
            <h3>Habits</h3>
            <div className="line-list">
              {summary.habitPreview.length === 0 ? (
                <p className="muted-line">No habits yet.</p>
              ) : (
                summary.habitPreview.map((habit) => (
                  <div key={habit.id} className="habit-line-row">
                    <span>
                      {habit.title}
                      <small>{habit.frequency} • {habit.streakMeta.streakState} • freezes {habit.streakMeta.freezesLeft}</small>
                    </span>
                    <div className="tiny-dots">
                      {habit.dots.map((done, idx) => (
                        <em key={`${habit.id}-${idx}`} className={done ? "filled" : "empty"} />
                      ))}
                    </div>
                    <strong>{habit.streakMeta.currentStreak}</strong>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export default Home;
