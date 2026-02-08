import { NavLink } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../services/firebase";


function Sidebar({ onLogout, toggleTheme, theme }) {
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
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/finance">Finance</NavLink>
          <NavLink to="/planner">Planner</NavLink>
          <NavLink to="/tasks">Tasks</NavLink>
          <NavLink to="/habits">Habits</NavLink>
        </nav>
      </div>

      <div className="sidebar-bottom">
        <button className="mode-btn" onClick={toggleTheme}>
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>

        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
