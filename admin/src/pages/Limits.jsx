import { useMemo } from "react";
import { collection, query, where } from "firebase/firestore";

import ConnectionBadge from "../components/ConnectionBadge.jsx";
import { describe } from "../utils/errors.js";
import { db } from "../services/firebase.js";
import { useCounts } from "../hooks/useCounts.js";
import { useLiveCollection } from "../hooks/useLiveCollection.js";
import { formatCount } from "../utils/format.js";
import { COUNTERS } from "../utils/counters.js";

const show = (value) => (value === null || value === undefined ? "Unlimited" : formatCount(value));

/**
 * The plan table, and how many accounts are already past each Free limit.
 *
 * Limits are counted but not enforced. This is the screen to decide with:
 * turning enforcement on would block every account in the last column.
 */
export default function Limits() {
  const plans = useLiveCollection(useMemo(() => (db ? collection(db, "planLimits") : null), []));
  const free = plans.docs.find((entry) => entry.id === "free");
  const pro = plans.docs.find((entry) => entry.id === "pro");

  const over = useCounts(
    useMemo(() => {
      if (!db || !free?.limits) return {};
      const out = {};
      COUNTERS.forEach(({ field }) => {
        const cap = free.limits[field];
        if (typeof cap === "number") {
          out[field] = query(collection(db, "usageCounters"), where(`counters.${field}`, ">", cap));
        }
      });
      return out;
    }, [free]),
    [free?.limits ? JSON.stringify(free.limits) : ""],
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Limits</h1>
          <p className="page-note">
            What each plan allows, and how many accounts are past the Free limits today. Counted, not enforced — enforcing
            would block every account in the last column.
          </p>
        </div>
        <div className="head-tools">
          <ConnectionBadge state={plans.status} />
        </div>
      </div>

      {plans.error ? <p className="notice">{describe(plans.error)}</p> : null}

      <section className="panel">
        <header className="panel-head">
          <h2>Plans</h2>
          <span className="panel-count">{plans.docs.length}</span>
        </header>
        <div className="panel-body">
          {!free && plans.status !== "loading" ? (
            <div className="empty">
              <strong>Plans not published</strong>
              Run <em>Seed plan limits</em> from Settings to publish the plan table.
            </div>
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Limit</th>
                  <th>Free</th>
                  <th>Pro</th>
                  <th>Over Free</th>
                </tr>
              </thead>
              <tbody>
                {COUNTERS.map(({ field, label }) => (
                  <tr key={field}>
                    <td>{label}</td>
                    <td>{show(free?.limits?.[field])}</td>
                    <td>{show(pro?.limits?.[field])}</td>
                    <td>
                      {over.errors[field]
                        ? <span title={describe(over.errors[field])}>—</span>
                        : over.values[field] === undefined
                          ? "…"
                          : formatCount(over.values[field])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <footer className="panel-foot">
          <p className="page-note" style={{ margin: 0 }}>
            Monthly counters show each account's most recent month; an account quiet since last month can be counted here
          until its next activity.
          </p>
        </footer>
      </section>
    </>
  );
}
