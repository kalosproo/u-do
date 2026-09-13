import { addDoc, deleteDoc, getDocs, updateDoc } from "firebase/firestore";
import { plannerCollection, plannerDoc } from "./paths";

export const fetchPlans = async (uid) => {
  const snapshot = await getDocs(plannerCollection(uid));
  return snapshot.docs.map((item) => ({ id: item.id, completed: false, order: 0, ...item.data() }));
};

export const createPlan = (uid, { title, date, priority = "medium", order = 0 }) =>
  addDoc(plannerCollection(uid), {
    title,
    date,
    priority,
    completed: false,
    order,
    createdAt: new Date(),
  });

export const renamePlan = (uid, planId, title) => updateDoc(plannerDoc(uid, planId), { title });

export const setPlanCompleted = (uid, planId, completed, order) =>
  updateDoc(plannerDoc(uid, planId), { completed, order });

export const deletePlan = (uid, planId) => deleteDoc(plannerDoc(uid, planId));

/** Rewrites a day's ordering, moving any plan that changed day at the same time. */
export const persistPlanOrder = (uid, dateKey, plans) =>
  Promise.all(
    plans.map((plan, index) => updateDoc(plannerDoc(uid, plan.id), { order: index, date: dateKey }))
  );
