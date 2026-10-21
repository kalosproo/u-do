import { useMemo } from "react";

import FocusCard from "../components/focus/FocusCard";
import FriendsFocusing from "../components/focus/FriendsFocusing";
import { useAuth } from "../hooks/useAuth";
import { useFocus } from "../hooks/useFocus";
import { formatMinutes } from "../utils/focusTimer";
import { focusStats } from "../utils/focusStats";

const shortDay = (key) =>
  new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: "narrow" });

const longDay = (key) =>
  new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/**
 * Study stats: the focus timer's history. Today, this week and month, the
 * streak, fourteen days of bars, and where the time went by subject. Signed
 * in, it is the account's history across devices; signed out, this device's.
 */
function Focus() {
  const { user } = useAuth();
  const focus = useFocus();
  const stats = useMemo(() => focusStats(focus?.log || {}), [focus?.log]);
  const top = Math.max(25, ...stats.last14.map((d) => d.minutes));
  const subjectTop = stats.subjects[0]?.minutes || 1;

  return (
    <section className="dashboard-page focus-page">
      <header className="dashboard-header-block">
        <p className="eyebrow">FOCUS</p>
        <h1 className="page-title">Your study time</h1>
        <p className="page-sub">
          Everything the focus timer has counted
          {user ? ", on every device you use." : " on this device. Sign in to keep it across devices."}
        </p>
      </header>

      <FocusCard />

      <div className="stat-grid">
        {[
          ["Today", formatMinutes(stats.today)],
          ["This week", formatMinutes(stats.week)],
          ["This month", formatMinutes(stats.month)],
          ["Day streak", `${stats.streak} ${stats.streak === 1 ? "day" : "days"}`],
        ].map(([label, value]) => (
          <div key={label} className="stat">
            <span className="stat-label">{label}</span>
            <strong className="stat-value">{value}</strong>
          </div>
        ))}
      </div>

      <section className="panel focus-chart-panel" aria-label="Last fourteen days">
        <div className="panel-head">
          <h3 className="panel-title">Last 14 days</h3>
          <span className="panel-note">
            {stats.best ? `Best: ${formatMinutes(stats.best.minutes)} on ${longDay(stats.best.key)}` : "No sessions yet"}
          </span>
        </div>
        <div className="focus-chart" role="img" aria-label={`Focus minutes over the last 14 days, ${formatMinutes(stats.last14.reduce((sum, d) => sum + d.minutes, 0))} in total`}>
          {stats.last14.map((day, i) => (
            <div key={day.key} className={`focus-chart-col ${i === 13 ? "is-today" : ""}`} title={`${longDay(day.key)}: ${formatMinutes(day.minutes)}`}>
              <span className="focus-chart-value">{day.minutes ? Math.round(day.minutes) : ""}</span>
              <span className="focus-chart-bar">
                <i style={{ height: `${day.minutes ? Math.max(4, (day.minutes / top) * 100) : 0}%` }} />
              </span>
              <span className="focus-chart-day">{shortDay(day.key)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel" aria-label="Subjects">
        <div className="panel-head">
          <h3 className="panel-title">Subjects · last 30 days</h3>
        </div>
        {stats.subjects.length ? (
          <ul className="focus-subjects">
            {stats.subjects.slice(0, 8).map((subject) => (
              <li key={subject.name}>
                <span className="focus-subject-name">{subject.name}</span>
                <span className="focus-subject-bar">
                  <i style={{ width: `${(subject.minutes / subjectTop) * 100}%` }} />
                </span>
                <span className="focus-subject-time">{formatMinutes(subject.minutes)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-note">Type what you&apos;re studying when you start a session and it shows up here.</p>
        )}
      </section>

      {user ? <FriendsFocusing /> : null}

      {user ? (
        <label className="focus-share-toggle">
          <input type="checkbox" checked={focus.shareFocus} onChange={(event) => focus.setShareFocus(event.target.checked)} />
          <span>
            <strong>Let friends see when I&apos;m focusing</strong>
            <span className="panel-note">They see that you&apos;re focusing and how long is left — never what you&apos;re studying.</span>
          </span>
        </label>
      ) : null}
    </section>
  );
}

export default Focus;
