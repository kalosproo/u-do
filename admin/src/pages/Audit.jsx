import { collection } from "firebase/firestore";

import Feed from "../components/Feed.jsx";
import { db } from "../services/firebase.js";
import { shortId, timeAgo } from "../utils/format.js";

/**
 * Every admin action, append-only. The rules refuse every client write and
 * nothing in the codebase edits or deletes an entry, so this is the record of
 * who did what to which account — including who looked at whom.
 */
export default function Audit() {
  return (
    <Feed
      title="Audit"
      note="Append-only log of admin actions: claims granted, plans seeded, backfills run, and every time an admin opened someone's account."
      collectionRef={db ? collection(db, "adminAuditLogs") : null}
      filterField="action"
      filterLabel="Filter by action"
      empty={
        <>
          <strong>No admin actions yet</strong>
          Granting a claim, seeding plans, running the backfill or opening a user's detail all land here.
        </>
      }
      renderRow={(entry) => (
        <div className="row" key={entry.id}>
          <span className="row-main">
            {entry.action}
            {entry.outcome && entry.outcome !== "success" ? <> <span className="tag" data-tone="bad">{entry.outcome}</span></> : null}
            <span className="row-id">
              {" "}· {entry.adminEmail || shortId(entry.adminUid)}
              {entry.targetUid ? ` → ${shortId(entry.targetUid)}` : ""}
            </span>
          </span>
          <span className="row-time">{timeAgo(entry.createdAt)}</span>
        </div>
      )}
    />
  );
}
