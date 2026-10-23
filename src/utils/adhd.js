/**
 * ADHD mode: one day, three things, one at a time.
 *
 * Today's picks are task ids saved with the day they were picked for, so
 * yesterday's list never carries over by itself. Everything here is plain
 * data in and out; the page and the provider do the saving.
 */

export const MAX_PICKS = 3;

const PRIORITY = { high: 0, medium: 1, low: 2 };

export const isOpen = (task) => Boolean(task) && task.status !== "done" && !task.completed;

/**
 * Open tasks in the order "Pick for me" chooses from: things from earlier
 * first, then today's, then by priority, then the soonest date. Undated
 * tasks come after dated ones.
 */
export const rankTasks = (tasks, today) =>
  (tasks || []).filter(isOpen).sort((a, b) => {
    const urgency = (task) => (task.dueDate && task.dueDate < today ? 0 : task.dueDate === today ? 1 : 2);
    return (
      urgency(a) - urgency(b) ||
      (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1) ||
      (a.dueDate || "9999").localeCompare(b.dueDate || "9999") ||
      String(a.title || "").localeCompare(String(b.title || ""))
    );
  });

/** Fills the free slots with the top-ranked tasks not already picked. */
export const pickForMe = (tasks, today, picks = []) => {
  const kept = cleanPicks(picks);
  const extra = rankTasks(tasks, today)
    .map((task) => task.id)
    .filter((id) => !kept.includes(id));
  return [...kept, ...extra].slice(0, MAX_PICKS);
};

export const cleanPicks = (picks) =>
  [...new Set((Array.isArray(picks) ? picks : []).filter((id) => typeof id === "string" && id))].slice(0, MAX_PICKS);

/** The picks that apply today: none if they were made on another day. */
export const picksFor = (prefs, today) => (prefs?.day === today ? cleanPicks(prefs.picks) : []);

/**
 * Today's plan from the picks: the picked tasks that still exist, in order,
 * how many are done, and the one to do now (the first that isn't).
 */
export const todayPlan = (tasks, picks) => {
  const byId = new Map((tasks || []).map((task) => [task.id, task]));
  const picked = cleanPicks(picks).map((id) => byId.get(id)).filter(Boolean);
  const now = picked.find(isOpen) || null;
  return {
    picked,
    done: picked.filter((task) => !isOpen(task)).length,
    now,
    next: picked.filter((task) => isOpen(task) && task !== now),
  };
};

export const togglePick = (picks, id) => {
  const clean = cleanPicks(picks);
  if (clean.includes(id)) return clean.filter((item) => item !== id);
  return clean.length >= MAX_PICKS ? clean : [...clean, id];
};

/** Sends the current task to the back, so the next one comes up. */
export const swapNow = (picks, tasks) => {
  const plan = todayPlan(tasks, picks);
  if (!plan.now || !plan.next.length) return cleanPicks(picks);
  const clean = cleanPicks(picks);
  return [...clean.filter((id) => id !== plan.now.id), plan.now.id];
};

/** The step to show on the Now card: the first unticked one, if there are steps. */
export const currentStep = (task) => {
  const steps = Array.isArray(task?.subtasks) ? task.subtasks : [];
  const index = steps.findIndex((step) => !step.done);
  return index === -1 ? null : { step: steps[index], number: index + 1, total: steps.length };
};

/**
 * Things to do on a break that actually rest the brain: off the screen,
 * moving, small. Nothing that turns into another hour.
 */
export const BREAK_IDEAS = [
  "Drink a full glass of water.",
  "Stand up and stretch your arms over your head.",
  "Look out of a window at something far away.",
  "Walk to another room and back.",
  "Do ten slow breaths: in for 4, out for 6.",
  "Roll your shoulders and unclench your jaw.",
  "Tidy one small thing on your desk.",
  "Splash cold water on your face.",
  "Eat a piece of fruit or a handful of nuts.",
  "Put on one song you love and just listen.",
  "Step outside for a minute of fresh air.",
  "Shake out your hands and wiggle your toes.",
];

/** A different idea each break, steady within one break. */
export const breakIdea = (seed) => {
  const n = Math.abs(Math.floor(Number(seed) || 0));
  return BREAK_IDEAS[n % BREAK_IDEAS.length];
};

/** Kind words for coming back to something, instead of counting what was missed. */
export const gentleDue = (dueDate, today) => (dueDate && dueDate < today ? "From earlier" : dueDate === today ? "Today" : "");

/**
 * How much of the waking day is left, for people who lose track of time.
 * The day runs 7am to 11pm; outside that it says so kindly rather than
 * counting down to zero.
 */
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 23;

const hoursLabel = (minutes) => {
  const halves = Math.round(minutes / 30);
  const whole = Math.floor(halves / 2);
  return `${whole}${halves % 2 ? "½" : ""} h`;
};

export const dayLeft = (date = new Date()) => {
  const minutes = date.getHours() * 60 + date.getMinutes();
  const start = DAY_START_HOUR * 60;
  const end = DAY_END_HOUR * 60;
  const progress = Math.min(1, Math.max(0, (minutes - start) / (end - start)));
  const left = Math.max(0, end - minutes);
  if (minutes < start) return { progress, left, label: "Early. The day hasn't started yet." };
  if (left === 0) return { progress, left, label: "Late. Rest counts too." };
  if (left < 60) return { progress, left, label: `About ${left} min left today` };
  return { progress, left, label: `About ${hoursLabel(left)} left today` };
};
