import { deleteDoc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";

import { getPublicProfile } from "./friends";
import { focusWeekDoc, friendsCollection } from "./paths";

/**
 * The friends leaderboard. Each person publishes one number — this week's
 * focus minutes — next to their habit summary, readable by friends only.
 */

export const publishWeek = (uid, { week, minutes }) =>
  setDoc(focusWeekDoc(uid), { week, minutes: Math.round(minutes), updatedAt: serverTimestamp() });

export const clearWeek = (uid) => deleteDoc(focusWeekDoc(uid));

/** Friends with their published week, as { uid, name, photoURL, week, minutes }. */
export const loadFriendWeeks = async (uid) => {
  const friends = await getDocs(friendsCollection(uid));
  return Promise.all(
    friends.docs.map(async (item) => {
      const [profile, week] = await Promise.all([
        getPublicProfile(item.id).catch(() => null),
        getDoc(focusWeekDoc(item.id)).then((snap) => (snap.exists() ? snap.data() : null)).catch(() => null),
      ]);
      return {
        uid: item.id,
        name: profile?.displayName || (profile?.username ? `@${profile.username}` : "A friend"),
        photoURL: profile?.photoURL || "",
        week: week?.week || "",
        minutes: Number(week?.minutes) || 0,
      };
    })
  );
};
