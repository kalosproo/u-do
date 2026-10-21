/**
 * Achievements: badges earned from the person's own records. Once earned a
 * badge is kept — a broken streak later doesn't take it back.
 *
 * Each badge reads one number from `stats` and has a goal, so the panel can
 * show progress toward the ones still locked.
 */
export const BADGES = [
  { id: "focus-first", title: "First session", detail: "Finish a focus session", stat: "focusSessions", goal: 1, icon: "zap" },
  { id: "focus-10h", title: "10 hours in", detail: "Focus for 10 hours in total", stat: "focusHours", goal: 10, icon: "clock" },
  { id: "focus-50h", title: "Deep worker", detail: "Focus for 50 hours in total", stat: "focusHours", goal: 50, icon: "award" },
  { id: "focus-100h", title: "Hundred hours", detail: "Focus for 100 hours in total", stat: "focusHours", goal: 100, icon: "star" },
  { id: "focus-streak-7", title: "Week of focus", detail: "Focus 7 days in a row", stat: "focusStreak", goal: 7, icon: "trend" },
  { id: "habit-7", title: "On a roll", detail: "Keep a habit going 7 days", stat: "habitStreak", goal: 7, icon: "activity" },
  { id: "habit-30", title: "Month strong", detail: "Keep a habit going 30 days", stat: "habitStreak", goal: 30, icon: "sun" },
  { id: "habit-100", title: "Unbreakable", detail: "Keep a habit going 100 days", stat: "habitStreak", goal: 100, icon: "target" },
  { id: "tasks-10", title: "Getting it done", detail: "Finish 10 tasks", stat: "tasksDone", goal: 10, icon: "check" },
  { id: "tasks-100", title: "Hundred done", detail: "Finish 100 tasks", stat: "tasksDone", goal: 100, icon: "checkCircle" },
  { id: "tasks-500", title: "Machine", detail: "Finish 500 tasks", stat: "tasksDone", goal: 500, icon: "layers" },
];

/** Ids of every badge the stats reach. Missing stats count as zero. */
export const earnedBadges = (stats = {}) =>
  BADGES.filter((badge) => (Number(stats[badge.stat]) || 0) >= badge.goal).map((badge) => badge.id);

/** Badges reached now that aren't in `stored` yet, in list order. */
export const newlyEarned = (stats, stored = {}) => earnedBadges(stats).filter((id) => !stored[id]);

/** 0–1 toward a badge's goal. */
export const progressToward = (badge, stats = {}) =>
  Math.max(0, Math.min(1, (Number(stats[badge.stat]) || 0) / badge.goal));
