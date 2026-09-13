import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

/**
 * Wraps a route that has nothing to show a guest. Most of the app is
 * deliberately browsable signed out, so this is used sparingly.
 */
export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  // Waiting on Firebase to restore the session. Redirecting here would bounce
  // a signed-in user to the login page on every cold load.
  if (loading) return null;

  if (!user) return <Navigate to="/login" replace />;

  return children;
}
