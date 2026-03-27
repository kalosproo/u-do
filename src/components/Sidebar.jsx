import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
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
  const fileInputRef = useRef(null);
  const [profilePhoto, setProfilePhoto] = useState(user?.photoURL || "");
  const profileStorageKey = user?.uid ? `u-do-profile-photo-${user.uid}` : null;

  useEffect(() => {
    if (!profileStorageKey) return;
    const storedPhoto = localStorage.getItem(profileStorageKey);
    setProfilePhoto(storedPhoto || user?.photoURL || "");
  }, [profileStorageKey, user?.photoURL]);

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handlePhotoUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const uploadedPhoto = typeof reader.result === "string" ? reader.result : "";
      if (!uploadedPhoto) return;

      setProfilePhoto(uploadedPhoto);
      if (profileStorageKey) {
        localStorage.setItem(profileStorageKey, uploadedPhoto);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login", { replace: true });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <BrandLogo compact />

        <div className="sidebar-profile" aria-label="Current user profile">
          <button type="button" className="profile-avatar-btn" onClick={triggerFilePicker} title="Upload profile photo">
            {profilePhoto ? (
              <img src={profilePhoto} alt={`${userName} profile`} className="profile-avatar-image" />
            ) : (
              <span className="profile-avatar">{avatarText}</span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="profile-photo-input"
            onChange={handlePhotoUpload}
          />
          <div className="profile-text">
            <strong className="profile-name" title={userName}>{userName}</strong>
            <small className="profile-email" title="Profile">Profile</small>
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
        <p className="sidebar-credits">© 2026 U.Do — Crafted by Muttukuru Rahul.</p>
      </div>
    </aside>
  );
}

export default Sidebar;
