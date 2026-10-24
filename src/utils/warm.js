/**
 * What each ADHD screen last showed, kept in memory for this visit. Coming
 * back to a screen shows it at once, and a fresh copy loads quietly behind
 * it, instead of a flash of empty placeholders on every tab switch. Keys
 * start with the account's uid, so one account never sees another's.
 */
const kept = new Map();

export const readWarm = (key) => (key ? kept.get(key) : undefined);

export const keepWarm = (key, value) => {
  if (key && value != null) kept.set(key, value);
};
