import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { db } from "../services/firebase.js";

/**
 * One cheap listener whose only job is to say whether this console is actually
 * connected. It watches a single document, so the cost is negligible, and it
 * reports the same three states the whole app shows: live, reconnecting,
 * offline.
 *
 * The document does not need to exist — a snapshot for a missing doc still
 * carries the metadata we read.
 */
export function useConnectionState({ enabled = true } = {}) {
  const [state, setState] = useState("reconnecting");

  useEffect(() => {
    if (!enabled) return undefined;

    const goOffline = () => setState("offline");
    window.addEventListener("offline", goOffline);

    const unsubscribe = onSnapshot(
      doc(db, "stats", "global"),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (!navigator.onLine) {
          setState("offline");
          return;
        }
        setState(snapshot.metadata.fromCache ? "reconnecting" : "live");
      },
      () => setState("offline"),
    );

    return () => {
      window.removeEventListener("offline", goOffline);
      unsubscribe();
    };
  }, [enabled]);

  return state;
}
