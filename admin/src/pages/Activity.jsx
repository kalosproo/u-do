import { useMemo, useState } from "react";
import { collection, limit, orderBy, query, where } from "firebase/firestore";

import ConnectionBadge from "../components/ConnectionBadge.jsx";
import { db } from "../services/firebase.js";
import { useLiveCollection } from "../hooks/useLiveCollection.js";
import { formatDate, shortId, timeAgo } from "../utils/format.js";

const PAGE = 60;

/**
 * The event feed, live rather than polled.
 *
 * Filtering is done in the query rather than in the browser, so narrowing to
 * one event type reads fewer documents instead of more — the opposite of what
 * a client-side filter over a fixed page would do.
 *
 * Events carry a type and a subject, never content. That is a property of what
 * gets written, not of this screen: there is no field here that could hold the
 * text of a task or a message.
 */
export default function Activity() {
  const [type, setType] = useState("");

  const events = useLiveCollection(
    useMemo(() => {
      const base = collection(db, "activityEvents");
      return type
        ? query(base, where("type", "==", type), orderBy("createdAt", "desc"), limit(PAGE))
        : query(base, orderBy("createdAt", "desc"), limit(PAGE));
    }, [type]),
  );

  // Only the types present in what is already streamed. Offering a fixed list
  // would advertise event types that nothing in the app writes.
  const types = useMemo(() => {
    const seen = new Set();
    events.docs.forEach((entry) => entry.type && seen.add(entry.type));
    return [...seen].sort();
  }, [events.docs]);

  const days = useMemo(() => groupByDay(events.docs), [events.docs]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <p className="page-note">
            A live listener on <code>activityEvents</code>, newest first. Event type and
            subject only — never what anyone wrote.
          </p>
        </div>

        <div className="head-tools">
          <ConnectionBadge state={events.status} />
          {types.length > 0 ? (
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              aria-label="Filter by event type"
            >
              <option value="">All types</option>
              {types.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {events.error ? (
        <p className="notice">
          {events.error.code === "permission-denied"
            ? "This account is not allowed to read activityEvents. The admin claim may not have reached your token yet — sign out and back in."
            : events.error.message}
        </p>
      ) : null}

      <section className="panel">
        <header className="panel-head">
          <h2>{type || "All events"}</h2>
          <span className="panel-count">{events.docs.length}</span>
        </header>

        <div className="panel-body">
          {events.docs.length === 0 && events.status !== "loading" ? (
            <div className="empty">
              <strong>No events yet</strong>
              The collection is live and protected, but nothing writes to it until the
              consumer app records events. This screen fills in the moment it does.
            </div>
          ) : (
            days.map(([day, entries]) => (
              <div className="day" key={day}>
                <div className="day-head">{day}</div>
                {entries.map((entry) => (
                  <div className="row" key={entry.id}>
                    <span className="row-main">
                      {entry.type || "event"}
                      <span className="row-id"> · {shortId(entry.uid)}</span>
                    </span>
                    <span className="row-time">{timeAgo(entry.createdAt)}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}

/** Groups an already-sorted feed into day buckets, preserving order. */
function groupByDay(docs) {
  const buckets = new Map();

  docs.forEach((entry) => {
    const day = formatDate(entry.createdAt);
    if (!buckets.has(day)) buckets.set(day, []);
    buckets.get(day).push(entry);
  });

  return [...buckets.entries()];
}
