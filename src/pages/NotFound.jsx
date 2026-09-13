import { Link, useLocation } from "react-router-dom";
import { FiArrowLeft, FiCompass } from "react-icons/fi";

const LINKS = [
  ["/", "Dashboard"],
  ["/tasks", "Tasks"],
  ["/habits", "Habits"],
  ["/planner", "Planner"],
  ["/finance", "Finance"],
  ["/friends", "Friends"],
];

/** Shown for any address that isn't a real page, rather than a silent redirect. */
function NotFound() {
  const location = useLocation();

  return (
    <section className="page error-page">
      <div className="panel error-card">
        <span className="error-code">404</span>
        <h1 className="page-title">This page doesn&apos;t exist</h1>
        <p className="page-sub">
          Nothing is served at <code className="friends-code">{location.pathname}</code>. It may have
          been renamed, or the link was mistyped.
        </p>

        <div className="toolbar">
          <Link to="/" className="btn btn-primary">
            <FiArrowLeft /> Back to dashboard
          </Link>
        </div>

        <div className="error-links">
          <span className="panel-note">
            <FiCompass /> Or jump to:
          </span>
          {LINKS.map(([to, label]) => (
            <Link key={to} to={to} className="chip">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default NotFound;
