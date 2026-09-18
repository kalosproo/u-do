import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "../services/firebase";
import { useAuth } from "./useAuth";

const FREE = { planId: "free", label: "Free" };

const describe = (planId) => ({
  planId,
  label: planId === "pro" ? "Pro" : "Free",
});

/**
 * The signed-in account's plan, read-only.
 *
 * billing/{uid} is written exclusively by the server, and Firestore rules let
 * the owner read it but never write it — so this hook can show a plan but
 * nothing in the consumer app can change one. That is the whole point: a plan
 * the client could set would not be a plan.
 *
 * A missing document means Free, which is also what a brand-new account looks
 * like for the moment between signup and the server writing its record.
 *
 * The settled value carries the uid it belongs to, and the signed-out case is
 * derived on the way out rather than written into state — so nothing sets
 * state synchronously inside the effect, and signing out cannot briefly show
 * the previous account's plan.
 */
export function usePlan() {
  const { user } = useAuth();
  const [settled, setSettled] = useState({ uid: null, planId: "free" });

  useEffect(() => {
    if (!user) return undefined;

    const unsubscribe = onSnapshot(
      doc(db, "billing", user.uid),
      (snapshot) => {
        const planId = snapshot.exists() ? snapshot.data().planId || "free" : "free";
        setSettled({ uid: user.uid, planId });
      },
      () => setSettled({ uid: user.uid, planId: "free" }),
    );

    return unsubscribe;
  }, [user]);

  if (!user) return { ...FREE, loading: false };

  const loading = settled.uid !== user.uid;
  return { ...describe(loading ? "free" : settled.planId), loading };
}
