import { addDoc, deleteDoc, getDocs, serverTimestamp } from "firebase/firestore";

import { classDoc, classesCollection } from "./paths";

/** The weekly class timetable. See utils/timetable for the rules a class follows. */

export const listClasses = async (uid) => {
  const snapshot = await getDocs(classesCollection(uid));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

export const addClass = async (uid, { subject, day, start, end, room = "" }) => {
  const clean = { subject: subject.trim(), day, start, end, ...(room.trim() ? { room: room.trim() } : {}) };
  const ref = await addDoc(classesCollection(uid), { ...clean, createdAt: serverTimestamp() });
  return { id: ref.id, ...clean };
};

export const deleteClass = (uid, id) => deleteDoc(classDoc(uid, id));
