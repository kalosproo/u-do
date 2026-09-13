import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { fromDateKey, todayKey as getTodayKey } from "../utils/dateKeys";
import {
  clearTasks,
  createTask,
  deleteTask as deleteTaskDoc,
  fetchTasks,
  setTaskStatus,
} from "../services/tasks";
import ClearDataButton from "../components/ClearDataButton";

const COLUMNS = [
  { key: "todo", title: "To do" },
  { key: "progress", title: "In progress" },
  { key: "done", title: "Done" },
];

const FILTERS = [
  ["all", "All"],
  ["active", "Active"],
  ["done", "Completed"],
  ["overdue", "Overdue"],
];

const PRIORITIES = ["low", "medium", "high"];

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
  const [priority, setPriority] = useState("medium");
  // The dashboard links here with ?filter=overdue etc., so the arriving view
  // actually shows the number that was clicked.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("filter");
  const [filter, setFilter] = useState(
    FILTERS.some(([key]) => key === requested) ? requested : "all"
  );
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState(null);
  const [dragOverColumn, setDragOverColumn] = useState(null);

  const todayKey = getTodayKey();

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
      await createTask(currentUser.uid, { title: title.trim(), dueDate, priority });
      setTitle("");
      setDueDate("");
      setPriority("medium");
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

    // Move the card first so the board feels immediate, then persist.
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? { ...item, status: nextStatus, completed: nextStatus === "done" }
          : item
      )
    );

    try {
      await setTaskStatus(currentUser.uid, task.id, nextStatus);
      setError("");
      loadTasks();
    } catch (updateError) {
      setError(updateError?.message || "Couldn't move that task.");
      loadTasks();
    }
  };

  const isOverdue = useCallback(
    (task) => Boolean(task.dueDate) && task.dueDate < todayKey && task.status !== "done",
    [todayKey]
  );

  const filteredTasks = useMemo(
    () =>
      tasks.filter((task) => {
        if (filter === "active") return task.status !== "done";
        if (filter === "done") return task.status === "done";
        if (filter === "overdue") return isOverdue(task);
        return true;
      }),
    [filter, isOverdue, tasks]
  );

  const tasksByStatus = useMemo(() => {
    const groups = { todo: [], progress: [], done: [] };

    filteredTasks.forEach((task) => {
      groups[groups[task.status] ? task.status : "todo"].push(task);
    });

    return groups;
  }, [filteredTasks]);

  const stats = useMemo(() => {
    const done = tasks.filter((task) => task.status === "done").length;

    return {
      total: tasks.length,
      done,
      active: tasks.length - done,
      overdue: tasks.filter(isOverdue).length,
      rate: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    };
  }, [isOverdue, tasks]);

  const handleDrop = (columnKey) => {
    setDragOverColumn(null);

    const task = tasks.find((item) => item.id === dragId);
    setDragId(null);

    if (task) updateTaskStatus(task, columnKey);
  };

  return (
    <section className="tasks-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-sub">
            {stats.active} active · {stats.done} done
            {stats.overdue ? ` · ${stats.overdue} overdue` : ""}
          </p>
        </div>

        <div className="tasks-toolbar">
          <ClearDataButton
            label="Clear tasks"
            noun="tasks"
            count={tasks.length}
            clear={clearTasks}
            onCleared={loadTasks}
          />
        </div>

        <div className="tasks-filter-row">
          {FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`chip ${filter === key ? "active" : ""}`}
              onClick={() => {
                setFilter(key);
                // Keep the address honest about what is on screen.
                if (key === "all") searchParams.delete("filter");
                else searchParams.set("filter", key);
                setSearchParams(searchParams, { replace: true });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {error ? <p className="page-error">{error}</p> : null}

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Total</span>
          <strong className="stat-value">{stats.total}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">Active</span>
          <strong className="stat-value">{stats.active}</strong>
        </div>
        <div className="stat">
          <span className="stat-label">Overdue</span>
          <strong className={`stat-value ${stats.overdue ? "is-negative" : ""}`}>
            {stats.overdue}
          </strong>
        </div>
        <div className="stat">
          <span className="stat-label">Completion</span>
          <strong className="stat-value">{stats.rate}%</strong>
          <div className="bar">
            <span style={{ width: `${stats.rate}%` }} />
          </div>
        </div>
      </div>

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
          <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
            {PRIORITIES.map((item) => (
              <option key={item} value={item}>
                {item[0].toUpperCase() + item.slice(1)} priority
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary" onClick={addTask}>
            <FiPlus /> Add
          </button>
        </div>
      </div>

      <div className="kanban-grid">
        {COLUMNS.map((column) => (
          <div
            key={column.key}
            className={`kanban-column ${dragOverColumn === column.key ? "is-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOverColumn(column.key);
            }}
            onDragLeave={() => setDragOverColumn((current) => (current === column.key ? null : current))}
            onDrop={() => handleDrop(column.key)}
          >
            <div className="column-title-row">
              <h3>
                {column.title}
                <span className="column-count">{tasksByStatus[column.key].length}</span>
              </h3>
            </div>

            <div className="column-list is-scrollable">
              {tasksByStatus[column.key].map((task) => {
                const overdue = isOverdue(task);

                return (
                  <article
                    key={task.id}
                    draggable
                    onDragStart={() => setDragId(task.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setDragOverColumn(null);
                    }}
                    className={`kanban-task ${task.status === "done" ? "task-done" : ""} ${
                      overdue ? "task-overdue" : ""
                    } ${dragId === task.id ? "is-dragging" : ""}`}
                  >
                    <div className="task-top">
                      <button
                        type="button"
                        className={`task-check ${task.status === "done" ? "checked" : ""}`}
                        aria-label={task.status === "done" ? "Mark active" : "Mark complete"}
                        onClick={() => updateTaskStatus(task, task.status === "done" ? "todo" : "done")}
                      >
                        ✓
                      </button>

                      <p className="task-title">{task.title}</p>

                      <button
                        type="button"
                        className="task-delete"
                        aria-label={`Delete ${task.title}`}
                        onClick={() => deleteTask(task.id)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>

                    <div className="task-meta">
                      <span className={`priority-tag priority-${task.priority}`}>{task.priority}</span>
                      {task.dueDate ? (
                        <span className={`date-badge ${overdue ? "due-overdue" : ""}`}>
                          {overdue ? "Overdue · " : ""}
                          {formatDueDate(task.dueDate)}
                        </span>
                      ) : (
                        <span className="date-badge is-undated">No due date</span>
                      )}
                    </div>

                    <div className="task-actions-row">
                      <select
                        value={task.status}
                        onChange={(e) => updateTaskStatus(task, e.target.value)}
                        aria-label={`Status for ${task.title}`}
                      >
                        {COLUMNS.map((item) => (
                          <option key={item.key} value={item.key}>
                            {item.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </article>
                );
              })}

              {tasksByStatus[column.key].length === 0 ? (
                <p className="empty-day">Nothing here</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default Tasks;
