const DAY_MS = 24 * 60 * 60 * 1000;

export const STREAK_MILESTONES = [7, 30, 100];
const MAX_FREEZE_TOKENS = 5;

const FREQUENCY_RULES = {
  daily: {
    graceWindow: 1,
    recoveryWindow: 2,
    freezeAllowance: 2,
    lookbackWindows: 400,
  },
  weekly: {
    graceWindow: 1,
    recoveryWindow: 1,
    freezeAllowance: 1,
    lookbackWindows: 160,
  },
};

export const toDateKey = (dateValue) => {
  const date = new Date(dateValue);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfWeek = (dateValue) => {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const distanceFromMonday = (day + 6) % 7;
  date.setDate(date.getDate() - distanceFromMonday);
  return date;
};

const getISOWeekKey = (dateValue) => {
  const date = startOfWeek(dateValue);
  const thursday = new Date(date);
  thursday.setDate(date.getDate() + 3);

  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  const firstThursdayWeekStart = startOfWeek(firstThursday);
  const diffDays = Math.round((thursday - firstThursdayWeekStart) / DAY_MS);
  const weekNumber = Math.floor(diffDays / 7) + 1;

  return `${thursday.getFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
};

const getFrequencyRules = (frequency = "daily") => FREQUENCY_RULES[frequency] || FREQUENCY_RULES.daily;

const getWindowMeta = (dateValue, frequency) => {
  if (frequency === "weekly") {
    const start = startOfWeek(dateValue);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      key: getISOWeekKey(start),
      start,
      end,
      label: `${toDateKey(start)} → ${toDateKey(end)}`,
    };
  }

  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  return {
    key: toDateKey(date),
    start: date,
    end: date,
    label: toDateKey(date),
  };
};

const buildWindows = (frequency, todayDate) => {
  const { lookbackWindows } = getFrequencyRules(frequency);
  const windows = [];
  const cursor = new Date(todayDate);
  cursor.setHours(0, 0, 0, 0);

  for (let i = 0; i < lookbackWindows; i += 1) {
    const meta = getWindowMeta(cursor, frequency);
    windows.unshift(meta);
    cursor.setDate(cursor.getDate() - (frequency === "weekly" ? 7 : 1));
  }

  return windows;
};

const mapCompletionsByWindow = (logs, frequency, windows) => {
  const completeByWindow = {};
  windows.forEach((window) => {
    completeByWindow[window.key] = false;
  });

  Object.entries(logs || {}).forEach(([dateKey, done]) => {
    if (!done) return;
    const windowKey = getWindowMeta(new Date(`${dateKey}T00:00:00`), frequency).key;
    if (windowKey in completeByWindow) completeByWindow[windowKey] = true;
  });

  return completeByWindow;
};

const computeBestStreak = (windows, completeByWindow) => {
  let best = 0;
  let active = 0;
  windows.forEach((window) => {
    if (completeByWindow[window.key]) {
      active += 1;
      best = Math.max(best, active);
      return;
    }
    active = 0;
  });
  return best;
};

export const getHabitStreakSnapshot = (habit, todayDate = new Date()) => {
  const frequency = habit.frequency || "daily";
  const rules = getFrequencyRules(frequency);
  const windows = buildWindows(frequency, todayDate);
  const completions = mapCompletionsByWindow(habit.logs || {}, frequency, windows);

  let currentStreak = 0;
  let missedWindows = 0;
  let freezesLeft = rules.freezeAllowance;
  let freezesUsed = 0;

  for (let index = windows.length - 1; index >= 0; index -= 1) {
    const window = windows[index];
    const completed = completions[window.key];

    if (completed) {
      currentStreak += 1;
      continue;
    }

    missedWindows += 1;
    if (missedWindows <= rules.graceWindow) {
      continue;
    }

    if (freezesLeft > 0) {
      freezesLeft -= 1;
      freezesUsed += 1;
      continue;
    }

    break;
  }

  const lastCompletedDate = Object.entries(habit.logs || {})
    .filter(([, done]) => Boolean(done))
    .sort(([a], [b]) => a.localeCompare(b))
    .at(-1)?.[0] || null;

  const bestStreak = computeBestStreak(windows, completions);
  const windowNow = windows[windows.length - 1];
  const isCurrentWindowDone = completions[windowNow.key];

  const latestCompletedWindowIndex = (() => {
    for (let i = windows.length - 1; i >= 0; i -= 1) {
      if (completions[windows[i].key]) return i;
    }
    return -1;
  })();

  const windowsSinceCompletion = latestCompletedWindowIndex === -1
    ? Number.POSITIVE_INFINITY
    : windows.length - 1 - latestCompletedWindowIndex;

  const recoveryEligible = !isCurrentWindowDone
    && windowsSinceCompletion <= rules.graceWindow + rules.recoveryWindow;

  const streakState = isCurrentWindowDone
    ? "onTrack"
    : missedWindows <= rules.graceWindow
      ? "grace"
      : freezesUsed > 0
        ? "frozen"
        : recoveryEligible
          ? "recovery"
          : "broken";

  return {
    frequency,
    rules,
    currentStreak,
    bestStreak,
    freezesLeft,
    freezesUsed,
    lastCompletedDate,
    missedWindows,
    recoveryEligible,
    streakState,
    currentWindowLabel: windowNow.label,
  };
};

export const buildHabitMetadata = (habit, todayDate = new Date()) => {
  const snapshot = getHabitStreakSnapshot(habit, todayDate);
  const existingMeta = habit.streakMeta || {};
  const referenceStreak = Math.max(snapshot.currentStreak, snapshot.bestStreak, existingMeta.bestStreak || 0);
  const todayKey = toDateKey(todayDate);

  const existingMilestones = Array.isArray(existingMeta.milestoneHistory)
    ? existingMeta.milestoneHistory
    : [];

  const unlocked = STREAK_MILESTONES
    .filter((milestone) => referenceStreak >= milestone)
    .map((milestone) => ({
      milestone,
      reachedOn: todayKey,
      reward: `${milestone}-day badge`,
    }));

  const mergedMilestones = [...existingMilestones];
  unlocked.forEach((entry) => {
    if (!mergedMilestones.some((item) => item.milestone === entry.milestone)) {
      mergedMilestones.push(entry);
    }
  });

  const sortedMilestones = mergedMilestones.sort((a, b) => a.milestone - b.milestone);
  const nextMilestone = STREAK_MILESTONES.find((value) => value > snapshot.currentStreak) || null;
  const freezeCapacity = Math.min(
    MAX_FREEZE_TOKENS,
    snapshot.rules.freezeAllowance + sortedMilestones.length
  );
  const freezesLeft = Math.max(0, Math.min(freezeCapacity, freezeCapacity - snapshot.freezesUsed));

  return {
    currentStreak: snapshot.currentStreak,
    bestStreak: Math.max(snapshot.bestStreak, existingMeta.bestStreak || 0),
    freezeAllowance: freezeCapacity,
    freezesLeft,
    graceWindow: snapshot.rules.graceWindow,
    recoveryWindow: snapshot.rules.recoveryWindow,
    lastCompletedDate: snapshot.lastCompletedDate,
    missedWindows: snapshot.missedWindows,
    streakState: snapshot.streakState,
    currentWindowLabel: snapshot.currentWindowLabel,
    recoveryEligible: snapshot.recoveryEligible,
    milestoneHistory: sortedMilestones,
    rewardsHistory: sortedMilestones.map((entry) => entry.reward),
    badgeTier: sortedMilestones.at(-1)?.milestone || 0,
    lastEvaluatedOn: todayKey,
    nextMilestone,
  };
};

export const getLastDateKeys = (count, fromDate = new Date()) => Array.from({ length: count }).map((_, index) => {
  const d = new Date(fromDate);
  d.setDate(fromDate.getDate() - (count - 1 - index));
  return toDateKey(d);
});
