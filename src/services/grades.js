import { addDoc, deleteDoc, getDocs, serverTimestamp } from "firebase/firestore";

import { gradeDoc, gradesCollection } from "./paths";

/** Marks for the grade tracker. See utils/grades for the summary. */

export const listGrades = async (uid) => {
  const snapshot = await getDocs(gradesCollection(uid));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return { id: item.id, ...data, createdAtMs: data.createdAt?.toMillis?.() || 0 };
  });
};

export const addGrade = async (uid, { subject, title = "", score, outOf, date }) => {
  const clean = {
    subject: subject.trim(),
    ...(title.trim() ? { title: title.trim() } : {}),
    score: Number(score),
    outOf: Number(outOf),
    ...(date ? { date } : {}),
  };
  const ref = await addDoc(gradesCollection(uid), { ...clean, createdAt: serverTimestamp() });
  return { id: ref.id, ...clean, createdAtMs: Date.now() };
};

export const deleteGrade = (uid, id) => deleteDoc(gradeDoc(uid, id));
