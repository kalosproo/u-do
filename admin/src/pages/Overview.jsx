import { useEffect, useMemo, useState } from "react";
import { collection, limit, orderBy, query } from "firebase/firestore";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import ConnectionBadge from "../components/ConnectionBadge.jsx";
import { db } from "../services/firebase.js";
import { getAdminOverview } from "../services/adminApi.js";
import { useConnectionState } from "../hooks/useConnectionState.js";
import { useLiveCollection } from "../hooks/useLiveCollection.js";

/**
 * Two kinds of data meet here.
 *
 * The figures are count() aggregations computed server-side, because asking a
 * browser to count users means reading every user. They refresh on load and on
 * demand, not on a timer.
 *
 * The three streams below them are live Firestore listeners, which is what
 * makes this a console rather than a report.
 */
export default function Overview() {
  const [metrics, setMetrics] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(true);

  const connection = useConnectionState();

  const signupsQuery = useMemo(
    () => query(collection(db, "billing"), orderBy("createdAt", "desc"), limit(8)),
    [],
  );
  const activityQuery = useMemo(
    () => query(collection(db, "activityEvents"), orderBy("createdAt", "desc"), limit(10)),
    [],
  );
  const alertsQuery = useMemo(
    () => query(collection(db, "errorLogs"), orderBy("createdAt", "desc"), limit(6)),
    [],
  );

  const signups = useLiveCollection(signupsQuery);
  const activity = useLiveCollection(activityQuery);
  const alerts = useLiveCollection(alertsQuery);

  const load = async () => {
    setRefreshing(true);
    try {
      setMetrics(await getAdminOverview());
      setLoadError(null);
    } catch (error) {
      setLoadError(error?.message || "Could not load overview figures.");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    getAdminOverview()
      .then((data) => {
        if (!cancelled) setMetrics(data);
      })
      .catch((error) => {
        if (!cancelled) setLoadError(error?.message || "Could not load overview figures.");
      })
      .finally(() => {
        if (!cancelled) setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const critical = alerts.docs.filter((entry) => entry.severity === "critical");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p className="page-note">
            Figures are computed on the server. The streams below are live Firestore
            listeners, not polling.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <ConnectionBadge state={connection} />
          <button
            type="button"
            className="button"
            data-variant="quiet"
            onClick={load}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh figures"}
          </button>
        </div>
      </div>

      {loadError ? <p className="notice">{loadError}</p> : null}

      <div className="figures">
        <Figure label="Total users" metric={metrics?.users.total} loading={refreshing} />
        <Figure
          label="Active, last 7 days"
          metric={metrics?.users.activeLast7Days}
          loading={refreshing}
          meta="Counted from usage activity"
        />
        <Figure label="New today" metric={metrics?.users.newToday} loading={refreshing} />
        <Figure label="On Free" metric={metrics?.users.free} loading={refreshing} />
        <Figure label="On Pro" metric={metrics?.users.pro} loading={refreshing} />
        <Figure
          label="Active subscriptions"
          metric={metrics?.subscriptions.active}
          loading={refreshing}
        />
        <Figure
          label="Failed payments, 24h"
          metric={metrics?.payments.failedLast24h}
          loading={refreshing}
          tone={metrics?.payments.failedLast24h?.value > 0 ? "bad" : undefined}
        />
        <Figure
          label="Monthly recurring revenue"
          metric={metrics?.revenue.mrr}
          loading={refreshing}
          format={formatMoney}
        />
        <Figure
          label="Free to Pro conversion"
          metric={metrics?.conversionPercent}
          loading={refreshing}
          format={(value) => `${value}%`}
        />
      </div>

      <div className="columns">
        <section className="panel">
          <header className="panel-head">
            <h2>Signups, last 14 days</h2>
          </header>
          <div className="panel-pad">
            <GrowthChart points={metrics?.growth?.value} loading={refreshing} />
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>System alerts</h2>
            <ConnectionBadge state={alerts.status} />
          </header>
          <div className="panel-body">
            {critical.length === 0 ? (
              <div className="empty">
                <strong>Nothing needs attention</strong>
                No critical errors have been recorded.
              </div>
            ) : (
              critical.map((entry) => (
                <div className="row" key={entry.id}>
                  <span className="row-main">{entry.message || entry.code || "Error"}</span>
                  <span className="row-time">{timeAgo(entry.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="columns">
        <section className="panel">
          <header className="panel-head">
            <h2>Recent activity</h2>
            <ConnectionBadge state={activity.status} />
          </header>
          <div className="panel-body">
            {activity.docs.length === 0 ? (
              <div className="empty">
                <strong>No events yet</strong>
                activityEvents is live and protected, but nothing writes to it until the
                consumer app is wired up in a later phase.
              </div>
            ) : (
              activity.docs.map((entry) => (
                <div className="row" key={entry.id}>
                  <span className="row-main">
                    {entry.type}
                    <span className="row-id"> · {shortId(entry.uid)}</span>
                  </span>
                  <span className="row-time">{timeAgo(entry.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <header className="panel-head">
            <h2>Recent signups</h2>
            <ConnectionBadge state={signups.status} />
          </header>
          <div className="panel-body">
            {signups.docs.length === 0 ? (
              <div className="empty">
                <strong>No billing records</strong>
                Run the backfill once so existing accounts appear here and in the counts
                above.
              </div>
            ) : (
              signups.docs.map((entry) => (
                <div className="row" key={entry.id}>
                  <span className="row-main">
                    {entry.email || shortId(entry.id)}
                    <span className="row-id"> · {entry.planId}</span>
                  </span>
                  <span className="row-time">{timeAgo(entry.createdAt)}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </>
  );
}

/**
 * Renders a metric, an "in progress" state, or the reason it cannot be
 * computed. There is no fourth branch that guesses a number.
 */
function Figure({ label, metric, loading, tone, meta, format = (value) => formatCount(value) }) {
  return (
    <div className="figure">
      <div className="figure-label">{label}</div>

      {loading && !metric ? (
        <div className="figure-value" style={{ color: "var(--rule-strong)" }}>
          —
        </div>
      ) : !metric ? (
        <p className="figure-unsupported">Not loaded</p>
      ) : metric.supported ? (
        <>
          <div className="figure-value" data-tone={tone}>
            {format(metric.value)}
          </div>
          {meta ? <div className="figure-meta">{meta}</div> : null}
        </>
      ) : (
        <p className="figure-unsupported">{metric.reason}</p>
      )}
    </div>
  );
}

function GrowthChart({ points, loading }) {
  if (loading && !points) return <p className="page-note">Loading…</p>;
  if (!points || points.length === 0) return <p className="page-note">No data yet.</p>;

  const total = points.reduce((sum, point) => sum + point.signups, 0);

  if (total === 0) {
    return (
      <div className="empty" style={{ padding: 0 }}>
        <strong>No signups in this window</strong>
        The chart fills in as accounts are created.
      </div>
    );
  }

  return (
    <div style={{ height: 168 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="date"
            tickFormatter={(value) => value.slice(5)}
            tick={{ fontSize: 11, fill: "#75736e" }}
            axisLine={{ stroke: "#e6e5e2" }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <Tooltip
            cursor={{ stroke: "#cfcdc8" }}
            contentStyle={{
              border: "1px solid #e6e5e2",
              borderRadius: 3,
              fontSize: 12,
              fontFamily: "JetBrains Mono, monospace",
            }}
          />
          <Area
            type="monotone"
            dataKey="signups"
            stroke="#101010"
            strokeWidth={1.5}
            fill="#101010"
            fillOpacity={0.06}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const formatCount = (value) =>
  typeof value === "number" ? value.toLocaleString("en-IN") : String(value ?? "—");

const formatMoney = (value) => {
  if (!value || typeof value.amountMinor !== "number") return "—";
  const major = value.amountMinor / 100;
  return `${value.currency === "INR" ? "₹" : ""}${major.toLocaleString("en-IN")}`;
};

const shortId = (uid) => (uid ? `${uid.slice(0, 6)}…` : "unknown");

const timeAgo = (value) => {
  const millis = toMillis(value);
  if (!millis) return "—";

  const seconds = Math.round((Date.now() - millis) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
};

/** Firestore timestamps arrive as objects from listeners and numbers from callables. */
const toMillis = (value) => {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return null;
};
