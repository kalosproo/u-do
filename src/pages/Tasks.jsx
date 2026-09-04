import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  updateDoc,
} from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../services/firebase";

const KANBAN_COLUMNS = [
  { key: "todo", title: "To Do" },
  { key: "progress", title: "In Progress" },
  { key: "done", title: "Done" },
];

function normalizeTask(rawTask) {
  const status = rawTask.status || (rawTask.completed ? "done" : "todo");

  return {
    ...rawTask,
    dueDate: rawTask.dueDate || "",
    priority: rawTask.priority || "medium",
    status,
    completed: status === "done",
    createdAt: rawTask.createdAt || new Date(),
  };
}

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

  const user = auth.currentUser;
  const navigate = useNavigate();

  const fetchTasks = useCallback(async () => {
    if (!user) return;

    const querySnapshot = await getDocs(collection(db, "users", user.uid, "tasks"));

    const taskList = querySnapshot.docs.map((taskDoc) =>
      normalizeTask({
        id: taskDoc.id,
        ...taskDoc.data(),
      })
    );

    setTasks(taskList);
  }, [user]);

  const addTask = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");
    if (!title.trim()) return;

    await addDoc(collection(db, "users", currentUser.uid, "tasks"), {
      title: title.trim(),
      dueDate,
      priority,
      status: "todo",
      completed: false,
      createdAt: new Date(),
    });

    setTitle("");
    setDueDate("");
    setPriority("medium");
    fetchTasks();
  };

  const deleteTask = async (id) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");
    await deleteDoc(doc(db, "users", currentUser.uid, "tasks", id));
    fetchTasks();
  };

  const updateTaskStatus = async (task, nextStatus) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");

    await updateDoc(doc(db, "users", currentUser.uid, "tasks", task.id), {
      status: nextStatus,
      completed: nextStatus === "done",
    });

    fetchTasks();
  };

  const toggleCompleted = async (task) => {
    const nextStatus = task.status === "done" ? "todo" : "done";
    await updateTaskStatus(task, nextStatus);
  };

  useEffect(() => {
    if (!user) return;

    const timer = setTimeout(() => {
      fetchTasks();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchTasks, user]);

  const todayKey = new Date().toISOString().slice(0, 10);

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

        <button onClick={addTask}>Add</button>
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
            className={`filter-pill ${filter === key ? "active" : ""}`}
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
