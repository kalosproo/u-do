import { addDoc, deleteDoc, getDocs, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { taskDoc, tasksCollection } from "./paths";

export const normalizeTask = (rawTask) => {
  const status = rawTask.status || (rawTask.completed ? "done" : "todo");

  return {
    ...rawTask,
    dueDate: rawTask.dueDate || "",
    priority: rawTask.priority || "medium",
    status,
    completed: status === "done",
    createdAt: rawTask.createdAt || new Date(),
  };
};

export const fetchTasks = async (uid) => {
  const snapshot = await getDocs(tasksCollection(uid));
  return snapshot.docs.map((item) => normalizeTask({ id: item.id, ...item.data() }));
};

/** The subset the weekly auto-planner reads: pending tasks, trimmed to what the prompt needs. */
export const fetchPendingTaskSummaries = async (uid) => {
  const snapshot = await getDocs(tasksCollection(uid));

  return snapshot.docs
    .map((item) => item.data())
    .filter((task) => task.status !== "done" && !task.completed)
    .map((task) => ({
      title: task.title,
      dueDate: task.dueDate || "",
      priority: task.priority || "medium",
    }));
};

export const createTask = (uid, { title, dueDate = "", priority = "medium" }) =>
  addDoc(tasksCollection(uid), {
    title,
    dueDate,
    priority,
    status: "todo",
    completed: false,
    createdAt: new Date(),
  });

export const setTaskStatus = (uid, taskId, status) =>
  updateDoc(taskDoc(uid, taskId), { status, completed: status === "done" });

/** Edits the fields a task actually owns. Undefined fields are left alone. */
export const updateTask = (uid, taskId, changes) => {
  const patch = {};

  if (changes.title !== undefined) patch.title = String(changes.title).trim();
  // An empty string is meaningful here: it clears the due date back to none.
  if (changes.dueDate !== undefined) patch.dueDate = changes.dueDate || "";
  if (changes.priority !== undefined) patch.priority = changes.priority;
  if (changes.status !== undefined) {
    patch.status = changes.status;
    patch.completed = changes.status === "done";
  }

  return updateDoc(taskDoc(uid, taskId), patch);
};

export const deleteTask = (uid, taskId) => deleteDoc(taskDoc(uid, taskId));

/** Deletes every task for this account and nothing else. */
export const clearTasks = async (uid) => {
  const snapshot = await getDocs(tasksCollection(uid));
  const batch = writeBatch(db);

  snapshot.docs.forEach((item) => batch.delete(taskDoc(uid, item.id)));
  await batch.commit();

  return snapshot.size;
};
