import { NavLink } from "react-router-dom";

function Sidebar({ onLogout }) {
  function Sidebar({ onLogout }) {
  const toggleTheme = () => {
    document.body.classList.toggle("light");
  };

  return (
    <aside className="sidebar">
      {/* existing code unchanged */}

      <div className="sidebar-bottom">
        <button className="mode-btn" onClick={toggleTheme}>
          Light Mode
        </button>
        <button className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </aside>
  );
}

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
        <button className="mode-btn">Light Mode</button>
        <button className="logout-btn" onClick={onLogout}>
          Logout
        </button>
        
      </div>
    </aside>
  );
}

export default Sidebar;
