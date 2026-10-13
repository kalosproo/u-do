import { useEffect, useMemo, useState } from "react";
import { Timestamp, collection, limit, query, where } from "firebase/firestore";

import ConnectionBadge from "../components/ConnectionBadge.jsx";
import Figure from "../components/Figure.jsx";
import { describe } from "../utils/errors.js";
import { getAdminOverview } from "../services/adminApi.js";
import { db } from "../services/firebase.js";
import { useLiveCollection } from "../hooks/useLiveCollection.js";
import { formatMoney } from "../utils/format.js";

const DAYS = 30;

/**
 * Money in, computed only from what is real.
 *
 * MRR comes from the server, which refuses to report it until Pro has a price
 * and subscriptions can be counted — "₹0" would read as "we earned nothing"
 * rather than "we cannot tell yet". Collected revenue is summed from captured
 * payments in whole paise, so the total is exact.
 */
export default function Revenue() {
  const [overview, setOverview] = useState({ status: "loading", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    getAdminOverview()
      .then((data) => !cancelled && setOverview({ status: "ready", data, error: null }))
      .catch((error) => !cancelled && setOverview({ status: "error", data: null, error }));
    return () => {
      cancelled = true;
    };
  }, []);

  // Fixed for the life of the page, so the live query is not rebuilt every render.
  const [since] = useState(() => Timestamp.fromMillis(Date.now() - DAYS * 86_400_000));
  const captured = useLiveCollection(
    useMemo(
      () =>
        db
          ? query(
              collection(db, "payments"),
              where("status", "==", "captured"),
              where("createdAt", ">=", since),
              limit(1000),
            )
          : null,
      [since],
    ),
  );

  const collected = useMemo(() => {
    const byCurrency = new Map();
    captured.docs.forEach((entry) => {
      if (typeof entry.amountMinor !== "number") return;
      const code = entry.currency || "INR";
      byCurrency.set(code, (byCurrency.get(code) || 0) + entry.amountMinor);
    });
    return [...byCurrency.entries()];
  }, [captured.docs]);

  const loading = overview.status === "loading";
  const data = overview.data;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Revenue</h1>
          <p className="page-note">
            Recurring revenue and money collected. Nothing here is estimated: a figure that cannot be computed says why.
          </p>
        </div>
        <div className="head-tools">
          <ConnectionBadge state={captured.status} />
        </div>
      </div>

      {overview.error ? <p className="notice">{describe(overview.error)}</p> : null}
      {captured.error ? <p className="notice">{describe(captured.error)}</p> : null}

      <div className="figures">
        <Figure label="Monthly recurring" metric={data?.revenue?.mrr} loading={loading} format={formatMoney} />
        <Figure label="Active subscriptions" metric={data?.subscriptions?.active} loading={loading} />
        <Figure
          label="Free → Pro"
          metric={data?.conversionPercent}
          loading={loading}
          format={(value) => `${value}%`}
        />
        <Figure label="Failed payments, 24h" metric={data?.payments?.failedLast24h} loading={loading} />
      </div>

      <section className="panel">
        <header className="panel-head">
          <h2>Collected, last {DAYS} days</h2>
          <span className="panel-count">{captured.docs.length} payments</span>
        </header>
        <div className="panel-body">
          {collected.length === 0 && captured.status !== "loading" ? (
            <div className="empty">
              <strong>Nothing collected</strong>
              No payment provider is connected yet, so no payments have been captured. This fills in live once they are.
            </div>
          ) : (
            collected.map(([currency, amountMinor]) => (
              <div className="row" key={currency}>
                <span className="row-main">{currency}</span>
                <span className="row-time">{formatMoney({ amountMinor, currency })}</span>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
