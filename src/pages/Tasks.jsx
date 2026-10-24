import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FiChevronDown, FiPlay, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { useAdhd } from "../hooks/useAdhd";
import { useAuth } from "../hooks/useAuth";
import { useFocus } from "../hooks/useFocus";
import { STARTER_MINUTES } from "../utils/focusTimer";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { fromDateKey, toDateKey } from "../utils/dateKeys";
import {
  clearTasks,
  createTask,
  deleteTask as deleteTaskDoc,
  fetchTasks,
  setSubtasks,
  setTaskStatus,
} from "../services/tasks";
import { addSubtask, removeSubtask, subtaskProgress, toggleSubtask } from "../utils/subtasks";
import { describeRepeat, EMPTY_REPEAT, WEEKDAYS } from "../utils/recurrence";
import ClearDataButton from "../components/ClearDataButton";
import PageMenu, { PageMenuLabel } from "../components/PageMenu";
import { celebrate } from "../utils/feedback";

// One list, not a board: a task is either still to do or done. Anything
// once marked "in progress" simply counts as to do.
const FILTERS = [
  ["active", "To do"],
  ["overdue", "Overdue"],
  ["done", "Done"],
  ["all", "All"],
];

const EMPTY = {
  active: "Nothing to do. Add something above.",
  overdue: "Nothing overdue.",
  done: "Nothing done yet. Tick a task when you finish it.",
  all: "No tasks yet. Add one above.",
};

const pad = (n) => String(n).padStart(2, "0");
const clockNow = (date = new Date()) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

