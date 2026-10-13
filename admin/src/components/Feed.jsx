import { useMemo, useState } from "react";
import { limit, orderBy, query, where } from "firebase/firestore";

import ConnectionBadge from "./ConnectionBadge.jsx";
import { useLiveCollection } from "../hooks/useLiveCollection.js";
import { formatDate } from "../utils/format.js";
import { describe } from "../utils/errors.js";

/**
 * A live, newest-first list of one collection, optionally filtered by one
 * field. Every list screen in the console is this with a different row.
 *
 * The filter runs in the query, not the browser, so narrowing reads fewer
 * documents. Its options come from what is already streamed, so the console
 * never offers a value nothing writes.
 */
export default function Feed({
  title,
  note,
  collectionRef,
  filterField,
  filterLabel = "Filter",
  orderField = "createdAt",
  pageSize = 60,
  empty,
  renderRow,
  groupByDay = true,
}) {
  const [value, setValue] = useState("");

  const feed = useLiveCollection(
    useMemo(() => {
      if (!collectionRef) return null;
      const parts = [orderBy(orderField, "desc"), limit(pageSize)];
      return value && filterField
        ? query(collectionRef, where(filterField, "==", value), ...parts)
        : query(collectionRef, ...parts);
    }, [collectionRef, filterField, orderField, pageSize, value]),
  );

  const options = useMemo(() => {
    if (!filterField) return [];
    const seen = new Set();
    feed.docs.forEach((entry) => entry[filterField] && seen.add(String(entry[filterField])));
    if (value) seen.add(value);
    return [...seen].sort();
  }, [feed.docs, filterField, value]);

  const groups = useMemo(() => {
    if (!groupByDay) return [["", feed.docs]];
    const buckets = new Map();
    feed.docs.forEach((entry) => {
      const day = formatDate(entry[orderField]);
      if (!buckets.has(day)) buckets.set(day, []);
      buckets.get(day).push(entry);
    });
    return [...buckets.entries()];
  }, [feed.docs, groupByDay, orderField]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{title}</h1>
          {note ? <p className="page-note">{note}</p> : null}
        </div>
        <div className="head-tools">
          <ConnectionBadge state={feed.status} />
          {options.length > 0 ? (
            <select value={value} onChange={(event) => setValue(event.target.value)} aria-label={filterLabel}>
              <option value="">All</option>
              {options.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {feed.error ? <p className="notice">{describe(feed.error)}</p> : null}

      <section className="panel">
        <header className="panel-head">
          <h2>{value || "All"}</h2>
          <span className="panel-count">{feed.docs.length}</span>
        </header>
        <div className="panel-body">
          {feed.docs.length === 0 && feed.status !== "loading" && !feed.error ? (
            <div className="empty">{empty}</div>
          ) : (
            groups.map(([day, entries]) => (
              <div className="day" key={day || "all"}>
                {day ? <div className="day-head">{day}</div> : null}
                {entries.map((entry) => renderRow(entry))}
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
