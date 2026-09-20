/**
 * When each reminder fires, as arithmetic.
 *
 * Deliberately free of Firebase, Firestore and the clock: every function here
 * takes minutes-past-midnight and plain objects and returns a decision. That is
 * what makes the rhythms testable — "every 30 minutes until done" quietly
 * becoming "every run forever", or an hourly nudge firing twice an hour, is
 * invisible in production until someone's phone is buzzing at them.
 *
 * The cadence is derived from the clock rather than from stored counters, so
 * nothing has to be written back per send and a missed run cannot leave someone
 * a rhythm behind.
 */

/** How often the scheduler wakes. Every rhythm below is a multiple of it. */
export const RUN_MINUTES = 30;

/** Matches DEFAULT_LEAD_MINUTES in the app; a task may override it. */
const DEFAULT_LEAD = 30;

export const minutesOf = (value, fallback) => {
  const [hour, minute] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return fallback;
  return hour * 60 + minute;
};

/**
 * How far into the window we are, or null when outside it.
 *
 * The modulo handles a window that crosses midnight (22:00 to 02:00), which is
 * a real thing someone will set — and which a naive start <= now <= end would
 * treat as always closed.
 */
export const windowOffset = (current, start, end) => {
  const elapsed = (current - start + 1440) % 1440;
  const length = (end - start + 1440) % 1440;
  return elapsed <= length ? elapsed : null;
};

const count = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

/** "in 30 minutes", "in 2 hours" — how far off the heads-up says it is. */
const describeLead = (task) => {
  const minutes = Number.isFinite(task.leadMinutes) ? task.leadMinutes : DEFAULT_LEAD;
  if (minutes < 60) return `in ${count(minutes, "minute", "minutes")}`;

  const hours = Math.round((minutes / 60) * 10) / 10;
  return `in ${count(hours, "hour", "hours")}`;
};

/**
 * Splits the day's open tasks into the ones worth a heads-up on this run and
 * the ones that are already due and should be nagging.
 *
 * A task with a time stays silent all morning — nothing should buzz about
 * something that is not due yet. A task without one behaves as it always has:
 * open from the moment the window does.
 */
const partitionTasks = (tasks, dayKey, current) => {
  const lead = [];
  const active = [];

  tasks.forEach((task) => {
    const due = minutesOf(task.dueTime, null);

    // Past its day, or never had a time: due as far as anyone is concerned.
    if (task.dueDate < dayKey || due === null) {
      active.push(task);
      return;
    }

    if (current >= due) {
      active.push(task);
      return;
    }

    const leadAt = due - (Number.isFinite(task.leadMinutes) ? task.leadMinutes : DEFAULT_LEAD);

    // A lead moment before midnight belongs to yesterday; skip it rather than
    // firing a heads-up at the top of the window for a task due at 00:15.
    if (leadAt >= 0 && current >= leadAt && current < leadAt + RUN_MINUTES) lead.push(task);
  });

  return { lead, active };
};

/**
 * What to send this run, given where we are in the window.
 *
 *   tasks    every run, while anything due or overdue is open
 *   habits   every hour, while any of the day's habits are unticked
 *   planner  once, at the start of the window
 *
 * Nothing outstanding sends nothing. A reminder reading "0 tasks" is the
 * fastest way to teach someone to turn reminders off.
 */
export const composeMessages = ({ tasks, habits, plans, dayKey }, types, offset, current = 0) => {
  const messages = [];
  const firstRun = offset < RUN_MINUTES;
  const onTheHour = offset % 60 < RUN_MINUTES;

  if (types?.tasks !== false) {
    const { lead, active } = partitionTasks(tasks, dayKey, current);

    if (lead.length > 0) {
      messages.push({
        title: "Coming up",
        body: lead.length === 1
          ? `${lead[0].title} — ${describeLead(lead[0])}.`
          : `${count(lead.length, "task", "tasks")} starting soon.`,
        url: "/tasks",
        // Its own tag: a heads-up and a nag are different facts, and one
        // should not silently replace the other in the same run.
        tag: "udo-task-lead",
      });
    }

    if (active.length > 0) {
      const overdue = active.filter((task) => task.dueDate < dayKey).length;
      // "Due now" is only true of a task whose time has actually arrived. An
      // undated-time task due today has been due all day and is not urgent
      // at 8am just because the window opened.
      const timeArrived = active.some((task) => task.dueTime && task.dueDate === dayKey);

      messages.push({
        title: overdue > 0 ? "Overdue" : timeArrived ? "Due now" : "Due today",
        body: active.length === 1
          ? active[0].title
          : `${count(active.length, "task", "tasks")} still open${overdue > 0 ? `, ${overdue} overdue` : ""}.`,
        url: "/tasks",
        tag: "udo-tasks",
      });
    }
  }

  if (types?.habits !== false && onTheHour && habits.length > 0) {
    messages.push({
      title: "Streak check",
      body: habits.length === 1
        ? `${habits[0].title} isn't ticked yet.`
        : `${count(habits.length, "habit", "habits")} not ticked yet.`,
      url: "/habits",
      tag: "udo-habits",
    });
  }

  if (types?.planner !== false && firstRun && plans.length > 0) {
    messages.push({
      title: "Today's plan",
      body: plans.length === 1
        ? plans[0].title
        : `${count(plans.length, "thing", "things")} planned for today.`,
      url: "/planner",
      tag: "udo-planner",
    });
  }

  return messages;
};
