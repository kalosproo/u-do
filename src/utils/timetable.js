/**
 * The class timetable: a weekly schedule of classes. `day` is 0 (Sunday) to
 * 6 (Saturday), as Date.getDay() counts; times are "HH:MM". Pure.
 */

export const WEEKDAYS = [
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
  { value: 0, short: "Sun", label: "Sunday" },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const minutesOf = (time) => {
  const [h, m] = String(time).split(":").map(Number);
  return h * 60 + m;
};

/** Returns an error message, or "" when the class is fine to save. */
export const validateClass = ({ subject, day, start, end, room = "" }) => {
  if (!String(subject || "").trim()) return "Add the subject.";
  if (String(subject).trim().length > 40) return "Keep the subject under 40 characters.";
  if (!Number.isInteger(day) || day < 0 || day > 6) return "Pick a day.";
  if (!TIME.test(start || "") || !TIME.test(end || "")) return "Add a start and end time.";
  if (minutesOf(end) <= minutesOf(start)) return "The class has to end after it starts.";
  if (String(room).length > 30) return "Keep the room under 30 characters.";
  return "";
};

/** Classes on one weekday, earliest first. */
export const classesOn = (classes, day) =>
  (classes || []).filter((c) => c.day === day).sort((a, b) => a.start.localeCompare(b.start));

/**
 * What's on now, or next: { cls, status: "now" | "next", minutes } where
 * minutes is how long until it ends (now) or starts (next), looking up to a
 * week ahead. null with no classes.
 */
export const currentOrNext = (classes, now = new Date()) => {
  if (!classes?.length) return null;
  const today = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const current = classesOn(classes, today).find((c) => minutesOf(c.start) <= nowMin && nowMin < minutesOf(c.end));
  if (current) return { cls: current, status: "now", minutes: minutesOf(current.end) - nowMin };

  for (let ahead = 0; ahead < 8; ahead += 1) {
    const day = (today + ahead) % 7;
    const next = classesOn(classes, day).find((c) => ahead > 0 || minutesOf(c.start) > nowMin);
    if (next) return { cls: next, status: "next", minutes: ahead * 1440 + minutesOf(next.start) - nowMin };
  }
  return null;
};

/** "in 45 min", "in 2h 10m", "tomorrow", "on Monday". */
export const describeWait = (minutes, cls, now = new Date()) => {
  if (minutes < 60) return `in ${minutes} min`;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (minutes + nowMin < 1440) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `in ${h}h${m ? ` ${m}m` : ""}`;
  }
  if (minutes + nowMin < 2880) return "tomorrow";
  return `on ${WEEKDAYS.find((d) => d.value === cls.day)?.label || ""}`;
};
