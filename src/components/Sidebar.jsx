import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  FiGrid,
  FiDollarSign,
  FiCalendar,
  FiCheckSquare,
  FiActivity,
  FiUser,
  FiLogOut,
} from "react-icons/fi";
import { auth } from "../services/firebase";
import BrandLogo from "./BrandLogo";
import AIAssistant from "./AIAssistant";
import { resolveUserPhoto } from "../utils/profilePhoto";

const links = [
  { to: "/", label: "Home", icon: <FiGrid /> },
  { to: "/finance", label: "Finance", icon: <FiDollarSign /> },
  { to: "/planner", label: "Planner", icon: <FiCalendar /> },
  { to: "/tasks", label: "Tasks", icon: <FiCheckSquare /> },
  { to: "/habits", label: "Habits", icon: <FiActivity /> },
  { to: "/profile", label: "Profile", icon: <FiUser /> },
];

function Sidebar() {
  const navigate = useNavigate();
  const user = auth.currentUser;
  const userName = user?.displayName || user?.email?.split("@")[0] || "User";
  const avatarText = userName.trim().charAt(0).toUpperCase();
  const profilePhoto = resolveUserPhoto(user);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login", { replace: true });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <BrandLogo compact />

        <NavLink to="/profile" className="sidebar-profile" aria-label="Open profile">
          {profilePhoto ? (
            <img src={profilePhoto} alt="Profile" className="profile-avatar profile-avatar-image" />
          ) : (
            <span className="profile-avatar">{avatarText}</span>
          )}
          <div className="profile-text">
            <strong className="profile-name">Profile</strong>
          </div>
        </NavLink>

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
        <p className="sidebar-credits">© 2026 U.Do — Crafted by Muttukuru Rahul.</p>
      </div>
    </aside>
  );
}

export default Sidebar;
