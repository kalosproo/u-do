import React from "react";
import { FiLogOut } from "react-icons/fi";

function Sidebar({ user, handleAuthAction }) {
  return (
    <>
      <aside>
        <div>
          {/* existing sidebar content remains unchanged */}
          <button
            className="logout-btn"
            onClick={handleAuthAction}
            title={user ? "Logout" : "Login"}
          >
            <FiLogOut />
            <span>{user ? "Logout" : "Login"}</span>
          </button>

          <div className="sidebar-credits">
            <p>© 2026 U.Do — Crafted by Rahul Muttukuru · Designed by Haniii</p>
          </div>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
