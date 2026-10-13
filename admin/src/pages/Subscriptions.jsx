import { collection } from "firebase/firestore";

import Feed from "../components/Feed.jsx";
import { db } from "../services/firebase.js";
import { formatDate, shortId, timeAgo } from "../utils/format.js";

/** Pro subscriptions, newest first, filterable by status. */
export default function Subscriptions() {
  return (
    <Feed
      title="Subscriptions"
      note="Live list of Pro subscriptions. Filter by status to find halted or pending ones."
      collectionRef={db ? collection(db, "subscriptions") : null}
      filterField="status"
      filterLabel="Filter by status"
      empty={<><strong>No subscriptions</strong>No payment provider is connected yet, so nothing writes here. This screen fills in live the moment payments are wired up.</>}
      renderRow={(entry) => (
        <div className="row" key={entry.id}>
          <span className="row-main">
            <span className="tag" data-tone={entry.status === "halted" ? "bad" : undefined}>{entry.status || "unknown"}</span>{" "}
            {shortId(entry.uid)}
            <span className="row-id">
              {entry.provider ? ` · ${entry.provider}` : ""}
              {entry.currentPeriodEnd ? ` · renews ${formatDate(entry.currentPeriodEnd)}` : ""}
            </span>
          </span>
          <span className="row-time">{timeAgo(entry.createdAt)}</span>
        </div>
      )}
    />
  );
}
