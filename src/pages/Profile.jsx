import { useMemo, useState } from "react";
import { deleteDoc, doc, getDocs, writeBatch, collection } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { auth, db } from "../services/firebase";

const DATA_COLLECTIONS = ["tasks", "planner", "expenses", "habits"];

const formatDate = (value) => {
  if (!value) return null;
  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  return value;
};

function normalizeRecords(snapshot) {
  return snapshot.docs.map((document) => {
    const payload = document.data();
    const normalized = {};

    Object.entries(payload).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        normalized[key] = value.map((entry) => formatDate(entry));
      } else if (value && typeof value === "object" && !value.toDate) {
        normalized[key] = Object.fromEntries(
          Object.entries(value).map(([itemKey, itemValue]) => [itemKey, formatDate(itemValue)])
        );
      } else {
        normalized[key] = formatDate(value);
      }
    });

    return {
      id: document.id,
      ...normalized,
    };
  });
}

function Profile() {
  const user = auth.currentUser;
  const [avatarInput, setAvatarInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const fallbackAvatar = useMemo(() => {
    const name = user?.displayName || user?.email?.split("@")[0] || "U";
    return name.trim().charAt(0).toUpperCase();
  }, [user]);

  if (!user) {
    return (
      <section className="profile-page">
        <p>Please login to manage your profile.</p>
      </section>
    );
  }

  const handleAvatarUpdate = async () => {
    const photoURL = avatarInput.trim();

    if (!photoURL) {
      setStatus("Please paste a valid image URL for your DP.");
      return;
    }

    setBusy(true);
    setStatus("");

    try {
      await updateProfile(user, { photoURL });
      await user.reload();
      setStatus("Profile photo updated successfully.");
      setAvatarInput("");
    } catch (error) {
      setStatus(`Unable to update DP: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleExportData = async () => {
    setBusy(true);
    setStatus("");

    try {
      const snapshots = await Promise.all(
        DATA_COLLECTIONS.map((name) => getDocs(collection(db, "users", user.uid, name)))
      );

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        profile: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
        },
        data: Object.fromEntries(
          snapshots.map((snapshot, index) => [DATA_COLLECTIONS[index], normalizeRecords(snapshot)])
        ),
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `u-do-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      setStatus("Your data export has started.");
    } catch (error) {
      setStatus(`Could not export your data: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleClearAllData = async () => {
    const confirmed = window.confirm(
      "This will permanently delete all your tasks, planner items, expenses, and habits. Continue?"
    );

    if (!confirmed) {
      return;
    }

    setBusy(true);
    setStatus("");

    try {
      for (const collectionName of DATA_COLLECTIONS) {
        const snapshot = await getDocs(collection(db, "users", user.uid, collectionName));

        if (!snapshot.empty) {
          const batch = writeBatch(db);
          snapshot.docs.forEach((item) => {
            batch.delete(item.ref);
          });
          await batch.commit();
        }
      }

      const notesDocRef = doc(db, "users", user.uid, "notes", "content");
      await deleteDoc(notesDocRef).catch(() => null);

      setStatus("All app data has been cleared.");
    } catch (error) {
      setStatus(`Could not clear data: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="profile-page">
      <header className="page-title-pill">
        <h2 className="page-title">Profile</h2>
      </header>

      <article className="wire-card profile-card">
        <div className="profile-hero">
          {user.photoURL ? (
            <img className="profile-avatar profile-avatar-large" src={user.photoURL} alt="Profile avatar" />
          ) : (
            <span className="profile-avatar profile-avatar-large">{fallbackAvatar}</span>
          )}
          <div>
            <h3>{user.displayName || "U.Do User"}</h3>
            <p>{user.email}</p>
          </div>
        </div>

        <label htmlFor="avatar-input">Update DP (image URL)</label>
        <div className="profile-actions-row">
          <input
            id="avatar-input"
            type="url"
            placeholder="https://example.com/your-photo.jpg"
            value={avatarInput}
            onChange={(event) => setAvatarInput(event.target.value)}
            disabled={busy}
          />
          <button onClick={handleAvatarUpdate} disabled={busy}>
            Update DP
          </button>
        </div>
      </article>

      <article className="wire-card profile-card">
        <h3>Data Controls</h3>
        <p>Export a backup JSON file of your account data or clear everything from your workspace.</p>

        <div className="profile-actions-row profile-actions-stack">
          <button onClick={handleExportData} disabled={busy}>
            Export My Data
          </button>
          <button className="danger-action" onClick={handleClearAllData} disabled={busy}>
            Clear All Data
          </button>
        </div>

        {status && <p className="profile-status">{status}</p>}
      </article>
    </section>
  );
}

export default Profile;
