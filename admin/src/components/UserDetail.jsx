import { useEffect, useState } from "react";

import { getAdminUserDetail } from "../services/adminApi.js";
import {
  formatDate,
  formatMoney,
  readableError,
  timeAgo,
} from "../utils/format.js";

const LIMIT_LABEL = {
  tasksActive: "Active tasks",
  habits: "Habits",
  friends: "Friends",
  financeEntriesPerMonth: "Finance entries",
  plannerEventsPerMonth: "Planner events",
  aiRequestsPerMonth: "AI requests",
};

/**
 * One account, in the only detail an operator is allowed.
 *
 * getAdminUserDetail returns counts and status. Task titles, expense rows,
 * friend messages and AI prompts live under users/{uid}, which no admin path
 * reads and which the rules refuse to admins as firmly as to anyone else. So
 * this shows that someone used 12 finance entries, and there is no view
 * anywhere in this console that could show what they were.
 */
export default function UserDetail({ uid }) {
  // The settled result carries the uid it belongs to. Deriving the view from
  // that comparison — rather than clearing state when the selection changes —
  // keeps every setState inside an async callback, and has the better
  // behaviour anyway: switching accounts shows "Loading", never the previous
  // account's numbers under the new account's name.
  const [settled, setSettled] = useState({ uid: null, detail: null, error: null });

  useEffect(() => {
    if (!uid) return undefined;

    let cancelled = false;

    getAdminUserDetail({ uid })
      .then((data) => {
        if (!cancelled) setSettled({ uid, detail: data, error: null });
      })
      .catch((cause) => {
        if (!cancelled) {
          setSettled({
            uid,
            detail: null,
            error: readableError(cause, "Could not load that account."),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [uid]);

  const current = settled.uid === uid ? settled : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? null;
  const loading = Boolean(uid) && !current;

  if (!uid) {
    return (
      <section className="panel">
        <header className="panel-head">
          <h2>Account</h2>
        </header>
        <div className="panel-body">
          <div className="empty">
            <strong>Nothing selected</strong>
            Pick an account on the left to see its plan, usage and payment history.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="panel-head">
        <h2>{detail?.account.displayName || detail?.account.email || "Account"}</h2>
        {detail?.account.disabled ? <span className="tag" data-tone="bad">Disabled</span> : null}
      </header>

      <div className="panel-body">
        {loading ? <p className="page-note panel-pad">Loading…</p> : null}
        {error ? <p className="notice">{error}</p> : null}

        {detail ? (
          <>
            <dl className="facts">
              <Fact label="UID" value={<code>{detail.account.uid}</code>} />
              <Fact label="Email" value={detail.account.email || "—"} />
              <Fact label="Signed in with" value={providerLabel(detail.account.providers)} />
              <Fact label="Joined" value={formatDate(detail.account.createdAt)} />
              <Fact
                label="Last sign-in"
                value={detail.account.lastSignInAt ? timeAgo(detail.account.lastSignInAt) : "never"}
              />
              <Fact label="Plan" value={detail.billing?.planId === "pro" ? "Pro" : "Free"} />
              <Fact
                label="Subscription"
                value={detail.billing?.subscriptionStatus || "none"}
              />
              <Fact label="Friends" value={detail.friendsCount} />
            </dl>

            <div className="panel-sub">
              <h3>Usage this month</h3>
              <dl className="facts">
                {Object.entries(detail.usage.counters).map(([key, value]) => (
                  <Fact key={key} label={LIMIT_LABEL[key] || key} value={value} />
                ))}
              </dl>
              <p className="page-note panel-pad">
                Last active {detail.usage.lastActiveAt ? timeAgo(detail.usage.lastActiveAt) : "never"}
                {detail.usage.monthKey ? ` · counters for ${detail.usage.monthKey}` : ""}
              </p>
            </div>

            <div className="panel-sub">
              <h3>Subscriptions</h3>
              {detail.subscriptions.length === 0 ? (
                <p className="page-note panel-pad">None recorded.</p>
              ) : (
                detail.subscriptions.map((entry) => (
                  <div className="row" key={entry.id}>
                    <span className="row-main">
                      {entry.status}
                      <span className="row-id"> · {entry.provider || "unknown"}</span>
                    </span>
                    <span className="row-time">{formatDate(entry.createdAt)}</span>
                  </div>
                ))
              )}
            </div>

            <div className="panel-sub">
              <h3>Payments</h3>
              {detail.payments.length === 0 ? (
                <p className="page-note panel-pad">None recorded.</p>
              ) : (
                detail.payments.map((entry) => (
                  <div className="row" key={entry.id}>
                    <span className="row-main">
                      {formatMoney({
                        amountMinor: entry.amountMinor,
                        currency: entry.currency,
                      })}
                      <span className="row-id"> · {entry.status}</span>
                    </span>
                    <span className="row-time">{formatDate(entry.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function Fact({ label, value }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

const providerLabel = (providers = []) => {
  if (providers.length === 0) return "—";
  return providers
    .map((id) => (id === "google.com" ? "Google" : id === "password" ? "Email" : id))
    .join(", ");
};
