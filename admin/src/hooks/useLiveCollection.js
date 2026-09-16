import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";

const LOADING = { docs: [], status: "loading", error: null };
const IDLE = { docs: [], status: "idle", error: null };

/**
 * Subscribes to a Firestore query and keeps it subscribed.
 *
 * This is the realtime mechanism for the console — no polling interval
 * anywhere. `includeMetadataChanges` is on because that is what makes the
 * connection state honest: when the SDK loses its socket it keeps serving from
 * cache, and without this flag the UI would happily show stale rows as live.
 *
 * The listener is torn down on unmount and whenever the query identity
 * changes, so navigating between sections never leaves a socket behind.
 */
export function useLiveCollection(query, { enabled = true } = {}) {
  const [state, setState] = useState(LOADING);

  useEffect(() => {
    // Nothing to subscribe to. The idle result is derived on the way out
    // rather than written into state, so the effect never triggers a render
    // of its own.
    if (!enabled || !query) return undefined;

    const unsubscribe = onSnapshot(
      query,
      { includeMetadataChanges: true },
      (snapshot) => {
        setState({
          docs: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
          status: snapshot.metadata.fromCache ? "reconnecting" : "live",
          error: null,
        });
      },
      (error) => {
        setState({ docs: [], status: "offline", error });
      },
    );

    return unsubscribe;
  }, [query, enabled]);

  return !enabled || !query ? IDLE : state;
}
