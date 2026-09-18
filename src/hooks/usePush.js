import { useCallback, useEffect, useMemo, useState } from "react";

import {
  DEFAULT_PUSH_TYPES,
  disablePush,
  enablePush,
  fetchPushSubscription,
  pushAvailability,
  readWindow,
  savePushPreferences,
} from "../services/push";
import { useAuth } from "./useAuth";

const EMPTY = { uid: null, availability: null, subscription: null };

/**
 * Everything the reminder controls need, in one place.
 *
 * Availability and the stored subscription are read together and settled
 * against the uid they belong to, so nothing sets state synchronously inside
 * the effect and switching accounts can never show the previous account's
 * reminder settings.
 */
export function usePush() {
  const { user } = useAuth();
  const [settled, setSettled] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return undefined;

    let cancelled = false;

    Promise.all([pushAvailability(), fetchPushSubscription(user.uid)])
      .then(([availability, subscription]) => {
        if (!cancelled) setSettled({ uid: user.uid, availability, subscription });
      })
      .catch(() => {
        if (!cancelled) {
          setSettled({ uid: user.uid, availability: "unsupported", subscription: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const current = user && settled.uid === user.uid ? settled : null;
  const subscription = current?.subscription ?? null;

  const enabled = subscription?.enabled === true;
  const { start, end } = readWindow(subscription);
  // Memoised: a fresh object every render would rebuild every callback below
  // it on every render, which is exactly the churn those callbacks exist to
  // avoid.
  const types = useMemo(
    () => ({ ...DEFAULT_PUSH_TYPES, ...(subscription?.types || {}) }),
    [subscription],
  );

  const enable = useCallback(async () => {
    if (!user) return;

    setBusy(true);
    setError("");

    try {
      const result = await enablePush(user.uid, { start, end, types });

      if (!result.ok) {
        setError(
          result.reason === "denied"
            ? "Your browser is blocking notifications for this site. Allow them in its site settings, then try again."
            : "Couldn't turn reminders on. Try again in a moment.",
        );
        return;
      }

      setSettled({
        uid: user.uid,
        availability: current?.availability ?? "available",
        subscription: { ...(subscription || {}), enabled: true, start, end, types },
      });
    } catch (cause) {
      setError(cause?.message || "Couldn't turn reminders on.");
    } finally {
      setBusy(false);
    }
  }, [user, start, end, types, subscription, current]);

  const disable = useCallback(async () => {
    if (!user) return;

    setBusy(true);
    setError("");

    try {
      await disablePush(user.uid);
      setSettled({
        uid: user.uid,
        availability: current?.availability ?? "available",
        subscription: { ...(subscription || {}), enabled: false },
      });
    } catch (cause) {
      setError(cause?.message || "Couldn't turn reminders off.");
    } finally {
      setBusy(false);
    }
  }, [user, subscription, current]);

  const update = useCallback(
    async (changes) => {
      if (!user) return;

      const next = { start, end, types, ...changes };
      setSettled({
        uid: user.uid,
        availability: current?.availability ?? "available",
        subscription: { ...(subscription || {}), ...next },
      });

      try {
        await savePushPreferences(user.uid, next);
      } catch {
        setError("Couldn't save that change.");
      }
    },
    [user, start, end, types, subscription, current],
  );

  return {
    loading: Boolean(user) && !current,
    availability: current?.availability ?? null,
    enabled,
    start,
    end,
    types,
    busy,
    error,
    enable,
    disable,
    update,
  };
}
