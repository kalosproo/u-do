import { toDateKey } from "./dateKeys.js";

/**
 * The friends leaderboard: focus minutes this week, Monday to Sunday.
 */

/** The Monday that starts the week holding `date`, as a date key. */
export const weekKeyOf = (date = new Date()) => {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return toDateKey(monday);
};

/** Minutes logged from Monday up to and including `date`. */
export const weekMinutes = (log, date = new Date()) => {
  const start = weekKeyOf(date);
  const end = toDateKey(date);
  return Object.entries(log || {}).reduce(
    (sum, [key, day]) => (key >= start && key <= end ? sum + (Number(day?.minutes) || 0) : sum),
    0
  );
};

/**
 * Ranks people by minutes, most first. A stale week counts as zero, so last
 * week's champion does not sit on top all of Monday.
 */
export const rankWeek = (people, weekKey) =>
  people
    .map((person) => ({ ...person, minutes: person.week === weekKey ? Math.round(person.minutes || 0) : 0 }))
    .sort((a, b) => b.minutes - a.minutes || String(a.name).localeCompare(String(b.name)))
    .map((person, index, list) => ({
      ...person,
      // Ties share a place: 1, 2, 2, 4.
      rank: index > 0 && list[index - 1].minutes === person.minutes ? null : index + 1,
    }))
    .map((person, index, list) => {
      if (person.rank !== null) return person;
      let i = index;
      while (list[i].rank === null) i -= 1;
      return { ...person, rank: list[i].rank };
    });
