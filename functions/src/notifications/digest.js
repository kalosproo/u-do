import { onSchedule } from "firebase-functions/v2/scheduler";

import { db } from "../firebaseAdmin.js";
import { sendToSubscription } from "./send.js";
import { composeMessages, minutesOf, RUN_MINUTES, windowOffset } from "./cadence.js";

/**
 * The scheduled reminders.
 *
 * Three rhythms, because the things being reminded about are not alike. A task
 * that is overdue wants nagging; a plan for the day wants telling once. When
 * each one fires lives in cadence.js, which is pure arithmetic and tested as
 * such; this file is the part that talks to Firestore.
 *
 * All of it inside a window the person sets. Repeating reminders with no end
 * time is a notification at 3am and an app whose notifications get blocked.
 *
 * Local time comes from each person's stored IANA zone, recomputed every run.
 * A precomputed UTC firing minute would be cheaper and wrong twice a year — a
 * row that drifts across a DST change stops matching its own query, so the
 * reminder fails silently and nothing reports it.
 */

const OVERDUE_SCAN_LIMIT = 50;

/** Minutes past local midnight, for a real instant in a named zone. */
const localMinutes = (instant, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instant);

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
};

/** The local calendar day, in the form the app writes on dueDate and date. */
const localDateKey = (instant, timeZone) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

/** Tasks due today or overdue, habits unticked today, plans for today. */
const gatherWork = async (uid, dayKey, wanted) => {
  const workspace = db.collection("users").doc(uid);

  const [taskSnap, habitSnap, planSnap] = await Promise.all([
    // Both bounds on dueDate, so the empty string a task with no due date
    // carries is excluded by the query rather than after it. Without the lower
    // bound the implicit ordering puts those first and the row cap fills with
    // them, hiding the overdue tasks this is for.
    wanted.tasks
      ? workspace.collection("tasks")
          .where("dueDate", ">", "")
          .where("dueDate", "<=", dayKey)
          .limit(OVERDUE_SCAN_LIMIT)
          .get()
      : null,
    wanted.habits ? workspace.collection("habits").get() : null,
    wanted.planner
      ? workspace.collection("planner").where("date", "==", dayKey).get()
      : null,
  ]);

  const tasks = (taskSnap?.docs || [])
    .map((entry) => entry.data())
    .filter((task) => task.status !== "done" && task.completed !== true);

  const habits = (habitSnap?.docs || [])
    .map((entry) => entry.data())
    .filter((habit) => (habit.logs || habit.completedDays || {})[dayKey] !== true);

  const plans = (planSnap?.docs || [])
    .map((entry) => entry.data())
    .filter((plan) => plan.completed !== true);

  return { tasks, habits, plans, dayKey };
};

export const sendScheduledReminders = onSchedule(
  { schedule: "every 30 minutes", timeZone: "Etc/UTC", timeoutSeconds: 540 },
  async () => {
    const now = new Date();
    const snapshot = await db
      .collection("pushSubscriptions")
      .where("enabled", "==", true)
      .get();

    let active = 0;
    let sent = 0;

    for (const entry of snapshot.docs) {
      const subscription = { uid: entry.id, ...entry.data() };
      const timeZone = subscription.timeZone || "Asia/Kolkata";

      let current;
      try {
        current = localMinutes(now, timeZone);
      } catch {
        // An unknown zone must not take down everyone else's reminders.
        console.error(`sendScheduledReminders: bad timeZone for ${subscription.uid}`, timeZone);
        continue;
      }

      // `time` is what the single-time version stored; it becomes the start.
      const start = minutesOf(subscription.start || subscription.time, 8 * 60);
      const end = minutesOf(subscription.end, 21 * 60);
      const offset = windowOffset(current, start, end);

      if (offset === null) continue;
      active += 1;

      const types = subscription.types || {};
      const wanted = {
        tasks: types.tasks !== false,
        habits: types.habits !== false,
        planner: types.planner !== false && offset < RUN_MINUTES,
      };

      // Nothing this person wants can fire on this run — skip the reads.
      if (!wanted.tasks && !wanted.habits && !wanted.planner) continue;

      try {
        const work = await gatherWork(subscription.uid, localDateKey(now, timeZone), wanted);

        for (const message of composeMessages(work, types, offset, current)) {
          const result = await sendToSubscription(subscription, message);
          sent += result.sent;
        }
      } catch (error) {
        console.error(`sendScheduledReminders: ${subscription.uid} failed`, error);
      }
    }

    console.log(`sendScheduledReminders: ${active} in window, ${sent} notifications sent`);
  },
);
