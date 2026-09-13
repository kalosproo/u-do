import { deleteDoc, getDocs } from "firebase/firestore";
import { WORKSPACE_COLLECTIONS, workspaceCollection, workspaceDoc } from "./paths";
import { expensesCacheKey } from "./finance";
import { habitsCacheKey } from "./habits";

/** Every workspace collection, shaped for the account backup file. */
export const exportWorkspace = async (uid) => {
  const sections = await Promise.all(
    WORKSPACE_COLLECTIONS.map(async (name) => {
      const snapshot = await getDocs(workspaceCollection(uid, name));
      return [name, snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))];
    })
  );

  return Object.fromEntries(sections);
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
  // Older builds cached habits under a key shared by every account on this
  // browser. Clear it too so no stale copy survives.
  localStorage.removeItem("u_do_habits");
};
