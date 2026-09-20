import { addDoc, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { taskDoc, tasksCollection } from "./paths";
import { EMPTY_REPEAT, isRepeating, nextOccurrence, normalizeRepeat } from "../utils/recurrence";

/** Minutes of warning before a timed task is due. */
export const DEFAULT_LEAD_MINUTES = 30;

const cleanTime = (value) => (/^\d{2}:\d{2}$/.test(String(value || "")) ? value : "");

const cleanLead = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1440
    ? Math.round(parsed)
    : DEFAULT_LEAD_MINUTES;
};

export const normalizeTask = (rawTask) => {
  const status = rawTask.status || (rawTask.completed ? "done" : "todo");

  return {
    ...rawTask,
    dueDate: rawTask.dueDate || "",
    // Optional, and empty is the normal case. A task with a date but no time
    // is a thing due "today", not a thing due at midnight.
    dueTime: cleanTime(rawTask.dueTime),
    leadMinutes: cleanLead(rawTask.leadMinutes),
    repeat: normalizeRepeat(rawTask.repeat),
    seriesId: rawTask.seriesId || null,
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

const newSeriesId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
};

export const createTask = (uid, {
  title,
  dueDate = "",
  dueTime = "",
  priority = "medium",
  leadMinutes = DEFAULT_LEAD_MINUTES,
  repeat = EMPTY_REPEAT,
}) => {
  const rule = normalizeRepeat(repeat);

  return addDoc(tasksCollection(uid), {
    title,
    dueDate,
    dueTime: cleanTime(dueTime),
    priority,
    leadMinutes: cleanLead(leadMinutes),
    repeat: rule,
    // Only a repeating task belongs to a series. Everything else stays null,
    // so a one-off never looks like an orphaned occurrence.
    seriesId: isRepeating(rule) ? newSeriesId() : null,
    status: "todo",
    completed: false,
    createdAt: new Date(),
  });
};

/**
 * Creates the occurrence that follows a completed one.
 *
 * The id is derived from the series and the date rather than generated, so
 * completing the same task twice — a double tap, a retried write, two tabs —
 * lands on the same document instead of stacking duplicates. The doc is read
 * first so an occurrence that already exists is never reset to "todo".
 *
 * Missed occurrences are not backfilled. Skipping three weeks leaves one
 * overdue task nagging, which is the point, rather than three identical rows
 * to dismiss.
 */
const spawnNextOccurrence = async (uid, task) => {
  const rule = normalizeRepeat(task?.repeat);
  if (!isRepeating(rule) || !task?.dueDate) return null;

  const dueDate = nextOccurrence(task.dueDate, rule);
  if (!dueDate) return null;

  const seriesId = task.seriesId || newSeriesId();
  const ref = doc(tasksCollection(uid), `${seriesId}_${dueDate}`);

  const existing = await getDoc(ref);
  if (existing.exists()) return null;

  const next = {
    title: task.title,
    dueDate,
    dueTime: cleanTime(task.dueTime),
    priority: task.priority || "medium",
    leadMinutes: cleanLead(task.leadMinutes),
    repeat: rule,
    seriesId,
    status: "todo",
    completed: false,
    createdAt: new Date(),
  };

  await setDoc(ref, next);
  return { id: ref.id, ...next };
};

/**
 * Moves a task between columns, and rolls a repeating one forward.
 *
 * Takes the task rather than its id because finishing a repeat needs its rule
 * and its date, and every caller already has the object in hand.
 */
export const setTaskStatus = async (uid, task, status) => {
  const taskId = typeof task === "string" ? task : task.id;

  await updateDoc(taskDoc(uid, taskId), { status, completed: status === "done" });

  if (status !== "done" || typeof task === "string") return { next: null };

  try {
    return { next: await spawnNextOccurrence(uid, task) };
  } catch {
    // The task is already ticked. Failing to queue the next one must not make
    // it look as though the tick itself failed.
    return { next: null };
  }
};

/** Edits the fields a task actually owns. Undefined fields are left alone. */
export const updateTask = (uid, taskId, changes) => {
  const patch = {};

  if (changes.title !== undefined) patch.title = String(changes.title).trim();
  // An empty string is meaningful here: it clears the due date back to none.
  if (changes.dueDate !== undefined) patch.dueDate = changes.dueDate || "";
  if (changes.dueTime !== undefined) patch.dueTime = cleanTime(changes.dueTime);
  if (changes.leadMinutes !== undefined) patch.leadMinutes = cleanLead(changes.leadMinutes);
  if (changes.priority !== undefined) patch.priority = changes.priority;

  if (changes.repeat !== undefined) {
    const rule = normalizeRepeat(changes.repeat);
    patch.repeat = rule;
    // Turning repeat on for a task that never had it needs a series to hang
    // its future occurrences from.
    if (isRepeating(rule) && !changes.seriesId) patch.seriesId = newSeriesId();
    if (!isRepeating(rule)) patch.seriesId = null;
  }

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
