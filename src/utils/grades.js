/**
 * The grade tracker: marks per subject, as percentages. A mark may carry a
 * weight (say 20 for a unit test, 80 for the final); without one every mark
 * counts the same. Pure.
 */

export const percentOf = (grade) => (Number(grade.outOf) > 0 ? (Number(grade.score) / Number(grade.outOf)) * 100 : 0);

const round1 = (n) => Math.round(n * 10) / 10;

/** Returns an error message, or "" when the mark is fine to save. */
export const validateGrade = ({ subject, score, outOf }) => {
  if (!String(subject || "").trim()) return "Add the subject.";
  const s = Number(score);
  const t = Number(outOf);
  if (!Number.isFinite(t) || t <= 0 || t > 1000) return "Out of must be between 1 and 1000.";
  if (score === "" || score == null || !Number.isFinite(s) || s < 0) return "Add the score.";
  if (s > t) return "The score can't be more than the total.";
  return "";
};

const weighted = (grades) => {
  let sum = 0;
  let weights = 0;
  grades.forEach((grade) => {
    const w = Number(grade.weight) > 0 ? Number(grade.weight) : 1;
    sum += percentOf(grade) * w;
    weights += w;
  });
  return weights ? sum / weights : 0;
};

const byDate = (a, b) => String(a.date || "").localeCompare(String(b.date || "")) || (a.createdAtMs || 0) - (b.createdAtMs || 0);

/**
 * One row per subject — average, how many marks, the latest mark and its
 * change from the one before — plus an overall average of the subjects.
 */
export const gradeSummary = (grades) => {
  const groups = new Map();
  (grades || []).forEach((grade) => {
    const key = String(grade.subject || "").trim();
    if (!key) return;
    const found = [...groups.keys()].find((name) => name.toLowerCase() === key.toLowerCase()) || key;
    groups.set(found, [...(groups.get(found) || []), grade]);
  });

  const subjects = [...groups.entries()]
    .map(([subject, list]) => {
      const ordered = [...list].sort(byDate);
      const latest = ordered[ordered.length - 1];
      const previous = ordered[ordered.length - 2];
      return {
        subject,
        count: list.length,
        average: round1(weighted(list)),
        latest: round1(percentOf(latest)),
        change: previous ? round1(percentOf(latest) - percentOf(previous)) : null,
        marks: ordered,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const overall = subjects.length ? round1(subjects.reduce((sum, s) => sum + s.average, 0) / subjects.length) : null;
  return { subjects, overall };
};
