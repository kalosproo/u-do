import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../services/firebase";

/**
 * Returns the signed-in user, or sends a guest to the login page and returns
 * null. Guests are meant to browse every page; this gates the actions that
 * write, which is what the pages each used to spell out by hand.
 *
 * Reads auth.currentUser rather than the context on purpose: this runs at click
 * time, and wants the freshest value rather than the last render's.
 */
export function useAuthGuard() {
  const navigate = useNavigate();

  return useCallback(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      navigate("/login");
      return null;
    }

    return currentUser;
  }, [navigate]);
}
