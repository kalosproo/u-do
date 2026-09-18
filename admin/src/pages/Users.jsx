import { useCallback, useEffect, useState } from "react";

import UserDetail from "../components/UserDetail.jsx";
import { findAdminUser, listAdminUsers } from "../services/adminApi.js";
import { formatDate, readableError, shortId, timeAgo } from "../utils/format.js";

/**
 * The account list.
 *
 * Two modes rather than one filtered list. Browsing pages `billing` by
 * createdAt cursor, so page 40 costs the same as page 1. Searching goes
 * straight to Auth by email or UID, because a substring search across every
 * account is a scan, and a scan is the thing this console is built to avoid.
 */
export default function Users() {
  const [rows, setRows] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [term, setTerm] = useState("");
  const [searched, setSearched] = useState(null);
  const [selected, setSelected] = useState(null);

  // "Load more" only — a click handler, where setting state up front is fine.
  const loadMore = useCallback(async (from) => {
    setLoading(true);
    try {
      const page = await listAdminUsers({ cursor: from });
      setRows((current) => [...current, ...page.users]);
      setCursor(page.nextCursor);
      setError(null);
    } catch (cause) {
      setError(readableError(cause, "Could not load the user list."));
    } finally {
      setLoading(false);
    }
  }, []);

  // The first page is fetched inline rather than through loadMore, so nothing
  // sets state synchronously inside the effect. `loading` already starts true,
  // which is what the initial render needs anyway.
  useEffect(() => {
    let cancelled = false;

    listAdminUsers({})
      .then((page) => {
        if (cancelled) return;
        setRows(page.users);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((cause) => {
        if (!cancelled) setError(readableError(cause, "Could not load the user list."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const search = async (event) => {
    event.preventDefault();
    const query = term.trim();

    if (!query) {
      setSearched(null);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const result = await findAdminUser({ term: query });
      setSearched(result.users);
      setSelected(result.users[0]?.uid ?? null);
      setError(result.users.length === 0 ? "No account matches that email or UID." : null);
    } catch (cause) {
      setSearched([]);
      setError(readableError(cause, "Search failed."));
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setTerm("");
    setSearched(null);
    setError(null);
  };

  const visible = searched ?? rows;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p className="page-note">
            One row per billing record. Opening an account shows counts and status —
            never the content of anyone&rsquo;s tasks, expenses or messages.
          </p>
        </div>

        <form className="search" onSubmit={search}>
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Email or UID"
            aria-label="Search by email or UID"
          />
          <button type="submit" className="button" data-variant="quiet" disabled={loading}>
            Search
          </button>
          {searched ? (
            <button type="button" className="button" data-variant="quiet" onClick={clear}>
              Clear
            </button>
          ) : null}
        </form>
      </div>

      {error ? <p className="notice">{error}</p> : null}

      <div className="split">
        <section className="panel">
          <header className="panel-head">
            <h2>{searched ? "Search result" : "All accounts"}</h2>
            <span className="panel-count">{visible.length}</span>
          </header>

          <div className="panel-body">
            {visible.length === 0 && !loading ? (
              <div className="empty">
                <strong>No accounts</strong>
                Run the billing backfill once so existing accounts appear here.
              </div>
            ) : (
              visible.map((row) => (
                <button
                  type="button"
                  key={row.uid}
                  className="user-row"
                  data-selected={row.uid === selected ? "true" : undefined}
                  onClick={() => setSelected(row.uid)}
                >
                  <span className="user-row-main">
                    <span className="user-row-name">
                      {row.displayName || row.email || shortId(row.uid)}
                    </span>
                    <span className="user-row-meta">
                      {row.username ? `@${row.username}` : shortId(row.uid)}
                      {" · "}
                      joined {formatDate(row.createdAt)}
                    </span>
                  </span>

                  <span className="user-row-tags">
                    <span className="tag" data-plan={row.planId}>
                      {row.planId === "pro" ? "Pro" : "Free"}
                    </span>
                    {row.disabled ? <span className="tag" data-tone="bad">Disabled</span> : null}
                    <span className="row-time">
                      {row.lastActiveAt ? timeAgo(row.lastActiveAt) : "never"}
                    </span>
                  </span>
                </button>
              ))
            )}

            {loading ? <p className="page-note panel-pad">Loading…</p> : null}
          </div>

          {!searched && cursor ? (
            <div className="panel-foot">
              <button
                type="button"
                className="button"
                data-variant="quiet"
                onClick={() => loadMore(cursor)}
                disabled={loading}
              >
                Load more
              </button>
            </div>
          ) : null}
        </section>

        <UserDetail uid={selected} />
      </div>
    </>
  );
}
