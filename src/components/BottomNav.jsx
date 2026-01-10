import { Link, useLocation } from "react-router-dom";

function BottomNav() {
  const { pathname } = useLocation();

  const linkStyle = (path) => ({
    padding: "10px",
    color: pathname === path ? "#fff" : "#aaa",
    textDecoration: "none",
  });
<Link to="/planner" style={linkStyle("/planner")}>
  Planner
</Link>
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        width: "100%",
        background: "#111",
        display: "flex",
        justifyContent: "space-around",
      }}
    >
      <Link to="/" style={linkStyle("/")}>Home</Link>
      <Link to="/finance" style={linkStyle("/finance")}>Finance</Link>
      <Link to="/planner" style={linkStyle("/planner")}>Planner</Link>
      <Link to="/tasks" style={linkStyle("/tasks")}>Tasks</Link>
      <Link to="/habits" style={linkStyle("/habits")}>Habits</Link>
    </div>
  );
}

export default BottomNav;
