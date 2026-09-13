import { deleteDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { WORKSPACE_COLLECTIONS, workspaceCollection, workspaceDoc } from "./paths";
import { expensesCacheKey } from "./finance";
import { habitsCacheKey } from "./habits";
import { LEGACY_PHOTO_KEY_PREFIX } from "../utils/profilePhoto";

/** Firestore caps a batch at 500 writes. */
const BATCH_SIZE = 400;

/** A backup with more than this is refused rather than half-written. */
const MAX_IMPORT_DOCS = 5000;

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
 * Two boundaries are deliberate: every path is built from the uid passed in by
 * the caller, never from the file, so a backup exported by someone else cannot
 * redirect a write; and `id` is stripped from the body so it only ever names
 * the document, not a field inside it. Existing documents with the same id are
 * overwritten — it is a restore, not a merge.
 */
export const importWorkspace = async (uid, raw) => {
  const { counts } = inspectBackup(raw);
  const data = JSON.parse(raw).data;

  const written = {};

  for (const name of WORKSPACE_COLLECTIONS) {
    const rows = Array.isArray(data[name]) ? data[name] : [];
    const usable = rows.filter((row) => row && typeof row === "object" && !Array.isArray(row));

    written[name] = 0;

    for (let start = 0; start < usable.length; start += BATCH_SIZE) {
      const batch = writeBatch(db);

      usable.slice(start, start + BATCH_SIZE).forEach((row) => {
        const { id, ...body } = row;
        const docId = typeof id === "string" && id.trim() ? id.trim() : crypto.randomUUID();

        batch.set(workspaceDoc(uid, name, docId), body);
        written[name] += 1;
      });

      await batch.commit();
    }
  }

  return { counts, written, total: Object.values(written).reduce((sum, n) => sum + n, 0) };
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
