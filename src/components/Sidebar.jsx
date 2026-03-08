import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { FiGrid, FiDollarSign, FiCalendar, FiCheckSquare, FiActivity, FiLogOut } from "react-icons/fi";
import { auth } from "../services/firebase";
import BrandLogo from "./BrandLogo";
import AIAssistant from "./AIAssistant";

const links = [
  { to: "/", label: "Home", icon: <FiGrid /> },
  { to: "/finance", label: "Finance", icon: <FiDollarSign /> },
  { to: "/planner", label: "Planner", icon: <FiCalendar /> },
  { to: "/tasks", label: "Tasks", icon: <FiCheckSquare /> },
  { to: "/habits", label: "Habits", icon: <FiActivity /> },
];

function Sidebar() {
  const navigate = useNavigate();
  const user = auth.currentUser;
  const userName = user?.displayName || user?.email?.split("@")[0] || "User";
  const avatarText = userName.trim().charAt(0).toUpperCase();

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login", { replace: true });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <BrandLogo compact />

        <div className="sidebar-profile" aria-label="Current user profile">
          <span className="profile-avatar">{avatarText}</span>
          <div className="profile-text">
            <strong className="profile-name" title={userName}>{userName}</strong>
            <small className="profile-email" title={user?.email || "Signed in"}>{user?.email || "Signed in"}</small>
          </div>
        </div>

        <nav className="nav-links">
          {links.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {icon}
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <AIAssistant />
      </div>

      <div className="sidebar-bottom">
        <button className="logout-btn" onClick={handleLogout}>
          <FiLogOut />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
