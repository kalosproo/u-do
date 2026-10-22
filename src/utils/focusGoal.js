/**
 * A daily focus goal: minutes to aim for today. 0 means no goal.
 */

export const GOAL_OPTIONS = [0, 60, 120, 180, 240];
export const DEFAULT_GOAL = 120;

export const cleanGoal = (value) => (GOAL_OPTIONS.includes(Number(value)) ? Number(value) : DEFAULT_GOAL);

/** 0..1 of the way to the goal; 0 when there is no goal. */
export const goalProgress = (minutes, goal) => (goal > 0 ? Math.min(1, Math.max(0, (Number(minutes) || 0) / goal)) : 0);

/** True only for the stretch that carries today across the line. */
export const crossesGoal = (before, added, goal) => goal > 0 && before < goal && before + added >= goal;

/** "1h", "2h", "Off". */
export const goalLabel = (goal) => (goal > 0 ? `${goal / 60}h` : "Off");
