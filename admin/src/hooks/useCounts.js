import { useEffect, useState } from "react";
import { getCountFromServer } from "firebase/firestore";

/**
 * Server-side counts for a set of named queries, each failing on its own.
 *
 * A count costs one read per thousand documents matched rather than one per
 * document, so a report can ask a dozen questions without pulling a
 * collection into the browser. One failed count — a missing index, usually —
 * leaves the rest standing and says why it failed.
 */
export function useCounts(queries, deps = []) {
  const [state, setState] = useState({ status: "loading", values: {}, errors: {} });

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(queries || {});

    Promise.all(
      entries.map(async ([key, q]) => {
        try {
          return [key, (await getCountFromServer(q)).data().count, null];
        } catch (error) {
          return [key, null, error];
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      const values = {};
      const errors = {};
      results.forEach(([key, value, error]) => {
        values[key] = value;
        if (error) errors[key] = error;
      });
      setState({ status: "ready", values, errors });
    });

    return () => {
      cancelled = true;
    };
    // The caller owns when the questions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
