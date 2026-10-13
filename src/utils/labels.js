/**
 * The longest title a task, plan or habit can have. The security rules allow
 * 500 so that anything written before this cap can still be edited; the app
 * itself never writes more than this.
 */
export const MAX_TITLE = 200;

/**
 * Trims and caps a title. Measured in UTF-16 units, which is what the rules'
 * size() counts, and never cuts an emoji in half.
 */
export const clipTitle = (value) => {
  const clipped = String(value ?? "").trim().slice(0, MAX_TITLE);
  const last = clipped.charCodeAt(clipped.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? clipped.slice(0, -1) : clipped;
};

// The same limits the rules enforce. An imported row past them is refused
// rather than written, because a refused write fails its whole batch.
export const MAX_FIELDS = 40;
export const MAX_HABIT_LOG_DAYS = 4000;

/** A task, plan or habit body that fits the rules, with its title capped; or null. */
export const boundedLabelled = (body) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (Object.keys(body).length > MAX_FIELDS) return null;
  if (body.title !== undefined && typeof body.title !== "string") return null;
  return body.title === undefined ? body : { ...body, title: clipTitle(body.title) };
};
