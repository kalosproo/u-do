import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { todayKey as getTodayKey } from "../utils/dateKeys";
import {
  createTask,
  deleteTask as deleteTaskDoc,
  fetchTasks,
  setTaskStatus,
} from "../services/tasks";

const KANBAN_COLUMNS = [
  { key: "todo", title: "To Do" },
  { key: "progress", title: "In Progress" },
  { key: "done", title: "Done" },
];

function formatDueDate(value) {
  if (!value) return "No due date";

  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  const { user } = useAuth();
  const requireUser = useAuthGuard();

  const loadTasks = useCallback(async () => {
    if (!user) return;

    try {
      setTasks(await fetchTasks(user.uid));
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "Couldn't load your tasks.");
    }
  }, [user]);

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
    if (!currentUser) return;

    try {
      await setTaskStatus(currentUser.uid, task.id, nextStatus);
      setError("");
      loadTasks();
    } catch (updateError) {
      setError(updateError?.message || "Couldn't update that task.");
    }
  };

  const toggleCompleted = async (task) => {
    const nextStatus = task.status === "done" ? "todo" : "done";
    await updateTaskStatus(task, nextStatus);
  };

  // Deferred a tick: loading sets state, and React warns about doing that
  // synchronously inside an effect. Every page in the app loads this way.
  useEffect(() => {
    const timer = setTimeout(loadTasks, 0);
    return () => clearTimeout(timer);
  }, [loadTasks]);

  const todayKey = getTodayKey();

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const isDone = task.status === "done";
      const isOverdue = Boolean(task.dueDate) && task.dueDate < todayKey && !isDone;

      if (filter === "active") return !isDone;
      if (filter === "done") return isDone;
      if (filter === "overdue") return isOverdue;
      return true;
    });
  }, [filter, tasks, todayKey]);

  const tasksByStatus = useMemo(() => {
    const groups = {
      todo: [],
      progress: [],
      done: [],
    };

    filteredTasks.forEach((task) => {
      const normalizedStatus = groups[task.status] ? task.status : "todo";
      groups[normalizedStatus].push(task);
    });

    return groups;
  }, [filteredTasks]);

  const stats = useMemo(() => {
    const done = tasks.filter((task) => task.status === "done").length;
    const active = tasks.length - done;
    const overdue = tasks.filter(
      (task) => task.status !== "done" && task.dueDate && task.dueDate < todayKey
    ).length;

    return {
      total: tasks.length,
      done,
      active,
      overdue,
    };
  }, [tasks, todayKey]);

  return (
    <section className="tasks-page">
      <header className="tasks-header glass-panel">
        <h2>Tasks</h2>
        {error ? <p className="page-error">{error}</p> : null}
      </header>

      <div className="tasks-controls glass-panel">
        <input
          placeholder="Enter new task..."
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />

        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="low">Low Priority</option>
          <option value="medium">Medium Priority</option>
          <option value="high">High Priority</option>
        </select>

        <button className="button-primary" onClick={addTask}>Add</button>
      </div>

      <div className="tasks-filter-row">
        {[
          ["all", "All"],
          ["active", "Active"],
          ["done", "Completed"],
          ["overdue", "Overdue"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`filter-pill button-secondary ${filter === key ? "active" : ""}`}
            onClick={() => setFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="kanban-grid">
        {KANBAN_COLUMNS.map((column) => (
          <div key={column.key} className="kanban-column glass-panel">
            <div className="column-title-row">
              <h3>{column.title}</h3>
              <span>{tasksByStatus[column.key].length}</span>
            </div>

            <div className="column-list">
              {tasksByStatus[column.key].map((task) => {
                const isDone = task.status === "done";
                const isOverdue = Boolean(task.dueDate) && task.dueDate < todayKey && !isDone;

                return (
                  <article
                    key={task.id}
                    className={`kanban-task ${isDone ? "task-done" : ""} ${
                      isOverdue ? "task-overdue" : ""
                    }`}
                  >
                    <div className="task-top">
                      <p>{task.title}</p>
                      <button className="task-delete" onClick={() => deleteTask(task.id)}>
                        ×
                      </button>
                    </div>

                    <div className="task-meta">
                      <small>{formatDueDate(task.dueDate)}</small>
                      <small className="priority-tag">{task.priority}</small>
                    </div>

                    <div className="task-actions-row">
                      <button
                        onClick={() => {
                          if (task.status === "progress") updateTaskStatus(task, "todo");
                          if (task.status === "done") updateTaskStatus(task, "progress");
                        }}
                        disabled={task.status === "todo"}
                      >
                        ←
                      </button>

                      <select
                        value={task.status}
                        onChange={(e) => updateTaskStatus(task, e.target.value)}
                      >
                        <option value="todo">To Do</option>
                        <option value="progress">In Progress</option>
                        <option value="done">Done</option>
                      </select>

                      <button
                        onClick={() => {
                          if (task.status === "todo") updateTaskStatus(task, "progress");
                          if (task.status === "progress") updateTaskStatus(task, "done");
                        }}
                        disabled={task.status === "done"}
                      >
                        →
                      </button>
                    </div>

                    <button className="task-complete" onClick={() => toggleCompleted(task)}>
                      {isDone ? "Mark Active" : "Mark Complete"}
                    </button>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <aside className="tasks-stats glass-panel">
        <h3>Task Stats</h3>
        <div>
          <span>Total</span>
          <strong>{stats.total}</strong>
        </div>
        <div>
          <span>Active</span>
          <strong>{stats.active}</strong>
        </div>
        <div>
          <span>Completed</span>
          <strong>{stats.done}</strong>
        </div>
        <div>
          <span>Overdue</span>
          <strong>{stats.overdue}</strong>
        </div>
      </aside>
    </section>
  );
}

export default Tasks;
