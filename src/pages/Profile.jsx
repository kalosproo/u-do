import { useMemo, useState } from "react";
import { auth } from "../services/firebase";
import {
  clearStoredProfilePhoto,
  resolveUserPhoto,
  setStoredProfilePhoto,
} from "../utils/profilePhoto";

function Profile() {
  const user = auth.currentUser;
  const userName = user?.displayName || user?.email?.split("@")[0] || "U.Do User";

  const initialPhoto = useMemo(() => resolveUserPhoto(user), [user]);
  const [photoPreview, setPhotoPreview] = useState(initialPhoto);
  const [status, setStatus] = useState("");

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl) {
        setStatus("Could not read this image. Try another file.");
        return;
      }

      setStoredProfilePhoto(user.uid, dataUrl);
      setPhotoPreview(dataUrl);
      setStatus("Profile photo updated from your local file.");
    };
    reader.readAsDataURL(file);
  };

  const handleUseGooglePhoto = () => {
    if (!user) return;

    if (user.photoURL) {
      clearStoredProfilePhoto(user.uid);
      setPhotoPreview(user.photoURL);
      setStatus("Switched back to your Google/Gmail profile photo.");
      return;
    }

    setStatus("No Google/Gmail profile photo was found for this account.");
  };

  const avatarFallback = userName.trim().charAt(0).toUpperCase();

  return (
    <section className="profile-page">
      <header className="profile-header glass-panel">
        <h2>Profile</h2>
      </header>

      <article className="profile-card glass-panel">
        <div className="profile-row">
          {photoPreview ? (
            <img src={photoPreview} alt="Profile" className="profile-photo" />
          ) : (
            <div className="profile-photo profile-photo-fallback">{avatarFallback}</div>
          )}

          <div className="profile-meta">
            <h3>{userName}</h3>
            <p>{user?.email || "Signed in"}</p>
            <small>
              Default photo uses your Google/Gmail profile image. You can override it by uploading a
              local image file.
            </small>
          </div>
        </div>

        <div className="profile-actions">
          <label className="upload-label" htmlFor="profile-photo-input">
            Upload local photo
          </label>
          <input
            id="profile-photo-input"
            type="file"
            accept="image/*"
            onChange={handleUpload}
            className="upload-input"
          />

          <button type="button" className="secondary" onClick={handleUseGooglePhoto}>
            Use Gmail photo
          </button>
        </div>

        {status ? <p className="profile-status">{status}</p> : null}
      </article>
    </section>
  );
}

export default Profile;
