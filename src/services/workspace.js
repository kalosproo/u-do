import { deleteDoc, getDocs, writeBatch } from "firebase/firestore";
import { recordTimestamp } from "../utils/dateKeys";
import { db } from "./firebase";
import { WORKSPACE_COLLECTIONS, workspaceCollection, workspaceDoc } from "./paths";
import { expensesCacheKey } from "./finance";
import { amountMinorOf, normalizeExpense, stripLocalFields } from "../utils/financeReport";
import { isValidMinor, readMinor } from "../utils/money";
import { habitsCacheKey } from "./habits";
import { LEGACY_PHOTO_KEY_PREFIX } from "../utils/profilePhoto";

/** Firestore caps a batch at 500 writes. */
const BATCH_SIZE = 400;

/** A backup with more than this is refused rather than half-written. */
const MAX_IMPORT_DOCS = 5000;

/**
 * A backup is a text file a person can edit, so nothing in it is trusted as a
 * stored shape. Transactions in particular are brought back through the same
 * normaliser every other write path uses: a hand-edited `"amount": "banana"`
 * or a figure past the ledger's range would otherwise be written verbatim, and
 * with the rules validating expense documents it would take the whole batch
 * down with it.
 *
 * It is also what lets a backup exported before minor units restore correctly
 * — the float becomes an exact `amountMinor` with its currency stated, rather
 * than a record the new app cannot read.
 *
 * A row whose amount is missing, unreadable, zero or out of range is refused
 * rather than written. Normalising would turn it into a ₹0 row, which the rules
 * refuse — and a refused write fails its whole batch, so one bad row in a
 * backup used to be able to sink four hundred good ones. It is counted and
 * reported instead.
 *
 * Only transactions are covered here. Tasks, planner entries and habits are
 * still written as the file gives them.
 */
const SANITIZE = {
  expenses: (body) => {
    const minor = readMinor(body);
    if (!isValidMinor(minor) || minor <= 0) return null;

    const clean = stripLocalFields(normalizeExpense(body));
    return amountMinorOf(clean) > 0 ? clean : null;
  },
};

// `body` has already had its id split off by the caller, so nothing here can
// reintroduce one as a field. Null means the row cannot be stored at all.
const sanitize = (name, body) => (SANITIZE[name] ? SANITIZE[name](body) : body);

/**
 * "merge" keeps whichever copy was touched most recently, so restoring an old
 * backup cannot silently roll back work done since. "replace" takes the file
 * as the truth for the ids it contains.
 */
export const IMPORT_MODES = ["merge", "replace"];

export const exportWorkspace = async (uid) => {
  const sections = await Promise.all(
    WORKSPACE_COLLECTIONS.map(async (name) => {
      const snapshot = await getDocs(workspaceCollection(uid, name));
      return [name, snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))];
    })
  );

  return Object.fromEntries(sections);
};

/**
 * Checks a backup file before anything is written, and reports what it would
 * import. Unknown collections are ignored rather than trusted, and the uid
 * recorded in the file is never used — see importWorkspace.
 */
export const inspectBackup = (raw) => {
  let parsed;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  const data = parsed?.data;

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("That doesn't look like a U.Do backup — no data section.");
  }

  const counts = {};
  let total = 0;

  WORKSPACE_COLLECTIONS.forEach((name) => {
    const rows = data[name];
    if (rows === undefined) return;

    if (!Array.isArray(rows)) {
      throw new Error(`The "${name}" section should be a list.`);
    }

    const valid = rows.filter((row) => row && typeof row === "object" && !Array.isArray(row));
    counts[name] = valid.length;
    total += valid.length;
  });

  if (total === 0) {
    throw new Error("That backup has no tasks, habits, planner entries or transactions in it.");
  }

  if (total > MAX_IMPORT_DOCS) {
    throw new Error(`That backup holds ${total} records, more than the ${MAX_IMPORT_DOCS} limit.`);
  }

  return { counts, total, exportedAt: parsed.exportedAt || null };
};

/**
 * Writes a checked backup into the signed-in account.
 *
 * Three boundaries are deliberate. Every path is built from the uid passed in
 * by the caller, never from the file, so a backup exported by someone else
 * cannot redirect a write. `id` is stripped from the body, so it only ever
 * names the document rather than becoming a field inside it. And in the
 * default "merge" mode an existing document is left alone when it is newer
 * than the copy in the file — importing a week-old backup no longer discards
 * a week of work. "replace" is the explicit opt-in to overwrite.
 */
export const importWorkspace = async (uid, raw, { mode = "merge" } = {}) => {
  if (!IMPORT_MODES.includes(mode)) {
    throw new Error(`Unknown import mode "${mode}".`);
  }

  const { counts } = inspectBackup(raw);
  const data = JSON.parse(raw).data;

  const written = {};
  const skipped = {};
  const rejected = {};

  for (const name of WORKSPACE_COLLECTIONS) {
    const rows = Array.isArray(data[name]) ? data[name] : [];
    const usable = rows.filter((row) => row && typeof row === "object" && !Array.isArray(row));

    written[name] = 0;
    skipped[name] = 0;
    rejected[name] = 0;

    if (usable.length === 0) continue;

    // In merge mode the current documents decide what is safe to overwrite.
    let existing = new Map();

    if (mode === "merge") {
      const snapshot = await getDocs(workspaceCollection(uid, name));
      existing = new Map(snapshot.docs.map((item) => [item.id, item.data()]));
    }

    const queue = [];

    usable.forEach((row) => {
      const { id, ...body } = row;
      const docId = typeof id === "string" && id.trim() ? id.trim() : crypto.randomUUID();

      if (mode === "merge") {
        const current = existing.get(docId);

        if (current && recordTimestamp(current) > recordTimestamp(body)) {
          skipped[name] += 1;
          return;
        }
      }

      const clean = sanitize(name, body);

      if (clean === null) {
        rejected[name] += 1;
        return;
      }

      queue.push({ docId, body: clean });
    });

    for (let start = 0; start < queue.length; start += BATCH_SIZE) {
      const batch = writeBatch(db);

      queue.slice(start, start + BATCH_SIZE).forEach(({ docId, body }) => {
        batch.set(workspaceDoc(uid, name, docId), body);
        written[name] += 1;
      });

      await batch.commit();
    }
  }

  const sum = (obj) => Object.values(obj).reduce((total, n) => total + n, 0);

  return {
    counts,
    written,
    skipped,
    rejected,
    mode,
    total: sum(written),
    skippedTotal: sum(skipped),
    rejectedTotal: sum(rejected),
  };
};

export const clearWorkspace = async (uid) => {
  await Promise.all(
    WORKSPACE_COLLECTIONS.map(async (name) => {
      const snapshot = await getDocs(workspaceCollection(uid, name));
      await Promise.all(snapshot.docs.map((item) => deleteDoc(workspaceDoc(uid, name, item.id))));
    })
  );

  localStorage.removeItem(expensesCacheKey(uid));
  localStorage.removeItem(habitsCacheKey(uid));
  localStorage.removeItem(`${LEGACY_PHOTO_KEY_PREFIX}${uid}`);
  // Older builds cached habits under a key shared by every account on this
  // browser. Clear it too so no stale copy survives.
  localStorage.removeItem("u_do_habits");
};
