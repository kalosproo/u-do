import { collection } from "firebase/firestore";

import Feed from "../components/Feed.jsx";
import { db } from "../services/firebase.js";
import { timeAgo } from "../utils/format.js";

/**
 * Receipts for incoming payment-provider webhooks: event id, type, status and
 * retries. The signed payload itself is never stored.
 */
export default function Webhooks() {
  return (
    <Feed
      title="Webhooks"
      note="Receipts for events sent by the payment provider — type, status, retries. The payload is never stored."
      collectionRef={db ? collection(db, "webhookEvents") : null}
      filterField="status"
      filterLabel="Filter by status"
      empty={<><strong>No webhook events</strong>No payment provider is connected yet, so nothing writes here. This screen fills in live the moment payments are wired up.</>}
      renderRow={(entry) => (
        <div className="row" key={entry.id}>
          <span className="row-main">
            <span className="tag" data-tone={entry.status === "failed" ? "bad" : undefined}>{entry.status || "received"}</span>{" "}
            {entry.type || entry.eventType || "event"}
            <span className="row-id">{entry.retries ? ` · ${entry.retries} retries` : ""}</span>
          </span>
          <span className="row-time">{timeAgo(entry.createdAt)}</span>
        </div>
      )}
    />
  );
}
