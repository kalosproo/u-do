import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  FiActivity,
  FiCalendar,
  FiCheckSquare,
  FiDollarSign,
  FiGrid,
  FiLogOut,
  FiChevronLeft,
  FiMenu,
  FiMoon,
  FiSun,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { auth } from "../services/firebase";
import BrandLogo from "./BrandLogo";
import AIAssistant from "./AIAssistant";
import { useTheme } from "../hooks/useTheme";
import { resolveUserPhoto } from "../utils/profilePhoto";

const COLLAPSE_KEY = "u_do_sidebar_collapsed";

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
};

const links = [
  { to: "/", label: "Home", icon: <FiGrid /> },
  { to: "/finance", label: "Finance", icon: <FiDollarSign /> },
  { to: "/planner", label: "Planner", icon: <FiCalendar /> },
  { to: "/tasks", label: "Tasks", icon: <FiCheckSquare /> },
  { to: "/habits", label: "Habits", icon: <FiActivity /> },
  { to: "/friends", label: "Friends", icon: <FiUsers /> },
];

function Sidebar({ user }) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(readCollapsed);

  // The rail width drives the main content's margin too, so the state lives on
  // the root element where the stylesheet can see it — same idea as the theme.
  useEffect(() => {
    document.documentElement.setAttribute("data-sidebar", isCollapsed ? "collapsed" : "full");

    try {
      localStorage.setItem(COLLAPSE_KEY, isCollapsed ? "1" : "0");
    } catch {
      /* Remembering the choice is best-effort. */
    }
  }, [isCollapsed]);

  const userName = user?.displayName || user?.email?.split("@")[0] || "User";
  const avatarText = userName.trim().charAt(0).toUpperCase();
  const profilePhoto = resolveUserPhoto(user);

  // The drawer overlays the page on small screens, so following a link closes it.
  const close = () => setIsOpen(false);

  const handleAuthAction = async () => {
    close();
    if (!user) return navigate("/login");

    await signOut(auth);
    navigate("/login", { replace: true });
  };

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={isOpen}
      >
        {isOpen ? <FiX /> : <FiMenu />}
      </button>

      {isOpen ? <div className="nav-scrim" onClick={() => setIsOpen(false)} /> : null}

      <aside className={`sidebar ${isOpen ? "is-open" : ""} ${isCollapsed ? "is-collapsed" : ""}`}>
        <div className="sidebar-top">
          {/* Collapsed, the rail has no room for the wordmark, so the row
              becomes a single hamburger that expands it again. */}
          <div className="sidebar-brand-row">
            {isCollapsed ? null : <BrandLogo compact />}
            <button
              type="button"
              className={`sidebar-collapse ${isCollapsed ? "is-rail" : ""}`}
              onClick={() => setIsCollapsed((collapsed) => !collapsed)}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!isCollapsed}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <FiMenu /> : <FiChevronLeft />}
            </button>
          </div>

          <NavLink to="/profile" className="sidebar-profile" aria-label="Open profile" onClick={close}>
            {profilePhoto ? (
              <img src={profilePhoto} alt="" className="profile-avatar profile-avatar-image" />
            ) : (
              <span className="profile-avatar">{avatarText}</span>
            )}
            <div className="profile-text">
              <strong className="profile-name">{user ? userName : "Profile"}</strong>
            </div>
          </NavLink>

          <nav className="nav-links">
            {links.map(({ to, label, icon }) => (
              <NavLink key={to} to={to} end={to === "/"} onClick={close} title={label}>
                {icon}
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <AIAssistant collapsed={isCollapsed} />
        </div>

        <div className="sidebar-bottom">
          <button
            type="button"
            className="logout-btn"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
          >
            {theme === "dark" ? <FiSun /> : <FiMoon />}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>

          <button
            type="button"
            className="logout-btn"
            onClick={handleAuthAction}
            title={user ? "Logout" : "Login"}
          >
            <FiLogOut />
            <span>{user ? "Logout" : "Login"}</span>
          </button>

          <p className="sidebar-credits">© 2026 U.Do — Crafted by Muttukuru Rahul.</p>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
