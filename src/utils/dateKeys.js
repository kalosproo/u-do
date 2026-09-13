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
