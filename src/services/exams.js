import { deleteDoc, doc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";

import { examDoc, examsCollection } from "./paths";

export const listExams = async (uid) => {
  const snapshot = await getDocs(examsCollection(uid));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
};

/** Creates or updates an exam. Returns it with its id. */
export const saveExam = async (uid, { id, title, date, subject }) => {
  const ref = id ? examDoc(uid, id) : doc(examsCollection(uid));
  const clean = {
    title: String(title || "").trim().slice(0, 80),
    date,
    subject: String(subject || "").trim().slice(0, 40),
    updatedAt: serverTimestamp(),
    ...(id ? {} : { createdAt: serverTimestamp() }),
  };
  await setDoc(ref, clean, { merge: true });
  return { id: ref.id, ...clean };
};

export const deleteExam = (uid, id) => deleteDoc(examDoc(uid, id));
