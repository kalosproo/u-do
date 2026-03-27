import { useMemo, useState } from "react";
import { updateProfile } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
} from "firebase/firestore";
import { auth, db } from "../services/firebase";

const USER_COLLECTIONS = ["tasks", "planner", "expenses", "habits"];

function Profile() {
  const user = auth.currentUser;
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [clearingData, setClearingData] = useState(false);

  const userName = user?.displayName || user?.email?.split("@")[0] || "User";
  const avatarFallback = userName.trim().charAt(0).toUpperCase();

  const localStorageKeys = useMemo(() => {
    if (!user) return [];

    return [
      `u_do_expenses_${user.uid}`,
      `u_do_tasks_${user.uid}`,
      `u_do_habits_${user.uid}`,
      `u_do_planner_${user.uid}`,
    ];
  }, [user]);

  const handleUpdateDp = async () => {
    if (!user) return;

    const trimmed = photoURL.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      alert("Enter a valid image URL starting with http:// or https://");
      return;
    }

    try {
      setSavingPhoto(true);
      await updateProfile(user, { photoURL: trimmed || null });
      alert("Profile picture updated ✅");
    } catch {
      alert("Failed to update profile picture. Try again.");
    } finally {
      setSavingPhoto(false);
    }
  };

  const downloadJSON = (filename, payload) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportData = async () => {
    if (!user) return;

    try {
      const exported = {
        exportedAt: new Date().toISOString(),
        user: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || "",
          photoURL: user.photoURL || "",
        },
      };

      const snapshots = await Promise.all(
        USER_COLLECTIONS.map((name) => getDocs(collection(db, "users", user.uid, name)))
      );

      USER_COLLECTIONS.forEach((name, index) => {
        exported[name] = snapshots[index].docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
      });

      const localData = {};
      localStorageKeys.forEach((key) => {
        const value = localStorage.getItem(key);
        if (value) {
          try {
            localData[key] = JSON.parse(value);
          } catch {
            localData[key] = value;
          }
        }
      });

      exported.localStorage = localData;

      downloadJSON(`u-do-data-${user.uid}.json`, exported);
    } catch {
      alert("Unable to export data right now.");
    }
  };

  const clearCollection = async (collectionName) => {
    if (!user) return;

    const snapshot = await getDocs(collection(db, "users", user.uid, collectionName));
    await Promise.all(snapshot.docs.map((item) => deleteDoc(doc(db, "users", user.uid, collectionName, item.id))));
  };

  const handleClearAllData = async () => {
    if (!user) return;

    const approved = window.confirm(
      "This will permanently delete all your tasks, planner entries, expenses, and habits. Continue?"
    );

    if (!approved) return;

    try {
      setClearingData(true);
      await Promise.all(USER_COLLECTIONS.map((name) => clearCollection(name)));
      localStorageKeys.forEach((key) => localStorage.removeItem(key));
      alert("All your app data has been cleared.");
    } catch {
      alert("Failed to clear data. Please try again.");
    } finally {
      setClearingData(false);
    }
  };

  return (
    <section className="profile-page">
      <header className="profile-header glass-panel">
        <h2>Profile</h2>
        <p>Manage your picture and privacy controls.</p>
      </header>

      <div className="profile-grid">
        <article className="glass-panel profile-card">
          <h3>Profile Picture</h3>

          <div className="profile-picture-row">
            {photoURL ? (
              <img
                src={photoURL}
                alt="Profile"
                className="profile-preview"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="profile-preview profile-fallback">{avatarFallback}</div>
            )}

            <div className="profile-picture-form">
              <label htmlFor="dp-url">Photo URL</label>
              <input
                id="dp-url"
                type="url"
                placeholder="https://example.com/avatar.jpg"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
              />
              <small>Paste an image URL to set your display picture.</small>

              <button onClick={handleUpdateDp} disabled={savingPhoto}>
                {savingPhoto ? "Saving..." : "Update DP"}
              </button>
            </div>
          </div>
        </article>

        <article className="glass-panel profile-card">
          <h3>Data Controls</h3>
          <p>Export your data as JSON or clear everything from your account.</p>

          <div className="profile-actions">
            <button onClick={handleExportData}>Export My Data</button>
            <button className="danger" onClick={handleClearAllData} disabled={clearingData}>
              {clearingData ? "Clearing..." : "Clear All Data"}
            </button>
          </div>
        </article>
      </div>
    </section>
  );
}

export default Profile;
