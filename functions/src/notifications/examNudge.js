/**
 * The exam nudge: once a day, at the start of the reminder window, a push
 * about the nearest exam that is a week, three days, two days, a day or zero
 * days off — with how much focus time went to its subject in the last two
 * weeks, which is the part that makes it more than a calendar alert.
 *
 * Pure: plain objects in, a message (or null) out.
 */

/** Days off at which an exam is worth a nudge. Quiet in between. */
export const NUDGE_DAYS = [7, 3, 2, 1, 0];

const dayNumber = (key) => {
  const [y, m, d] = String(key).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};

export const daysBetween = (fromKey, toKey) => dayNumber(toKey) - dayNumber(fromKey);

/** The date key `days` before `dayKey`. */
export const shiftDay = (dayKey, days) => new Date((dayNumber(dayKey) + days) * 86_400_000).toISOString().slice(0, 10);

const formatMinutes = (minutes) => {
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole}m`;
  const h = Math.floor(whole / 60);
  const m = whole % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

/** Minutes logged against a subject, matched without regard to case or spacing. */
export const subjectMinutes = (focusDays, subject) => {
  const want = String(subject || "").trim().toLowerCase();
  if (!want) return 0;
  return (focusDays || []).reduce((sum, day) => {
    for (const [name, minutes] of Object.entries(day?.subjects || {})) {
      if (name.trim().toLowerCase() === want) sum += Number(minutes) || 0;
    }
    return sum;
  }, 0);
};

const when = (days) => (days === 0 ? "is today" : days === 1 ? "is tomorrow" : `is in ${days} days`);

export const composeExamNudge = ({ exams, focusDays, dayKey }) => {
  const due = (exams || [])
    .map((exam) => ({ ...exam, days: daysBetween(dayKey, exam.date) }))
    .filter((exam) => NUDGE_DAYS.includes(exam.days))
    .sort((a, b) => a.days - b.days || String(a.title).localeCompare(String(b.title)));

  if (due.length === 0) return null;

  const [next] = due;
  const others = due.length - 1;
  const studied = subjectMinutes(focusDays, next.subject);

  let detail;
  if (next.days === 0) detail = "Good luck — you've got this.";
  else if (next.subject && studied > 0) detail = `${formatMinutes(studied)} on ${next.subject} in the last two weeks.`;
  else if (next.subject) detail = `No ${next.subject} focus time logged yet — start a session?`;
  else detail = "Time for a focus session?";

  return {
    title: `${next.title} ${when(next.days)}`,
    body: others > 0 ? `${detail} Plus ${others} more coming up.` : detail,
    url: "/focus",
    tag: "udo-exams",
  };
};
