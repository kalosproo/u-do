import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";

import { auth } from "../services/firebase.js";
import { getAdminIdentity } from "../services/adminApi.js";
import { AdminAuthContext } from "./adminAuthContext.js";

const EMPTY = { user: null, role: null, status: "loading", error: null };

/**
 * Holds the signed-in admin.
 *
 * Two checks, deliberately. The token is refreshed with `true` so a claim
 * granted or revoked a minute ago takes effect now rather than whenever the
 * cached token happened to expire. Then getAdminIdentity asks the server what
 * it thinks, so the gate never rests on a token this app decoded for itself.
 *
 * Status is one of: loading, anonymous, denied, ready.
 */
export function AdminAuthProvider({ children }) {
  const [state, setState] = useState(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cancelled) return;

      if (!user) {
        setState({ user: null, role: null, status: "anonymous", error: null });
        return;
      }

      setState((current) => ({ ...current, status: "loading" }));

      try {
        const token = await user.getIdTokenResult(true);

        if (token.claims.admin !== true) {
          if (!cancelled) {
            setState({
              user,
              role: null,
              status: "denied",
              error: "This account does not have admin access.",
            });
          }
          return;
        }

        const identity = await getAdminIdentity();
        if (cancelled) return;

        setState({ user, role: identity.role, status: "ready", error: null });
      } catch (error) {
        if (cancelled) return;
        setState({
          user,
          role: null,
          status: "denied",
          error: error?.message || "Could not verify admin access.",
        });
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const leave = useCallback(() => signOut(auth), []);

  const value = useMemo(() => ({ ...state, signOut: leave }), [state, leave]);

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}
