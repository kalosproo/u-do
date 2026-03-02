import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";
import { collection, getDocs } from "firebase/firestore";

const toDateKey = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getStreak = (logs, todayKey) => {
  let streak = 0;
  const cursor = new Date(`${todayKey}T00:00:00`);

  while (true) {
    const key = toDateKey(cursor);
    if (!logs?.[key]) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
};

function Home() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [plans, setPlans] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [habits, setHabits] = useState([]);

  const user = auth.currentUser;
  const todayKey = toDateKey(new Date());

  useEffect(() => {
    if (!user) return;

    Promise.all([
      getDocs(collection(db, "users", user.uid, "tasks")),
      getDocs(collection(db, "users", user.uid, "planner")),
      getDocs(collection(db, "users", user.uid, "expenses")),
      getDocs(collection(db, "users", user.uid, "habits")),
    ])
      .then(([taskSnap, planSnap, expenseSnap, habitSnap]) => {
        setTasks(taskSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setPlans(planSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setExpenses(expenseSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setHabits(habitSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      })
      .finally(() => setLoading(false));
  }, [user]);

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
        return {
          id: habit.id,
          title: habit.title,
          streak: getStreak(logs, todayKey),
          dots: Array.from({ length: 7 }).map((_, index) => {
            const date = new Date(`${todayKey}T00:00:00`);
            date.setDate(date.getDate() - (6 - index));
            return Boolean(logs[toDateKey(date)]);
          }),
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
                  <div key={plan.id} className="line-row">
                    <span>{plan.date || "No date"}</span>
                    <strong>{plan.title}</strong>
                  </div>
                ))
              )}
            </div>
          </article>
        </div>

        <div className="dashboard-right-stack">
          <article className="wire-card">
            <h3>Finance</h3>
            <p>Today: ₹ {summary.todayAmount}</p>
            <p>This Month: ₹ {summary.monthAmount}</p>
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
                    <span>{habit.title}</span>
                    <div className="tiny-dots">
                      {habit.dots.map((done, idx) => (
                        <em key={`${habit.id}-${idx}`} className={done ? "filled" : "empty"} />
                      ))}
                    </div>
                    <strong>{habit.streak}</strong>
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
