import { useMemo, useRef, useState } from "react";
import { FiDownload, FiTrash2, FiUpload } from "react-icons/fi";
import { useAuth } from "../hooks/useAuth";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { todayKey } from "../utils/dateKeys";
import { resolveUserPhoto } from "../utils/profilePhoto";
import {
  clearWorkspace,
  exportWorkspace,
  importWorkspace,
  inspectBackup,
} from "../services/workspace";
import NotificationSettings from "../components/NotificationSettings";

const IMPORT_MODE_OPTIONS = [
  ["merge", "Keep newer", "Existing entries stay if they were changed more recently than the backup."],
  ["replace", "Overwrite", "The backup wins for every entry it contains."],
];

const SECTION_LABEL = {
  tasks: "Tasks",
  planner: "Planner entries",
  expenses: "Transactions",
  habits: "Habits",
};

function Profile() {
  const { user } = useAuth();
  const requireUser = useAuthGuard();
  const fileInputRef = useRef(null);

  const [status, setStatus] = useState({ tone: "", text: "" });
  const [busyAction, setBusyAction] = useState("");
  const [pendingImport, setPendingImport] = useState(null);
  const [importMode, setImportMode] = useState("merge");

  const userName = user?.displayName || user?.email?.split("@")[0] || "U.Do User";
  const photo = useMemo(() => resolveUserPhoto(user), [user]);
  const avatarFallback = userName.trim().charAt(0).toUpperCase();

  const say = (tone, text) => setStatus({ tone, text });

  const handleExport = async () => {
    const currentUser = requireUser();
    if (!currentUser) return;

    setBusyAction("export");
    say("", "Preparing your backup…");

    try {
      const payload = {
        exportedAt: new Date().toISOString(),
        user: { uid: currentUser.uid, name: userName, email: currentUser.email || "" },
        data: await exportWorkspace(currentUser.uid),
      };

      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `u-do-backup-${currentUser.uid}-${todayKey()}.json`;
      link.click();
      URL.revokeObjectURL(url);

      say("success", "Export complete — check your downloads.");
    } catch (error) {
      say("error", error?.message || "Failed to export your data.");
    } finally {
      setBusyAction("");
    }
  };

  // Read and validate first; nothing is written until the summary is confirmed.
  const handleFileChosen = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!requireUser() || !file) return;

    if (!/\.json$/i.test(file.name)) {
      say("error", "Pick the .json backup file that Export produced.");
      return;
    }

    try {
      const raw = await file.text();
      setPendingImport({ raw, name: file.name, ...inspectBackup(raw) });
      say("", "");
    } catch (error) {
      setPendingImport(null);
      say("error", error?.message || "Couldn't read that file.");
    }
  };

  const confirmImport = async () => {
    const currentUser = requireUser();
    if (!currentUser || !pendingImport) return;

    setBusyAction("import");

    try {
      const result = await importWorkspace(currentUser.uid, pendingImport.raw, { mode: importMode });
      setPendingImport(null);

      const kept = result.skippedTotal
        ? `, kept ${result.skippedTotal} newer local ${result.skippedTotal === 1 ? "entry" : "entries"}`
        : "";
      say("success", `Imported ${result.total} record${result.total === 1 ? "" : "s"}${kept}.`);
    } catch (error) {
      say("error", error?.message || "Import failed. Nothing else was changed.");
    } finally {
      setBusyAction("");
    }
  };

  const handleClear = async () => {
    const currentUser = requireUser();
    if (!currentUser) return;

    const typed = window.prompt(
      "This permanently deletes every task, habit, planner entry and transaction in this account.\n\nType DELETE to confirm."
    );

    if (typed !== "DELETE") {
      if (typed !== null) say("", "Nothing was deleted.");
      return;
    }

    setBusyAction("clear");
    say("", "Clearing your workspace…");

    try {
      await clearWorkspace(currentUser.uid);
      say("success", "All workspace data cleared.");
    } catch (error) {
      say("error", error?.message || "Failed to clear your data.");
    } finally {
      setBusyAction("");
    }
  };

  const busy = busyAction !== "";

  return (
    <section className="profile-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Profile</h1>
          <p className="page-sub">Your account and its data.</p>
        </div>
      </header>

      <article className="panel profile-card">
        <div className="profile-row">
          {photo ? (
            <img src={photo} alt="" className="profile-photo" />
          ) : (
            <div className="profile-photo profile-photo-fallback">{avatarFallback}</div>
          )}

          <div className="profile-meta">
            <h3>{userName}</h3>
            <p>{user?.email || "Signed in"}</p>
            <p className="panel-note">Your picture comes from the Google account you sign in with.</p>
          </div>
        </div>
      </article>

      <NotificationSettings />

      <article className="panel profile-card">
        <div className="panel-head">
          <h3 className="panel-title">Your data</h3>
        </div>

        <p className="profile-data-copy">
          Export writes a JSON backup of your tasks, habits, planner and transactions. Import
          restores one into this account — entries sharing an id are overwritten.
        </p>

        <div className="profile-actions">
          <button type="button" className="btn" onClick={handleExport} disabled={busy}>
            <FiUpload /> {busyAction === "export" ? "Exporting…" : "Export data"}
          </button>

          <button
            type="button"
            className="btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            <FiDownload /> Import data
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="upload-input"
            onChange={handleFileChosen}
          />
        </div>

        {pendingImport ? (
          <div className="import-preview">
            <strong>{pendingImport.name}</strong>
            {pendingImport.exportedAt ? (
              <span className="panel-note">
                Exported {new Date(pendingImport.exportedAt).toLocaleString()}
              </span>
            ) : null}

            {Object.entries(pendingImport.counts).map(([name, count]) => (
              <span key={name} className="import-row">
                <span>{SECTION_LABEL[name] || name}</span>
                <strong>{count}</strong>
              </span>
            ))}

            <div className="field">
              <span>If an entry already exists</span>
              <div className="toolbar">
                {IMPORT_MODE_OPTIONS.map(([value, label, hint]) => (
                  <button
                    key={value}
                    type="button"
                    title={hint}
                    className={`chip ${importMode === value ? "active" : ""}`}
                    onClick={() => setImportMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="panel-note">
                {IMPORT_MODE_OPTIONS.find(([value]) => value === importMode)?.[2]}
              </span>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setPendingImport(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={confirmImport} disabled={busy}>
                {busyAction === "import"
                  ? "Importing…"
                  : `Import ${pendingImport.total} record${pendingImport.total === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        ) : null}

        {status.text ? (
          <p className={`profile-status ${status.tone ? `is-${status.tone}` : ""}`}>{status.text}</p>
        ) : null}
      </article>

      <article className="panel profile-card">
        <div className="panel-head">
          <h3 className="panel-title">Danger zone</h3>
        </div>

        <p className="profile-data-copy">
          Clearing removes every task, habit, planner entry and transaction in this account. It
          cannot be undone — export first if you might want any of it back.
        </p>

        <div className="profile-actions">
          <button type="button" className="btn btn-danger" onClick={handleClear} disabled={busy}>
            <FiTrash2 /> {busyAction === "clear" ? "Clearing…" : "Clear all data"}
          </button>
        </div>
      </article>
    </section>
  );
}

export default Profile;
