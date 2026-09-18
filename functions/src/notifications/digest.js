import { onSchedule } from "firebase-functions/v2/scheduler";

import { db } from "../firebaseAdmin.js";
import { sendToSubscription } from "./send.js";

/**
 * The scheduled reminders.
 *
 * Runs every half hour and sends to whoever's chosen time falls inside the
 * window that just opened. The alternative — storing a precomputed UTC firing
 * minute and querying it directly — is cheaper, and wrong twice a year: an
 * offset saved in January is an hour out in July anywhere that observes DST,
 * and the drifted row simply stops matching the query, so the reminder fails
 * silently and nothing reports it. Deriving the local time from the stored IANA
 * zone on every run cannot drift.
 *
 * The cost is one read per enabled subscription per run. At this size that is
 * nothing. If it ever stops being nothing, the fix is to shard by stored zone
 * rather than to go back to a frozen offset.
 */

const WINDOW_MINUTES = 30;

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

/** The local calendar day, as the app writes it on a task's dueDate. */
const localDateKey = (instant, timeZone) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);

const parseChosen = (time) => {
  const [hour, minute] = String(time || "08:00").split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 8 * 60;
  return hour * 60 + minute;
};

/**
 * True when the chosen minute sits inside the window that just opened.
 *
 * The comparison wraps, because a run at 23:45 covers a window that ends at
 * 00:15 the next day — without this, anyone who picks a time in that quarter
 * hour never hears from us.
 */
const isDue = (chosen, current) => {
  const delta = (chosen - current + 1440) % 1440;
  return delta < WINDOW_MINUTES;
};

const countdown = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

/** Tasks due today that aren't done, and habits not yet ticked today. */
const gatherWork = async (uid, dayKey) => {
  const [taskSnap, habitSnap] = await Promise.all([
    db.collection("users").doc(uid).collection("tasks").where("dueDate", "==", dayKey).get(),
    db.collection("users").doc(uid).collection("habits").get(),
  ]);

  const tasks = taskSnap.docs
    .map((entry) => entry.data())
    .filter((task) => task.status !== "done" && task.completed !== true);

  const habits = habitSnap.docs
    .map((entry) => entry.data())
    .filter((habit) => {
      const logs = habit.logs || habit.completedDays || {};
      return logs[dayKey] !== true;
    });

  return { tasks, habits };
};

/**
 * What to send, or null when there is nothing worth interrupting someone for.
 *
 * A reminder that says "you have 0 tasks" is the fastest way to teach a person
 * to turn reminders off, so an empty day sends nothing at all.
 */
const composeMessages = ({ tasks, habits }, types) => {
  const wantsDigest = types?.digest !== false;
  const wantsTasks = types?.tasks !== false;
  const wantsHabits = types?.habits !== false;

  if (wantsDigest) {
    const parts = [];
    if (wantsTasks && tasks.length > 0) parts.push(countdown(tasks.length, "task", "tasks"));
    if (wantsHabits && habits.length > 0) parts.push(countdown(habits.length, "habit", "habits"));
    if (parts.length === 0) return [];

    return [{
      title: "Today on U.Do",
      body: `${parts.join(" and ")} still open.`,
      url: tasks.length >= habits.length ? "/tasks" : "/habits",
      tag: "udo-digest",
    }];
  }

  const messages = [];

  if (wantsTasks && tasks.length > 0) {
    messages.push({
      title: "Due today",
      body: tasks.length === 1
        ? tasks[0].title
        : `${countdown(tasks.length, "task", "tasks")} due today.`,
      url: "/tasks",
      tag: "udo-tasks",
    });
  }

  if (wantsHabits && habits.length > 0) {
    messages.push({
      title: "Streak check",
      body: habits.length === 1
        ? `${habits[0].title} isn't ticked yet.`
        : `${countdown(habits.length, "habit", "habits")} not ticked yet.`,
      url: "/habits",
      tag: "udo-habits",
    });
  }

  return messages;
};

export const sendScheduledReminders = onSchedule(
  { schedule: "every 30 minutes", timeZone: "Etc/UTC", timeoutSeconds: 300 },
  async () => {
    const now = new Date();
    const snapshot = await db
      .collection("pushSubscriptions")
      .where("enabled", "==", true)
      .get();

    let considered = 0;
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

      if (!isDue(parseChosen(subscription.time), current)) continue;
      considered += 1;

      try {
        const work = await gatherWork(subscription.uid, localDateKey(now, timeZone));
        const messages = composeMessages(work, subscription.types);

        for (const message of messages) {
          const result = await sendToSubscription(subscription, message);
          sent += result.sent;
        }
      } catch (error) {
        console.error(`sendScheduledReminders: ${subscription.uid} failed`, error);
      }
    }

    console.log(`sendScheduledReminders: ${considered} due, ${sent} notifications sent`);
  },
);
