import { useCallback, useEffect, useMemo, useState } from "react";
import { getDocs } from "firebase/firestore";
import { Link } from "react-router-dom";
import { FiCheck, FiPlus } from "react-icons/fi";
import { createTask, setTaskStatus } from "../services/tasks";
import { formatDayLabel, formatRelativeDay, todayKey } from "../utils/dateKeys";
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
import FriendStreaks from "../components/FriendStreaks";
import ChartPatterns from "../components/ChartPatterns";
import { seriesFill } from "../utils/chartSeries";
import { monthlyTotals } from "../utils/financeReport";
import {
  activityByDay,
  activityWeekGrid,
  financeStats,
  habitStats,
  plannerStats,
  taskStats,
} from "../utils/dashboard";

const money = (value) => `₹${Math.round(value).toLocaleString("en-IN")}`;

/**
 * Axis ticks have about five characters before they start colliding, so a
 * six-figure amount has to lose its digits rather than its axis. Indian
 * grouping, so 1,50,000 reads as 1.5L and not 150k.
 */
const compactMoney = (value) => {
  const n = Math.abs(value);
  if (n >= 1e7) return `₹${+(value / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${+(value / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${+(value / 1e3).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
};

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
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [savingTask, setSavingTask] = useState(false);

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
  // A year, so the full-width card carries a full-width graph. Eight weeks was
  // a 110px strip floating in 1100px of card, which is most of why the panel
  // read as unfinished. Nothing extra is fetched: this is the same three
  // collections the rest of the dashboard already has in memory.
  const activity = useMemo(
    () => activityByDay({ habits, expenses, plans }, 364),
    [expenses, habits, plans]
  );
  const { cells: activityCells, weeks: activityWeeks } = useMemo(
    () => activityWeekGrid(activity.cells),
    [activity.cells]
  );
  const cashSeries = useMemo(() => monthlyTotals(expenses, 6), [expenses]);

  const isEmpty =
    !tasks.length && !habits.length && !expenses.length && !plans.length && !loading;
  const today = todayKey();
  const todayTasks = useMemo(
    () => tasks.filter((task) => task.status !== "done" && (!task.dueDate || task.dueDate <= today)).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999")).slice(0, 6),
    [tasks, today]
  );
  const attentionCount = tasksSummary.overdue + tasksSummary.dueToday + Math.max(habitsSummary.total - habitsSummary.doneNow, 0);
  const firstName = user?.displayName?.trim()?.split(/\s+/)[0] || "";
  const hour = new Date().getHours();
  const greeting = firstName ? `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${firstName}.` : "Welcome back.";

  const addTodayTask = async () => {
    if (!user || !newTaskTitle.trim()) return;
    setSavingTask(true);
    try {
      await createTask(user.uid, { title: newTaskTitle.trim(), dueDate: today, priority: "medium" });
      setNewTaskTitle("");
      await loadDashboard();
    } catch (saveError) {
      setError(saveError?.message || "Couldn't add that task.");
    } finally { setSavingTask(false); }
  };

  const completeTodayTask = async (task) => {
    if (!user) return;
    setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status: "done", completed: true } : item));
    try { await setTaskStatus(user.uid, task.id, "done"); await loadDashboard(); }
    catch (saveError) { setError(saveError?.message || "Couldn't complete that task."); await loadDashboard(); }
  };

  if (loading) {
    return <section className="dashboard-page dashboard-skeleton" aria-busy="true" aria-label="Loading dashboard">
      <div className="skeleton skeleton-title" /><div className="skeleton skeleton-subtitle" />
      <div className="today-panel panel"><div className="skeleton skeleton-section" /><div className="skeleton skeleton-row" /><div className="skeleton skeleton-row" /><div className="skeleton skeleton-row" /></div>
      <div className="dash-grid"><div className="panel dash-col-6 skeleton-card" /><div className="panel dash-col-6 skeleton-card" /></div>
    </section>;
  }

  return (
    <section className="dashboard-page">
      <header className="dashboard-header-block">
        <p className="eyebrow">HOME / OVERVIEW</p>
        <h1 className="dashboard-greeting">{greeting}</h1>
        <p className="page-sub">{user ? `You have ${attentionCount} thing${attentionCount === 1 ? "" : "s"} that need${attentionCount === 1 ? "s" : ""} your attention today.` : "Sign in to bring your day into focus."}</p>
        {user ? <p className="dashboard-summary">{tasksSummary.active} active tasks <span>·</span> {habitsSummary.doneNow}/{habitsSummary.total} habits <span>·</span> {planner.todayTotal} plans today</p> : null}
      </header>

      {error ? <div className="page-error" role="alert"><div><strong>Something went wrong</strong><span>Your data is safe. We couldn't load this right now.</span></div><button type="button" className="btn btn-sm" onClick={loadDashboard}>Try again</button></div> : null}

      <article className="panel today-panel">
        <div className="panel-head"><div><p className="eyebrow">TODAY</p><h2 className="today-title">The next things that matter.</h2></div><Link to="/tasks" className="panel-note panel-link">View all tasks</Link></div>
        {user && todayTasks.length ? <div className="today-task-list">{todayTasks.map((task) => <div className="today-task" key={task.id}><button type="button" className="today-check" onClick={() => completeTodayTask(task)} aria-label={`Complete ${task.title}`}><FiCheck /></button><span className="today-task-title">{task.title}</span>{task.dueDate ? <span className={`today-pill ${task.dueDate < today ? "is-overdue" : ""}`}>{task.dueDate < today ? "Overdue" : "Today"}</span> : null}{task.priority && task.priority !== "medium" ? <span className={`priority-tag priority-${task.priority}`}>{task.priority}</span> : null}</div>)}</div> : <div className="today-empty"><strong>{user ? "No tasks are pressing today." : "Your day is ready when you are."}</strong><span>{user ? "Start with one thing you want to get done today." : "Sign in to see your personal plan."}</span></div>}
        {user ? <form className="today-add" onSubmit={(event) => { event.preventDefault(); addTodayTask(); }}><FiPlus aria-hidden="true" /><input value={newTaskTitle} onChange={(event) => setNewTaskTitle(event.target.value)} placeholder="Add a task for today" aria-label="Add a task for today" /><button type="submit" className="btn btn-primary btn-sm" disabled={savingTask || !newTaskTitle.trim()}>{savingTask ? "Adding…" : "Add task"}</button></form> : <Link to="/login" className="btn btn-primary">Sign in</Link>}
      </article>
      {isEmpty ? (
        <div className="panel">
          <p className="empty">
            Nothing tracked yet. Add a task, a habit or a transaction and this fills in with your
            own data.
          </p>
        </div>
      ) : null}

      {/* Every tile links to the page the number comes from, with the filter
          that isolates it, so a figure is always traceable to its source. */}
      <div className="stat-grid">
        <Link to="/tasks?filter=done" className="stat is-linked">
          <span className="stat-label">Tasks done</span>
          <strong className="stat-value">{tasksSummary.rate}%</strong>
          <div className="bar">
            <span style={{ width: `${tasksSummary.rate}%` }} />
          </div>
          <span className="stat-note">
            {tasksSummary.done} of {tasksSummary.total}
          </span>
        </Link>

        <Link to="/tasks?filter=overdue" className="stat is-linked">
          <span className="stat-label">Overdue</span>
          <strong className={`stat-value ${tasksSummary.overdue ? "is-negative" : ""}`}>
            {tasksSummary.overdue}
          </strong>
          <span className="stat-note">{tasksSummary.dueToday} due today</span>
        </Link>

        <Link to="/habits" className="stat is-linked">
          <span className="stat-label">Habit streak</span>
          <strong className="stat-value">{habitsSummary.longestStreak}</strong>
          <span className="stat-note">
            {habitsSummary.doneNow}/{habitsSummary.total} done now
          </span>
        </Link>

        <Link to="/finance" className="stat is-linked">
          <span className="stat-label">This month</span>
          <strong className={`stat-value ${finance.balance < 0 ? "is-negative" : "is-positive"}`}>
            {money(finance.balance)}
          </strong>
          <span className="stat-note">
            {money(finance.income)} in · {money(finance.spend)} out
          </span>
        </Link>
      </div>

      <div className="dash-grid">
        <article className="panel dash-col-8">
          <div className="panel-head">
            <h3 className="panel-title">Cash flow</h3>
            <Link to="/finance" className="panel-note panel-link">
              Open Finance
            </Link>
          </div>

          {finance.allTimeCount ? (
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cashSeries} barGap={4} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickMargin={6}
                    tickFormatter={compactMoney}
                  />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent-soft)" }} />
                  <Bar
                    dataKey="income"
                    name="Income"
                    fill="var(--chart-1)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={26}
                  />
                  <Bar
                    dataKey="spend"
                    name="Spend"
                    fill="var(--chart-4)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={26}
                  />
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
            <Link to="/tasks" className="panel-note panel-link">
              Open Tasks
            </Link>
          </div>

          {tasksSummary.total ? (
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={tasksSummary.byStatus} layout="vertical">
                  <ChartPatterns scope="home-tasks" />
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
                  <Bar
                    dataKey="count"
                    name="Tasks"
                    radius={[0, 3, 3, 0]}
                    maxBarSize={30}
                    background={{ fill: "var(--chart-track)", radius: 3 }}
                  >
                    {tasksSummary.byStatus.map((row, index) => (
                      <Cell key={row.status} fill={seriesFill("home-tasks", index * 2)} />
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

        <article className="panel dash-col-4 dash-trio">
          <div className="panel-head">
            <h3 className="panel-title">Habits</h3>
            <Link to="/habits" className="panel-note">
              View all
            </Link>
          </div>

          <div className="line-list">
            {habitsSummary.rows.slice(0, 5).map((habit) => (
              <Link key={habit.id} to="/habits" className="habit-line-row is-linked">
                <span>
                  {habit.title}
                  <small>
                    {habit.frequency} · {habit.doneThisWindow ? "done" : "pending"}
                  </small>
                </span>
                <strong className={`streak-badge state-${habit.streakState}`}>{habit.streak}</strong>
              </Link>
            ))}

            {habitsSummary.total === 0 ? (
              <p className="empty">
                No habits yet. <Link to="/habits">Start one</Link>.
              </p>
            ) : null}
          </div>
        </article>

        <article className="panel dash-col-4 dash-trio">
          <div className="panel-head">
            <h3 className="panel-title">Friends</h3>
            <Link to="/friends" className="panel-note panel-link">
              All friends
            </Link>
          </div>
          <FriendStreaks limit={3} compact />
        </article>

        <article className="panel dash-col-4 dash-trio">
          <div className="panel-head">
            <h3 className="panel-title">Coming up</h3>
            <span className="panel-note">
              {planner.todayDone}/{planner.todayTotal} done today
            </span>
          </div>

          <div className="line-list">
            {planner.upcoming.map((plan) => (
              <Link key={plan.id} to="/planner" className="upcoming-plan-row is-linked">
                <span className="date-badge">{plan.date ? formatRelativeDay(plan.date) : "No date"}</span>
                <strong>{plan.title}</strong>
              </Link>
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
              {activity.activeDays} active days in the last year · {activity.total} records
            </span>
          </div>

          <div className="activity-heat-wrap">
            <div className="activity-months" style={{ "--weeks": activityWeeks.length }} aria-hidden>
              {activityWeeks.map((week) => (
                <span key={week.key}>{week.month}</span>
              ))}
            </div>

            <div className="activity-heat" style={{ "--weeks": activityWeeks.length }}>
              {activityCells.map((cell, index) =>
                cell ? (
                  <span
                    key={cell.date}
                    className={`activity-cell ${cell.level ? `l${cell.level}` : ""}`}
                    title={`${formatDayLabel(cell.date)}: ${cell.count} record${
                      cell.count === 1 ? "" : "s"
                    }`}
                  />
                ) : (
                  <span key={`pad-${index}`} className="activity-cell is-pad" />
                )
              )}
            </div>

            <div className="activity-legend">
              <span>Less</span>
              <i className="activity-cell" />
              <i className="activity-cell l1" />
              <i className="activity-cell l2" />
              <i className="activity-cell l3" />
              <i className="activity-cell l4" />
              <span>More</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export default Home;
