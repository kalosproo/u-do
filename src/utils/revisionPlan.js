/**
 * The revision planner: spreads chapters evenly across the days before an
 * exam, keeping the last day free for a full revision. Pure.
 */

export const MAX_CHAPTERS = 40;

const dayNumber = (key) => {
  const [y, m, d] = String(key).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
};
const keyOf = (n) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** One chapter per line; blank lines and duplicates dropped, capped. */
export const parseChapters = (text) => {
  const seen = new Set();
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim().slice(0, 80))
    .filter((line) => {
      const key = line.toLowerCase();
      if (!line || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CHAPTERS);
};

/**
 * Returns { items: [{ date, title }], error }. Days run from `startKey` up to
 * the day before the exam; with `reviewDay` the last of those is kept for a
 * full revision. More chapters than days doubles them up, spread so no day
 * carries more than one extra.
 */
export const revisionPlan = ({ chapters, startKey, examKey, examTitle, reviewDay = true }) => {
  const list = (chapters || []).filter(Boolean);
  if (!list.length) return { items: [], error: "Add at least one chapter." };

  const first = dayNumber(startKey);
  const last = dayNumber(examKey) - 1;
  const total = last - first + 1;
  if (!(total >= 1)) return { items: [], error: "The exam is too soon to plan revision before it." };

  const review = reviewDay && total >= 2;
  const days = review ? total - 1 : total;
  const label = examTitle ? ` · ${examTitle}` : "";

  const items = list.map((chapter, index) => {
    // Evenly spaced: chapter i lands on day floor(i * days / n).
    const offset = Math.floor((index * days) / list.length);
    return { date: keyOf(first + offset), title: `Revise ${chapter}${label}`.slice(0, 120) };
  });

  if (review) items.push({ date: keyOf(last), title: `Full revision${label}`.slice(0, 120) });
  return { items, error: "" };
};
