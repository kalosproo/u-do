import { collection } from "firebase/firestore";

import Feed from "../components/Feed.jsx";
import { db } from "../services/firebase.js";
import { formatMoney, shortId, timeAgo } from "../utils/format.js";

/** Every payment attempt, newest first, filterable by status. */
export default function Payments() {
  return (
    <Feed
      title="Payments"
      note="Live list of payment attempts. Filter to failed to see who needs a nudge."
      collectionRef={db ? collection(db, "payments") : null}
      filterField="status"
      filterLabel="Filter by status"
      empty={<><strong>No payments</strong>No payment provider is connected yet, so nothing writes here. This screen fills in live the moment payments are wired up.</>}
      renderRow={(entry) => (
        <div className="row" key={entry.id}>
          <span className="row-main">
            <span className="tag" data-tone={entry.status === "failed" ? "bad" : undefined}>{entry.status || "unknown"}</span>{" "}
            {formatMoney(entry)}
            <span className="row-id"> · {shortId(entry.uid)}</span>
          </span>
          <span className="row-time">{timeAgo(entry.createdAt)}</span>
        </div>
      )}
    />
  );
}
