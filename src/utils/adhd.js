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

const millisOf = (time) => (typeof time?.toMillis === "function" ? time.toMillis() : Number(time) || 0);

/**
 * Whether this device's copy of the prefs beats the one the server sent: only
 * when a change made here never reached the server (the app closed with no
 * signal, say) and no other device has saved since.
 */
export const keepLocalPrefs = (local, server) =>
  Boolean(local?.unsynced) && (Number(local.editedAt) || 0) > millisOf(server?.updatedAt);

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
/** Before this hour it's still last night, for the day track and for picks. */
export const DAY_TURNS_AT = 5;

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
  // Past midnight is still last night, not an early morning.
  if (minutes < DAY_TURNS_AT * 60) return { progress: 1, left: 0, label: "Late. Rest counts too." };
  if (minutes < start) return { progress, left, label: "Early. The day hasn't started yet." };
  if (left === 0) return { progress, left, label: "Late. Rest counts too." };
  if (left < 60) return { progress, left, label: `About ${left} min left today` };
  return { progress, left, label: `About ${hoursLabel(left)} left today` };
};

/** The only three answers to "when?" in ADHD mode. */
export const WHEN = [
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["someday", "Someday"],
];

const keyOf = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * The day today's picks belong to. It turns over at 5am, not midnight, so
 * three things picked late at night are still there at half past twelve.
 */
export const planDay = (now = new Date()) =>
  keyOf(now.getHours() < DAY_TURNS_AT ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1) : now);

/** The due date a "when" stands for: today's key, tomorrow's, or none. */
export const dueFor = (when, now = new Date()) => {
  if (when === "today") return keyOf(now);
  if (when === "tomorrow") return keyOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  return "";
};

const doneAt = (task) => {
  const value = task.completedAt;
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

/**
 * Tasks in the three places ADHD mode keeps them: today (anything due today
 * or before), coming up (dated later), someday (no date). Plus the most
 * recently finished, newest first.
 */
export const groupTasks = (tasks, today) => {
  const open = (tasks || []).filter(isOpen);
  const byDate = (a, b) =>
    (a.dueDate || "").localeCompare(b.dueDate || "") || (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1);
  return {
    today: open.filter((task) => task.dueDate && task.dueDate <= today).sort(byDate),
    soon: open.filter((task) => task.dueDate && task.dueDate > today).sort(byDate),
    someday: open.filter((task) => !task.dueDate),
    done: (tasks || []).filter((task) => !isOpen(task)).sort((a, b) => doneAt(b) - doneAt(a)).slice(0, 20),
  };
};

/** Only ever good news: a run worth mentioning, or nothing at all. */
export const streakWords = (streak, frequency = "daily") => {
  if (!(streak >= 2)) return "";
  return `${streak} ${frequency === "weekly" ? "weeks" : "days"} in a row`;
};

/** Sent after a quick add, so whatever list is on screen reads itself again. */
export const TASKS_CHANGED = "udo:tasks-changed";

/**
 * Getting started is the hard part. For a task with no steps yet, three
 * tiny first moves that fit what it's about, so "where do I even begin?"
 * has an answer one tap away. Checked in order: the first kind that fits wins.
 */
const FIRST_STEPS = [
  [/\b(revise|revision|study|exams?|tests?|quiz|homework|worksheet|questions?|maths?|physics|chemistry|biology|practice|learn)\b/, ["Get your notes and a pen out", "Do only the first question", "Set a ten-minute timer"]],
  [/\b(write|writing|essay|report|assignment|draft|story|letter|blog|intro|summary)\b/, ["Open a blank page and type the title", "Write one messy sentence", "List three points to cover"]],
  [/\b(call|phone|ring)\b/, ["Find the number", "Write down the one thing to say", "Press call"]],
  [/\b(e-?mail|reply|message|text|dm|whatsapp|respond)\b/, ["Open the conversation", "Write just the first line", "Send it, even if it's short"]],
  [/\b(appointment|dentist|doctor|form|apply|application|booking)\b|\bbook (a|an|the)\b/, ["Find the website or the number", "Get the details you'll need ready", "Do just the first step"]],
  [/\b(return|post|drop off|pick up|collect|deliver)\b/, ["Put it by the door now", "Check when it's open", "Go while you remember"]],
  [/\b(read|reading|chapter|book|article|pages?)\b/, ["Open it to the right page", "Read one page", "Note one thing you learned"]],
  [/\b(clean|tidy|laundry|dishes|wash|organi[sz]e|declutter|room|desk)\b/, ["Put on one song", "Clear one small surface", "Put five things away"]],
  [/\b(buy|shop|shopping|order|groceries|pay|bill|renew|subscription)\b/, ["Open the website or app", "Add it to the basket", "Pay, and it's done"]],
  [/\b(gym|run|walk|exercise|workout|yoga|stretch|swim)\b/, ["Put your shoes on", "Do five minutes, then decide", "Fill your water bottle"]],
];
const ANY_FIRST_STEPS = ["Get what you need in front of you", "Do the first two minutes", "Decide what \"done\" looks like"];

export const firstSteps = (title = "") => {
  const text = String(title).toLowerCase();
  return (FIRST_STEPS.find(([pattern]) => pattern.test(text)) || [null, ANY_FIRST_STEPS])[1];
};

/**
 * Days in a row with at least one thing done: a task finished, a habit
 * ticked or a minute of focus. Nothing yet today doesn't break it, the day
 * isn't over; it just isn't counted until something happens. Only ever good
 * news, so a gap simply starts the count again from nothing.
 */
export const dayRun = ({ tasks = [], habits = [], focusLog = {} } = {}, now = new Date()) => {
  const active = new Set();
  for (const task of tasks) {
    const at = isOpen(task) ? 0 : doneAt(task);
    if (at) active.add(keyOf(new Date(at)));
  }
  for (const habit of habits) for (const [key, done] of Object.entries(habit?.logs || {})) if (done) active.add(key);
  for (const [key, entry] of Object.entries(focusLog || {})) if ((Number(entry?.minutes) || 0) >= 1) active.add(key);
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const today = active.has(keyOf(day));
  if (!today) day.setDate(day.getDate() - 1);
  let days = 0;
  while (active.has(keyOf(day))) {
    days += 1;
    day.setDate(day.getDate() - 1);
  }
  return { days, today };
};
