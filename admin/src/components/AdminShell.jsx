import { NavLink, Outlet } from "react-router-dom";

import { useAdminAuth } from "../hooks/useAdminAuth.js";
import { useTheme } from "../hooks/useTheme.js";
import { SECTIONS } from "../navigation.js";

export default function AdminShell() {
  const { user, role, signOut } = useAdminAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="shell">
      <aside className="rail">
        <div className="rail-head">
          <div className="rail-title">U.Do operations</div>
          <p className="rail-sub">{role ? `Signed in as ${role}` : "Admin console"}</p>
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
          <div className="rail-foot-email">{user?.email}</div>
          <code>{user?.uid}</code>

          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>

          <button type="button" className="button" data-variant="quiet" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
