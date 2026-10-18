import { useState } from "react";

import { useAdminAuth } from "../hooks/useAdminAuth.js";
import { backfillBilling, seedPlanLimits } from "../services/adminApi.js";
import { readableError } from "../utils/format.js";

const ACTIONS = [
  {
    id: "seed",
    label: "Seed plan limits",
    run: seedPlanLimits,
    describe: "Publishes the Free and Pro plan table from the code to Firestore. Safe to repeat; a Pro price you have set is kept.",
    done: (result) => `Published ${result?.planIds?.join(", ") || "plans"}.`,
  },
  {
    id: "backfill",
    label: "Backfill billing",
    run: backfillBilling,
    describe:
      "Gives every account that predates the signup trigger a billing and usage record, so it appears in the counts. Existing records are never overwritten.",
    done: (result) => `Scanned ${result?.scanned ?? 0} accounts, created ${result?.created ?? 0} records.`,
  },
];

/**
 * Who you are, what this console is connected to, and the owner-only
 * maintenance actions. Each action is written to the audit log by the server
 * in the same call that performs it.
 */
export default function Settings() {
  const { user, role } = useAdminAuth();
  const [busy, setBusy] = useState("");
  const [results, setResults] = useState({});
  const owner = role === "owner";

  const run = async (action) => {
    if (!window.confirm(`${action.label}?\n\n${action.describe}`)) return;
    setBusy(action.id);
    try {
      const result = await action.run({});
      setResults((prev) => ({ ...prev, [action.id]: { ok: true, text: action.done(result) } }));
    } catch (error) {
      setResults((prev) => ({ ...prev, [action.id]: { ok: false, text: readableError(error, "That failed.") } }));
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="page-note">Your access, this console's connection, and maintenance actions.</p>
        </div>
      </div>

      <div className="split">
        <section className="panel">
          <header className="panel-head">
            <h2>You</h2>
          </header>
          <dl className="facts">
            <div className="fact"><dt>Signed in as</dt><dd>{user?.email || "—"}</dd></div>
            <div className="fact"><dt>Role</dt><dd><span className="tag">{role || "—"}</span></dd></div>
            <div className="fact"><dt>Project</dt><dd><code>{import.meta.env.VITE_FIREBASE_PROJECT_ID || "—"}</code></dd></div>
            <div className="fact"><dt>Build</dt><dd>{import.meta.env.MODE}</dd></div>
          </dl>
          <footer className="panel-foot">
          <p className="page-note" style={{ margin: 0 }}>
            Admin access is a custom claim on your account, granted only by the server. Sign out and back in after it changes.
          </p>
        </footer>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Maintenance</h2>
          </header>
          <div className="panel-pad">
            {!owner ? (
              <p className="page-note">These actions need the owner role.</p>
            ) : null}
            {ACTIONS.map((action) => (
              <div className="setting" key={action.id}>
                <div>
                  <strong>{action.label}</strong>
                  <p className="page-note">{action.describe}</p>
                  {results[action.id] ? (
                    <p className={results[action.id].ok ? "page-note" : "notice"} role="status">{results[action.id].text}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="button"
                  data-variant="quiet"
                  onClick={() => run(action)}
                  disabled={!owner || busy !== ""}
                >
                  {busy === action.id ? "Running…" : "Run"}
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
