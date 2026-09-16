import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "../services/firebase";
import { useAuth } from "./useAuth";

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
 */
export function usePlan() {
  const { user } = useAuth();
  const [state, setState] = useState({ planId: "free", label: "Free", loading: true });

  useEffect(() => {
    if (!user) {
      setState({ planId: "free", label: "Free", loading: false });
      return undefined;
    }

    const unsubscribe = onSnapshot(
      doc(db, "billing", user.uid),
      (snapshot) => {
        const planId = snapshot.exists() ? snapshot.data().planId || "free" : "free";
        setState({
          planId,
          label: planId === "pro" ? "Pro" : "Free",
          loading: false,
        });
      },
      () => setState({ planId: "free", label: "Free", loading: false }),
    );

    return unsubscribe;
  }, [user]);

  return state;
}
