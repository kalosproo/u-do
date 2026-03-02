import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { FiGrid, FiDollarSign, FiCalendar, FiCheckSquare, FiActivity, FiLogOut } from "react-icons/fi";
import { auth } from "../services/firebase";

const links = [
  { to: "/", label: "Home", icon: <FiGrid /> },
  { to: "/finance", label: "Finance", icon: <FiDollarSign /> },
  { to: "/planner", label: "Planner", icon: <FiCalendar /> },
  { to: "/tasks", label: "Tasks", icon: <FiCheckSquare /> },
  { to: "/habits", label: "Habits", icon: <FiActivity /> },
];

function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login", { replace: true });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <h2 className="logo">U.Do</h2>

        <nav className="nav-links">
          {links.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} end={to === "/"}>
              {icon}
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
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
