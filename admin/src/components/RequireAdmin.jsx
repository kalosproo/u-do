import { Navigate } from "react-router-dom";

import { useAdminAuth } from "../hooks/useAdminAuth.js";

/**
 * The client-side gate. It keeps someone without the claim from seeing the
 * shell, but it is not what protects the data — Firestore rules and the admin
 * callables do that, and they would refuse a request from this browser even if
 * this component were bypassed entirely.
 */
export default function RequireAdmin({ children }) {
  const { status, error } = useAdminAuth();

  if (status === "loading") {
    return (
      <div className="gate">
        <p className="page-note">Checking access…</p>
      </div>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/sign-in" replace />;
  }

  if (status === "denied") {
    return (
      <div className="gate">
        <div className="gate-card">
          <h1>No admin access</h1>
          <p className="notice">{error || "This account does not have admin access."}</p>
          <p>
            Ask an owner to grant the claim, then sign out and back in so your token
            picks it up.
          </p>
          <SignOutButton />
        </div>
      </div>
    );
  }

  return children;
}

function SignOutButton() {
  const { signOut } = useAdminAuth();
  return (
    <button type="button" className="button" data-variant="quiet" onClick={signOut}>
      Sign out
    </button>
  );
}
