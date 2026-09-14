/**
 * Every date key in U.Do is a local-time YYYY-MM-DD string.
 *
 * Do not build one with toISOString(): it converts to UTC first, so anywhere
 * ahead of UTC (IST is +05:30) a key made between midnight and the offset
 * lands on the previous day. That is how ticking a habit at 00:30 used to log
 * it against yesterday, and how the month calendar came out shifted by a day.
 */

export const toDateKey = (dateValue = new Date()) => {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const todayKey = () => toDateKey(new Date());

/**
 * Parses a date key back to local midnight. `new Date("2026-09-13")` on its own
 * is read as UTC midnight, which is the same bug in the other direction.
 */
export const fromDateKey = (dateKey) => new Date(`${dateKey}T00:00:00`);

/**
 * Milliseconds for any timestamp shape the app has ever written, or null when
 * there isn't one.
 *
 * Documents carry three shapes: an ISO string (Finance, Quick Capture), a
 * Firestore Timestamp (anything saved with `new Date()`, which Firestore
 * converts on write), and a plain Date. `new Date(timestamp)` on the Firestore
 * shape is an Invalid Date, which is how comparing them used to go NaN.
 */
export const toMillis = (value) => {
  if (!value) return null;

  // Firestore Timestamp, either live or rehydrated from JSON.
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  if (typeof value.seconds === "number") return value.seconds * 1000;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }

  if (typeof value === "number") return value;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

/** When a record was last touched, falling back through the shapes it may have. */
export const recordTimestamp = (record) =>
  toMillis(record?.updatedAt) ?? toMillis(record?.createdAt) ?? 0;

/* -------------------------------------------------------------------------
   Display forms.

   A date key is a storage format. It was being printed straight into the UI,
   where "2026-09-14" is both hard to read at a glance and — in the narrow date
   column of the Finance table — wide enough to wrap onto two lines mid-number.
   ------------------------------------------------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "14 Sep", carrying the year only when it isn't the current one. */
export const formatShortDate = (dateKey, today = new Date()) => {
  if (!dateKey) return "";
  const date = fromDateKey(dateKey);
  if (Number.isNaN(date.getTime())) return dateKey;

  const stem = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === today.getFullYear() ? stem : `${stem} ${date.getFullYear()}`;
};

/**
 * "Today" / "Tomorrow" / "Yesterday" where that is what the reader means, and
 * "Wed 16" otherwise. Used on pills, which have room for two words at most.
 */
export const formatRelativeDay = (dateKey, today = new Date()) => {
  if (!dateKey) return "";
  const date = fromDateKey(dateKey);
  if (Number.isNaN(date.getTime())) return dateKey;

  const days = Math.round((date - fromDateKey(toDateKey(today))) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";

  return `${WEEKDAYS[date.getDay()]} ${date.getDate()}`;
};

/** "Sun, 14 Sep 2026" — the unabbreviated form, for tooltips and titles. */
export const formatDayLabel = (dateKey) => {
  if (!dateKey) return "";
  const date = fromDateKey(dateKey);
  if (Number.isNaN(date.getTime())) return dateKey;

  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

/** The three-letter month for a key, for axis and column labels. */
export const monthLabel = (dateKey) => {
  const date = fromDateKey(dateKey);
  return Number.isNaN(date.getTime()) ? "" : MONTHS[date.getMonth()];
};
