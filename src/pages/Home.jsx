import { useCallback, useEffect, useMemo, useState } from "react";
import { getDocs } from "firebase/firestore";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../hooks/useAuth";
import { workspaceCollection } from "../services/paths";
import { monthlyTotals } from "../utils/financeReport";
import {
  activityByDay,
  financeStats,
  habitStats,
  plannerStats,
  taskStats,
} from "../utils/dashboard";

const STATUS_COLORS = ["var(--chart-1)", "var(--chart-4)", "var(--chart-3)"];
const money = (value) => `₹${Math.round(value).toLocaleString("en-IN")}`;

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      {label ? <p className="chart-tooltip-label">{label}</p> : null}
      {payload.map((row) => (
        <p key={row.name} className="chart-tooltip-row">
          {row.name}: <strong>{row.value}</strong>
        </p>
      ))}
    </div>
  );
}

function Home() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(() => Boolean(user));
  const [tasks, setTasks] = useState([]);
  const [plans, setPlans] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [habits, setHabits] = useState([]);
  const [error, setError] = useState("");

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

  const tasksSummary = useMemo(() => taskStats(tasks), [tasks]);
  const habitsSummary = useMemo(() => habitStats(habits), [habits]);
  const finance = useMemo(() => financeStats(expenses), [expenses]);
  const planner = useMemo(() => plannerStats(plans), [plans]);
  const activity = useMemo(
    () => activityByDay({ habits, expenses, plans }),
    [expenses, habits, plans]
  );
  const cashSeries = useMemo(() => monthlyTotals(expenses, 6), [expenses]);

  const isEmpty =
    !tasks.length && !habits.length && !expenses.length && !plans.length && !loading;

  if (loading) {
    return (
      <section className="dashboard-page">
        <p className="empty">Loading your dashboard…</p>
      </section>
    );
  }

  return (
    <section className="dashboard-page">
      <header className="dashboard-header-block">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">
          {user
            ? `${tasksSummary.active} active task${tasksSummary.active === 1 ? "" : "s"}, ` +
              `${habitsSummary.doneNow}/${habitsSummary.total} habits done, ` +
              `${planner.todayTotal} planned today`
            : "Log in to see your own numbers."}
        </p>
      </header>

      {error ? <p className="page-error">{error}</p> : null}

      {isEmpty ? (
        <div className="panel">
          <p className="empty">
            Nothing tracked yet. Add a task, a habit or a transaction and this fills in with your
            own data.
          </p>
        </div>
      ) : null}

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Tasks done</span>
          <strong className="stat-value">{tasksSummary.rate}%</strong>
          <div className="bar">
            <span style={{ width: `${tasksSummary.rate}%` }} />
          </div>
          <span className="stat-note">
            {tasksSummary.done} of {tasksSummary.total}
          </span>
        </div>

        <div className="stat">
          <span className="stat-label">Overdue</span>
          <strong className={`stat-value ${tasksSummary.overdue ? "is-negative" : ""}`}>
            {tasksSummary.overdue}
          </strong>
          <span className="stat-note">{tasksSummary.dueToday} due today</span>
        </div>

        <div className="stat">
          <span className="stat-label">Habit streak</span>
          <strong className="stat-value">{habitsSummary.longestStreak}</strong>
          <span className="stat-note">
            {habitsSummary.doneNow}/{habitsSummary.total} done now
          </span>
        </div>

        <div className="stat">
          <span className="stat-label">This month</span>
          <strong className={`stat-value ${finance.balance < 0 ? "is-negative" : "is-positive"}`}>
            {money(finance.balance)}
          </strong>
          <span className="stat-note">
            {money(finance.income)} in · {money(finance.spend)} out
          </span>
        </div>
      </div>

      <div className="dash-grid">
        <article className="panel dash-col-8">
          <div className="panel-head">
            <h3 className="panel-title">Cash flow</h3>
            <span className="panel-note">Last 6 months</span>
          </div>

          {finance.allTimeCount ? (
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cashSeries} barGap={4}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={48} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent-soft)" }} />
                  <Bar dataKey="income" name="Income" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="spend" name="Spend" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="empty">
              No transactions yet. <Link to="/finance">Add one</Link>.
            </p>
          )}
        </article>

        <article className="panel dash-col-4">
          <div className="panel-head">
            <h3 className="panel-title">Task breakdown</h3>
          </div>

          {tasksSummary.total ? (
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={tasksSummary.byStatus} layout="vertical">
                  <CartesianGrid horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="status"
                    width={82}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent-soft)" }} />
                  <Bar dataKey="count" name="Tasks" radius={[0, 4, 4, 0]}>
                    {tasksSummary.byStatus.map((row, index) => (
                      <Cell key={row.status} fill={STATUS_COLORS[index]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="empty">
              No tasks yet. <Link to="/tasks">Add one</Link>.
            </p>
          )}
        </article>

        <article className="panel dash-col-6">
          <div className="panel-head">
            <h3 className="panel-title">Habits</h3>
            <Link to="/habits" className="panel-note">
              View all
            </Link>
          </div>

          <div className="line-list">
            {habitsSummary.rows.slice(0, 5).map((habit) => (
              <div key={habit.id} className="habit-line-row">
                <span>
                  {habit.title}
                  <small>
                    {habit.frequency} · {habit.doneThisWindow ? "done" : "pending"}
                  </small>
                </span>
                <strong className={`streak-badge state-${habit.streakState}`}>{habit.streak}</strong>
              </div>
            ))}

            {habitsSummary.total === 0 ? (
              <p className="empty">
                No habits yet. <Link to="/habits">Start one</Link>.
              </p>
            ) : null}
          </div>
        </article>

        <article className="panel dash-col-6">
          <div className="panel-head">
            <h3 className="panel-title">Coming up</h3>
            <span className="panel-note">
              {planner.todayDone}/{planner.todayTotal} done today
            </span>
          </div>

          <div className="line-list">
            {planner.upcoming.map((plan) => (
              <div key={plan.id} className="upcoming-plan-row">
                <span className="date-badge">{plan.date || "No date"}</span>
                <strong>{plan.title}</strong>
              </div>
            ))}

            {planner.upcoming.length === 0 ? (
              <p className="empty">
                Nothing planned. <Link to="/planner">Plan your week</Link>.
              </p>
            ) : null}
          </div>
        </article>

        <article className="panel dash-col-12">
          <div className="panel-head">
            <h3 className="panel-title">Activity</h3>
            <span className="panel-note">
              {activity.activeDays} active days in the last 8 weeks · {activity.total} records
            </span>
          </div>

          <div className="activity-heat">
            {activity.cells.map((cell) => (
              <span
                key={cell.date}
                className={`activity-cell ${cell.level ? `l${cell.level}` : ""}`}
                title={`${cell.date}: ${cell.count} record${cell.count === 1 ? "" : "s"}`}
              />
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}

export default Home;
