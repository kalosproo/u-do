import { collection } from "firebase/firestore";

import Feed from "../components/Feed.jsx";
import { db } from "../services/firebase.js";
import { timeAgo } from "../utils/format.js";

/**
 * Crash reports from the app and the server. One row per distinct error per
 * day, with a count — a crash that hit a hundred people is one line.
 * Reports carry no account id and are pruned after 30 days.
 */
export default function Errors() {
  return (
    <Feed
      title="Errors"
      note="Crashes reported by the app and by the server's own functions. Scrubbed of emails, long numbers and URL details before storage; never tied to an account. Kept 30 days."
      collectionRef={db ? collection(db, "errorLogs") : null}
      filterField="severity"
      filterLabel="Filter by severity"
      empty={
        <>
          <strong>No errors reported</strong>
          Nothing has crashed in the last 30 days — or the reporting functions are not deployed yet.
        </>
      }
      renderRow={(entry) => (
        <details className="row-details" key={entry.id}>
          <summary className="row">
            <span className="row-main">
              {entry.severity === "critical" ? <span className="tag" data-tone="bad">critical</span> : null}{" "}
              {entry.message || "Error"}
              <span className="row-id">
                {" "}· {entry.source || "unknown"}
                {entry.route ? ` · ${entry.route}` : ""}
                {entry.count > 1 ? ` · ×${entry.count}` : ""}
              </span>
            </span>
            <span className="row-time">{timeAgo(entry.createdAt)}</span>
          </summary>
          {entry.stack ? <pre className="stack">{entry.stack}</pre> : <p className="page-note stack-none">No stack trace.</p>}
        </details>
      )}
    />
  );
}