const completedMs = (task) => {
  const at = task.completedAt;
  if (!at) return 0;
  if (typeof at.toMillis === "function") return at.toMillis();
  const parsed = new Date(at).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const PRIORITIES = ["low", "medium", "high"];

const REPEAT_OPTIONS = [
  ["none", "Once"],
  ["daily", "Every day"],
  ["weekly", "Certain days"],
  ["monthly", "Every month"],
];

/** 14:00 as "2:00 PM", in whatever the reader's locale calls it. */
function formatDueTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) return "";

  const [hour, minute] = value.split(":").map(Number);
  const at = new Date();
  at.setHours(hour, minute, 0, 0);

  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDueDate(value) {
  if (!value) return "";

  const parsed = fromDateKey(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Tasks() {
  const { user } = useAuth();
  const requireUser = useAuthGuard();

  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [priority, setPriority] = useState("medium");
  const [repeat, setRepeat] = useState(EMPTY_REPEAT);
  // The dashboard links here with ?filter=overdue etc., so the arriving view
  // actually shows the number that was clicked.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("filter");
  const [filter, setFilter] = useState(
    FILTERS.some(([key]) => key === requested) ? requested : "active"
  );
  const [error, setError] = useState("");
  // ADHD mode says "from earlier" and keeps it plain: no alarm on a late task.
  const calm = Boolean(useAdhd()?.enabled);
  const focus = useFocus();
  const [openId, setOpenId] = useState(null);
  const [stepText, setStepText] = useState("");
  // A task due at 18:30 turns overdue at 18:30, not at midnight, so the
  // clock is re-read every minute.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const todayKey = toDateKey(now);
  const nowTime = clockNow(now);

  const loadTasks = useCallback(async () => {
    if (!user) return;

    try {
      setTasks(await fetchTasks(user.uid));
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "Couldn't load your tasks.");
    }
  }, [user]);

  // Deferred a tick: loading sets state, and React warns about doing that
  // synchronously inside an effect. Every page in the app loads this way.
  useEffect(() => {
    const timer = setTimeout(loadTasks, 0);
    return () => clearTimeout(timer);
  }, [loadTasks]);

  const addTask = async () => {
    const currentUser = requireUser();
    if (!currentUser || !title.trim()) return;

    try {
      await createTask(currentUser.uid, { title: title.trim(), dueDate, dueTime, priority, repeat });
      setTitle("");
      setDueDate("");
      setDueTime("");
      setPriority("medium");
      setRepeat(EMPTY_REPEAT);
      setError("");
      loadTasks();
    } catch (addError) {
      setError(addError?.message || "Couldn't add that task.");
    }
  };

  const deleteTask = async (id) => {
    const currentUser = requireUser();
    if (!currentUser) return;

    try {
      await deleteTaskDoc(currentUser.uid, id);
      setError("");
      loadTasks();
    } catch (deleteError) {
      setError(deleteError?.message || "Couldn't delete that task.");
    }
  };

  const updateTaskStatus = async (task, nextStatus) => {
    const currentUser = requireUser();
    if (!currentUser || task.status === nextStatus) return;

    if (nextStatus === "done") celebrate();

    // Tick it on screen first so it feels immediate, then persist.
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, status: nextStatus, completed: nextStatus === "done", completedAt: nextStatus === "done" ? new Date() : null }
          : item
      )
    );

    try {
      await setTaskStatus(currentUser.uid, task, nextStatus);
      setError("");
      loadTasks();
    } catch (updateError) {
      setError(updateError?.message || "Couldn't update that task.");
      loadTasks();
    }
  };

  // Steps change on screen first, then save; a failed save reloads the truth.
  const changeSteps = async (task, next) => {
    const currentUser = requireUser();
    if (!currentUser) return;
    setTasks((current) => current.map((item) => (item.id === task.id ? { ...item, subtasks: next } : item)));
    try {
      await setSubtasks(currentUser.uid, task.id, next);
    } catch (stepError) {
      setError(stepError?.message || "Couldn't save that step.");
      loadTasks();
    }
  };

  const isOverdue = useCallback(
    (task) =>
      task.status !== "done" &&
      Boolean(task.dueDate) &&
      (task.dueDate < todayKey || (task.dueDate === todayKey && Boolean(task.dueTime) && task.dueTime < nowTime)),
    [todayKey, nowTime]
  );

  // To do: overdue first, then soonest due, undated last. Done: newest first.
  const visibleTasks = useMemo(() => {
    const open = tasks
      .filter((task) => task.status !== "done")
      .sort((a, b) => {
        const late = Number(isOverdue(b)) - Number(isOverdue(a));
        if (late) return late;
        const aKey = a.dueDate ? `${a.dueDate} ${a.dueTime || "99:99"}` : "9999";
        const bKey = b.dueDate ? `${b.dueDate} ${b.dueTime || "99:99"}` : "9999";
        return aKey.localeCompare(bKey);
      });
    const done = tasks.filter((task) => task.status === "done").sort((a, b) => completedMs(b) - completedMs(a));

    if (filter === "active") return open;
    if (filter === "overdue") return open.filter(isOverdue);
    if (filter === "done") return done;
    return [...open, ...done];
  }, [filter, isOverdue, tasks]);

  const stats = useMemo(() => {
    const done = tasks.filter((task) => task.status === "done").length;

    return {
      done,
      active: tasks.length - done,
      overdue: tasks.filter(isOverdue).length,
    };
  }, [isOverdue, tasks]);

  return (
    <section className="tasks-page">
      <header className="page-head">
        <div className="page-head-row">
          <div>
            <h1 className="page-title">Tasks</h1>
            <p className="page-sub">
              {stats.active} active · {stats.done} done
              {stats.overdue ? ` · ${stats.overdue} ${calm ? "from earlier" : "overdue"}` : ""}
            </p>
          </div>

          <PageMenu label="Task actions">
            <PageMenuLabel>Danger zone</PageMenuLabel>
            <ClearDataButton
              label="Clear tasks"
              noun="tasks"
              count={tasks.length}
              clear={clearTasks}
              onCleared={loadTasks}
            />
          </PageMenu>
        </div>

        <div className="tasks-filter-row">
          {FILTERS.filter(([key]) => key !== "overdue" || stats.overdue || filter === "overdue").map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip ${filter === key ? "active" : ""}`}
              onClick={() => {
                setFilter(key);
                // Keep the address honest about what is on screen.
                if (key === "active") searchParams.delete("filter");
                else searchParams.set("filter", key);
                setSearchParams(searchParams, { replace: true });
              }}
            >
              {key === "overdue" && calm ? "From earlier" : label}
              {key === "overdue" && stats.overdue ? ` ${stats.overdue}` : ""}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="page-error">{error}</p> : null}

      <div className="panel">
        <div className="task-compose">
          <input
            placeholder="What needs doing?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTask();
            }}
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Due date"
          />
          <div className="time-input">
            <input
              type="time"
              className={dueTime ? "" : "is-empty"}
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              aria-label="Due time (optional)"
              title="Optional. A task with a time stays quiet until then, and is reminded 30 minutes before."
            />
            {dueTime ? null : <span className="time-input-hint" aria-hidden="true">00:00 · optional</span>}
          </div>
          {/* Just the level. The row carries two more controls than it used
              to, and "Medium priority" no longer fits — the label says what
              the field is, so the option does not have to repeat it. */}
          <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            {PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {item[0].toUpperCase() + item.slice(1)}
              </option>
            ))}
          </select>
          <select
            value={repeat.kind}
            onChange={(e) => setRepeat({ kind: e.target.value, days: repeat.days })}
            aria-label="Repeat"
          >
            {REPEAT_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={addTask}>
            <FiPlus /> Add
          </button>
        </div>

        {/* Only asked for when it is the answer to something. A day picker
            sitting there permanently would imply every task repeats. */}
        {repeat.kind === "weekly" ? (
          <div className="repeat-days" role="group" aria-label="Repeat on">
            <span className="repeat-days-label">Repeat on</span>
            {WEEKDAYS.map((day) => {
              const picked = repeat.days.includes(day.value);

              return (
                <button
                  key={day.value}
                  type="button"
                  className="repeat-day"
                  aria-pressed={picked}
                  aria-label={day.label}
                  title={day.label}
                  onClick={() =>
                    setRepeat((current) => ({
                      kind: "weekly",
                      days: picked
                        ? current.days.filter((value) => value !== day.value)
                        : [...current.days, day.value].sort((a, b) => a - b),
                    }))
                  }
                >
                  {day.short}
                </button>
              );
            })}

            {repeat.days.length === 0 ? (
              <span className="repeat-days-note">Pick at least one, or it never comes back.</span>
            ) : null}
          </div>
        ) : null}
      </div>

      <section className="panel task-list-panel" aria-label="Tasks">
        {visibleTasks.length ? (
          <ul className="task-list">
            {visibleTasks.map((task) => {
              const late = isOverdue(task);
              const overdue = late && !calm;
              const done = task.status === "done";
              const repeatLabel = describeRepeat(task.repeat);

              const steps = subtaskProgress(task.subtasks);
              const open = openId === task.id;

              return (
                <li key={task.id} className={`task-item ${open ? "is-open" : ""}`}>
                  <div className={`task-row ${done ? "task-done" : ""} ${overdue ? "task-overdue" : ""}`}>
                    <button
                      type="button"
                      className={`task-check ${done ? "checked" : ""}`}
                      aria-label={done ? `Mark ${task.title} as not done` : `Mark ${task.title} done`}
                      onClick={() => updateTaskStatus(task, done ? "todo" : "done")}
                    >
                      ✓
                    </button>

                    <button
                      type="button"
                      className="task-body"
                      data-tip="steps"
                      aria-expanded={open}
                      aria-label={`${task.title}, ${open ? "hide" : "show"} steps`}
                      onClick={() => {
                        setOpenId(open ? null : task.id);
                        setStepText("");
                      }}
                    >
                      <span className="task-title">{task.title}</span>
                      {task.dueDate || repeatLabel || task.priority === "high" || steps.total ? (
                        <span className="task-sub">
                          {task.priority === "high" ? <span className="task-flag">High</span> : null}
                          {task.dueDate ? (
                            <span className={overdue ? "due-overdue" : ""}>
                              {late ? (calm ? "From earlier · " : "Overdue · ") : ""}
                              {formatDueDate(task.dueDate)}
                              {task.dueTime ? ` · ${formatDueTime(task.dueTime)}` : ""}
                            </span>
                          ) : null}
                          {repeatLabel ? <span>{repeatLabel}</span> : null}
                          {steps.total ? <span className="task-steps-count">{steps.done}/{steps.total} steps</span> : null}
                        </span>
                      ) : null}
                    </button>

                    <FiChevronDown className="task-expand" aria-hidden="true" />

                    <button
                      type="button"
                      className="task-delete"
                      aria-label={`Delete ${task.title}`}
                      onClick={() => deleteTask(task.id)}
                    >
                      <FiTrash2 />
                    </button>
                  </div>

                  {open ? (
                    <div className="task-steps">
                      {calm && !done ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-primary task-just-start"
                          onClick={() => (focus?.session ? focus.open() : focus?.start(STARTER_MINUTES, task.title, { starter: true, taskId: task.id }))}
                        >
                          <FiPlay aria-hidden="true" /> {focus?.session ? "Back to the timer" : `Just start · ${STARTER_MINUTES} min`}
                        </button>
                      ) : null}
                      {task.subtasks?.length ? (
                        <ul>
                          {task.subtasks.map((step) => (
                            <li key={step.id} className={step.done ? "is-done" : ""}>
                              <label>
                                <input
                                  type="checkbox"
                                  checked={step.done}
                                  onChange={() => changeSteps(task, toggleSubtask(task.subtasks, step.id))}
                                />
                                <span>{step.title}</span>
                              </label>
                              <button
                                type="button"
                                className="task-step-remove"
                                aria-label={`Remove step ${step.title}`}
                                onClick={() => changeSteps(task, removeSubtask(task.subtasks, step.id))}
                              >
                                <FiX />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <form
                        className="task-step-add"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!stepText.trim()) return;
                          changeSteps(task, addSubtask(task.subtasks, stepText));
                          setStepText("");
                        }}
                      >
                        <input
                          value={stepText}
                          maxLength={120}
                          placeholder={task.subtasks?.length ? "Add another step" : "Break it into steps — add the first one"}
                          onChange={(event) => setStepText(event.target.value)}
                          aria-label={`New step for ${task.title}`}
                        />
                        <button type="submit" className="btn btn-sm" disabled={!stepText.trim() || (task.subtasks?.length || 0) >= 30}>
                          Add
                        </button>
                      </form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty-day">{filter === "overdue" && calm ? "Nothing from earlier." : EMPTY[filter]}</p>
        )}
      </section>
    </section>
  );
}

export default Tasks;
