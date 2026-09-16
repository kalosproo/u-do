import { NavLink, Outlet } from "react-router-dom";

import { useAdminAuth } from "../hooks/useAdminAuth.js";
import { SECTIONS } from "../navigation.js";

export default function AdminShell() {
  const { user, role, signOut } = useAdminAuth();

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-head">
          <div className="rail-title">U.Do operations</div>
          <p className="rail-sub">Phase 1</p>
        </div>

        <nav className="rail-nav" aria-label="Admin sections">
          {SECTIONS.map((section) => (
            <NavLink
              key={section.path}
              to={section.path}
              end={section.end}
              className="rail-link"
              data-pending={section.built ? undefined : "true"}
            >
              {section.label}
            </NavLink>
          ))}
        </nav>

        <div className="rail-foot">
          <div>{user?.email}</div>
          <code>{role}</code>
          <p>
            <button type="button" className="button" data-variant="quiet" onClick={signOut}>
              Sign out
            </button>
          </p>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
