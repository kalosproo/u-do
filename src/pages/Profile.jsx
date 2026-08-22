import { useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { FiEdit2 } from "react-icons/fi";
import { auth, db } from "../services/firebase";
import {
  clearStoredProfilePhoto,
  getStoredProfilePhoto,
  resolveUserPhoto,
  setStoredProfilePhoto,
} from "../utils/profilePhoto";

const USER_COLLECTIONS = ["tasks", "planner", "expenses", "habits"];

function Profile() {
  const user = auth.currentUser;
  const userName = user?.displayName || user?.email?.split("@")[0] || "U.Do User";

  const initialPhoto = useMemo(() => resolveUserPhoto(user), [user]);
  const [photoPreview, setPhotoPreview] = useState(initialPhoto);
  const [hasCustomPhoto, setHasCustomPhoto] = useState(() => Boolean(getStoredProfilePhoto(user?.uid)));
  const [status, setStatus] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
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
      setHasCustomPhoto(true);
      setStatus("Profile photo updated.");
    };
    reader.readAsDataURL(file);
  };

  const handleUseGooglePhoto = () => {
    if (!user) return;

    clearStoredProfilePhoto(user.uid);
    setHasCustomPhoto(false);

    if (user.photoURL) {
      setPhotoPreview(user.photoURL);
      setStatus("Switched back to your Google/Gmail profile photo.");
      return;
    }

    setPhotoPreview("");
    setStatus("No Google/Gmail profile photo was found for this account.");
  };

  const handleImportClick = () => {
    document.getElementById("import-data-input")?.click();
  };

  const handleImportFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;

    const shouldImport = window.confirm(
      "Import this backup? Items with a matching ID will be overwritten. Nothing else in your workspace is deleted."
    );
    if (!shouldImport) return;

    setBusyAction("import");
    setStatus("Reading backup file...");

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const sections = parsed?.data && typeof parsed.data === "object" ? parsed.data : null;

      if (!sections) {
        setStatus("That file doesn't look like a U.Do backup.");
        return;
      }

      let importedCount = 0;
      await Promise.all(
        USER_COLLECTIONS.map(async (name) => {
          const items = Array.isArray(sections[name]) ? sections[name] : [];
          await Promise.all(
            items.map(async (item) => {
              if (!item?.id) return;
              const { id, ...rest } = item;
              await setDoc(doc(db, "users", user.uid, name, id), rest);
              importedCount += 1;
            })
          );
        })
      );

      setStatus(
        importedCount
          ? `Import complete. Restored ${importedCount} item(s). Revisit those pages to see them.`
          : "That backup didn't contain any recognizable items."
      );
    } catch (error) {
      setStatus(error?.message || "Couldn't read that file. Make sure it's a U.Do backup JSON.");
    } finally {
      setBusyAction("");
    }
  };

  const handleExportData = async () => {
    if (!user) return;

    setBusyAction("export");
    setStatus("Preparing your account backup file...");

    try {
      const sections = await Promise.all(
        USER_COLLECTIONS.map(async (name) => {
          const snap = await getDocs(collection(db, "users", user.uid, name));
          return [
            name,
            snap.docs.map((item) => ({
              id: item.id,
              ...item.data(),
            })),
          ];
        })
      );

      const payload = {
        exportedAt: new Date().toISOString(),
        user: {
          uid: user.uid,
          name: userName,
          email: user.email || "",
        },
        data: Object.fromEntries(sections),
      };

      const fileBlob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(fileBlob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `u-do-backup-${user.uid}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(downloadUrl);

      setStatus("Export complete. Backup file downloaded.");
    } catch (error) {
      setStatus(error?.message || "Failed to export your account data.");
    } finally {
      setBusyAction("");
    }
  };

  const handleClearAllData = async () => {
    if (!user) return;

    const shouldClear = window.confirm(
      "Are you sure you want to clear all your data? This removes all tasks, planner items, expenses, and habits."
    );
    if (!shouldClear) return;

    setBusyAction("clear");
    setStatus("Clearing all workspace data...");

    try {
      await Promise.all(
        USER_COLLECTIONS.map(async (name) => {
          const snap = await getDocs(collection(db, "users", user.uid, name));
          await Promise.all(snap.docs.map((item) => deleteDoc(doc(db, "users", user.uid, name, item.id))));
        })
      );

      localStorage.removeItem(`u_do_expenses_${user.uid}`);
      localStorage.removeItem("u_do_habits");

      setStatus("All account data has been cleared.");
    } catch (error) {
      setStatus(error?.message || "Failed to clear your data.");
    } finally {
      setBusyAction("");
    }
  };

  const avatarFallback = userName.trim().charAt(0).toUpperCase();

  return (
    <section className="profile-page">
      <header className="profile-header glass-panel">
        <h2>Profile</h2>
      </header>

      <article className="profile-card glass-panel">
        <div className="profile-row">
          <div className="profile-photo-wrap">
            {photoPreview ? (
              <img src={photoPreview} alt="Profile" className="profile-photo" />
            ) : (
              <div className="profile-photo profile-photo-fallback">{avatarFallback}</div>
            )}
            <label className="profile-photo-edit" htmlFor="profile-photo-input" aria-label="Change profile photo">
              <FiEdit2 />
            </label>
            <input id="profile-photo-input" type="file" accept="image/*" onChange={handleUpload} className="upload-input" />
          </div>

          <div className="profile-meta">
            <h3>{userName}</h3>
            <p>{user?.email || "Signed in"}</p>
            <small>Your Google/Gmail photo is used by default. Tap the pencil to use a different image.</small>
          </div>
        </div>

        {hasCustomPhoto ? (
          <div className="profile-actions">
            <button type="button" className="secondary" onClick={handleUseGooglePhoto}>
              Reset to Google photo
            </button>
          </div>
        ) : null}
      </article>

      <article className="profile-card glass-panel">
        <h3>Data Controls</h3>
        <p className="profile-data-copy">
          Export a backup JSON file of your account data, import a previous backup, or clear everything from your
          workspace.
        </p>
        <div className="profile-actions">
          <button type="button" onClick={handleExportData} disabled={busyAction !== ""}>
            {busyAction === "export" ? "Exporting..." : "Export My Data"}
          </button>
          <button type="button" onClick={handleImportClick} disabled={busyAction !== ""}>
            {busyAction === "import" ? "Importing..." : "Import Data"}
          </button>
          <input id="import-data-input" type="file" accept="application/json" onChange={handleImportFile} className="upload-input" />
          <button
            type="button"
            className="secondary"
            onClick={handleClearAllData}
            disabled={busyAction !== ""}
          >
            {busyAction === "clear" ? "Clearing..." : "Clear All Data"}
          </button>
        </div>

        {status ? <p className="profile-status">{status}</p> : null}
      </article>
    </section>
  );
}

export default Profile;
