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
export const composeMessages = ({ tasks, habits, plans, dayKey }, types, offset) => {
  const messages = [];
  const firstRun = offset < RUN_MINUTES;
  const onTheHour = offset % 60 < RUN_MINUTES;

  if (types?.tasks !== false && tasks.length > 0) {
    const overdue = tasks.filter((task) => task.dueDate < dayKey).length;

    messages.push({
      title: overdue > 0 ? "Overdue" : "Due today",
      body: tasks.length === 1
        ? tasks[0].title
        : `${count(tasks.length, "task", "tasks")} still open${overdue > 0 ? `, ${overdue} overdue` : ""}.`,
      url: "/tasks",
      tag: "udo-tasks",
    });
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
