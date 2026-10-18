import { useMemo, useState } from "react";
import { Timestamp, collection, query, where } from "firebase/firestore";

import { describe } from "../utils/errors.js";
import { db } from "../services/firebase.js";
import { useCounts } from "../hooks/useCounts.js";
import { formatCount } from "../utils/format.js";

const WINDOWS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
];

/** Every event type the server writes. A count of zero is a real answer here. */
const EVENTS = [
  ["signup", "Signups"],
  ["task_created", "Tasks created"],
  ["task_completed", "Tasks completed"],
  ["habit_created", "Habits created"],
  ["plan_created", "Plans created"],
  ["transaction_added", "Transactions added"],
  ["friend_added", "Friendships"],
  ["account_deleted", "Accounts deleted"],
];

/**
 * A period summary built from server-side counts, with a CSV of the same.
 *
 * Every number is a count query: nothing here pulls a collection into the
 * browser, so the report costs the same whether U.Do has a hundred accounts
 * or a hundred thousand.
 */
export default function Reports() {
  const [days, setDays] = useState(7);
  const [now] = useState(() => Date.now());
  const since = useMemo(() => Timestamp.fromMillis(now - days * 86_400_000), [now, days]);

  const counts = useCounts(
    useMemo(() => {
      if (!db) return {};
      const out = {
        newAccounts: query(collection(db, "billing"), where("createdAt", ">=", since)),
        activeAccounts: query(collection(db, "usageCounters"), where("lastActiveAt", ">=", since)),
        totalAccounts: collection(db, "billing"),
        errors: query(collection(db, "errorLogs"), where("createdAt", ">=", since)),
      };
      EVENTS.forEach(([type]) => {
        out[type] = query(collection(db, "activityEvents"), where("type", "==", type), where("createdAt", ">=", since));
      });
      return out;
    }, [since]),
    [days],
  );

  const lines = [
    ["New accounts", "newAccounts"],
    ["Active accounts", "activeAccounts"],
    ["All accounts", "totalAccounts"],
    ...EVENTS.map(([type, label]) => [label, type]),
    ["Distinct errors", "errors"],
  ];

  const value = (key) =>
    counts.errors[key] ? null : counts.values[key] === undefined ? undefined : counts.values[key];

  const download = () => {
    const rows = [["Metric", `Last ${days} days`], ...lines.map(([label, key]) => [label, value(key) ?? ""])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `u-do-report-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const failed = Object.entries(counts.errors);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p className="page-note">Accounts, activity and errors over a period, from server-side counts.</p>
        </div>
        <div className="head-tools">
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Period">
            {WINDOWS.map((window) => (
              <option key={window.days} value={window.days}>{window.label}</option>
            ))}
          </select>
          <button type="button" className="button" data-variant="quiet" onClick={download} disabled={counts.status !== "ready"}>
            Download CSV
          </button>
        </div>
      </div>

      {failed.length ? (
        <p className="notice">{failed.length} figure{failed.length === 1 ? "" : "s"} could not be counted: {describe(failed[0][1])}</p>
      ) : null}

      <section className="panel">
        <header className="panel-head">
          <h2>Last {days} days</h2>
        </header>
        <div className="panel-body">
          {lines.map(([label, key]) => {
            const v = value(key);
            return (
              <div className="row" key={key}>
                <span className="row-main">{label}</span>
                <span className="row-time">{v === undefined ? "…" : v === null ? "—" : formatCount(v)}</span>
              </div>
            );
          })}
        </div>
        <footer className="panel-foot">
          <p className="page-note" style={{ margin: 0 }}>
            "All accounts" is all time. Errors count distinct errors per day, not occurrences.
          </p>
        </footer>
      </section>
    </>
  );
}
