import { useMemo, useState } from "react";
import { collection, limit, orderBy, query } from "firebase/firestore";

import ConnectionBadge from "../components/ConnectionBadge.jsx";
import { describe } from "../utils/errors.js";
import { db } from "../services/firebase.js";
import { useLiveCollection } from "../hooks/useLiveCollection.js";
import { formatCount, shortId, timeAgo } from "../utils/format.js";
import { COUNTERS, currentMonthKey } from "../utils/counters.js";

const TOP = 25;

/**
 * The heaviest accounts for one counter, live.
 *
 * Counters are numbers, never content: this screen can tell you someone has
 * 400 active tasks, not what any of them say. A monthly counter left over
 * from a past month is the server's last recount, not this month's figure,
 * so those rows are hidden rather than shown as current.
 */
export default function Usage() {
  const [field, setField] = useState(COUNTERS[0].field);
  const spec = COUNTERS.find((entry) => entry.field === field);

  const top = useLiveCollection(
    useMemo(
      () => (db ? query(collection(db, "usageCounters"), orderBy(`counters.${field}`, "desc"), limit(TOP)) : null),
      [field],
    ),
  );

  const month = currentMonthKey();
  const rows = top.docs.filter((entry) => !spec.monthKey || entry[spec.monthKey] === month);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Usage</h1>
          <p className="page-note">
            The {TOP} heaviest accounts for one counter, kept live by the server. Counts only — never what anyone wrote.
          </p>
        </div>
        <div className="head-tools">
          <ConnectionBadge state={top.status} />
          <select value={field} onChange={(event) => setField(event.target.value)} aria-label="Counter">
            {COUNTERS.map((entry) => (
              <option key={entry.field} value={entry.field}>{entry.label}</option>
            ))}
          </select>
        </div>
      </div>

      {top.error ? <p className="notice">{describe(top.error)}</p> : null}

      <section className="panel">
        <header className="panel-head">
          <h2>{spec.label}</h2>
          <span className="panel-count">{rows.length}</span>
        </header>
        <div className="panel-body">
          {rows.length === 0 && top.status !== "loading" && !top.error ? (
            <div className="empty">
              <strong>Nothing counted yet</strong>
              Counters fill in as people use the app, once the usage functions are deployed and the backfill has run.
            </div>
          ) : (
            rows.map((entry) => (
              <div className="row" key={entry.id}>
                <span className="row-main">
                  {shortId(entry.uid || entry.id)}
                  <span className="row-id"> · active {timeAgo(entry.lastActiveAt)}</span>
                </span>
                <span className="row-time">{formatCount(entry.counters?.[field] ?? 0)}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
