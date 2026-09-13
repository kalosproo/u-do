import { addDoc, deleteDoc, getDocs, updateDoc } from "firebase/firestore";
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

export const deleteTask = (uid, taskId) => deleteDoc(taskDoc(uid, taskId));
