import { useMemo, useState } from "react";
import { FiShare2, FiX } from "react-icons/fi";

import { useFocus } from "../hooks/useFocus";
import { formatMinutes } from "../utils/focusTimer";
import { formatMoney } from "../utils/money";
import { monthlyReport, reportMonthFor } from "../utils/monthlyReport";

const dismissKey = (uid, month) => `u_do_month_dismissed_${uid}_${month.start}`;

const readDismissed = (uid, month) => {
  try {
    return localStorage.getItem(dismissKey(uid, month)) === "1";
  } catch {
    return false;
  }
};

/**
 * Last month in one card, on the 1st to the 3rd. Counted from the person's
 * own records; closing it hides it until next month.
 */
function MonthlyReport({ uid, tasks, habits, plans, expenses }) {
  const focus = useFocus();
  const [month] = useState(() => reportMonthFor());
  const [hidden, setHidden] = useState(() => (month ? readDismissed(uid, month) : true));
  const [note, setNote] = useState("");

  const report = useMemo(
    () => (month ? monthlyReport({ tasks, habits, plans, expenses }, month, focus?.log) : null),
    [month, tasks, habits, plans, expenses, focus?.log]
  );

  if (!month || hidden || !report || report.empty) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(uid, month), "1");
    } catch {
      /* Hidden for this visit anyway. */
    }
    setHidden(true);
  };

  const change =
    report.focusChange === null ? "" : report.focusChange >= 0 ? `↑ ${report.focusChange}%` : `↓ ${Math.abs(report.focusChange)}%`;

  const stats = [
    ["Tasks finished", report.tasksDone],
    ["Focus time", formatMinutes(report.focusMinutes), change],
    ["Habit check-ins", report.checkIns],
    ["Plans kept", report.plansTotal ? `${report.plansDone}/${report.plansTotal}` : "—"],
    ["Money in · out", report.hasMoney ? `${formatMoney(report.moneyIn)} · ${formatMoney(report.moneyOut)}` : "—"],
  ];

  const share = async () => {
    const text = [
      `My ${month.label} on U.Do:`,
      `${report.tasksDone} tasks finished`,
      `${formatMinutes(report.focusMinutes)} focused${report.topSubject ? ` — mostly ${report.topSubject.name}` : ""}`,
      `${report.checkIns} habit check-ins`,
    ].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: `My ${month.label} on U.Do`, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setNote("Copied — paste it anywhere.");
    } catch (error) {
      if (error?.name !== "AbortError") setNote("Couldn't share right now.");
    }
  };

  return (
    <section className="panel weekly-review monthly-report" aria-label="Monthly report">
      <div className="weekly-review-head">
        <div>
          <p className="eyebrow">MONTHLY REPORT</p>
          <h3 className="weekly-review-title">Your {month.label}.</h3>
        </div>
        <button type="button" className="weekly-review-close" onClick={dismiss} aria-label="Hide until next month">
          <FiX />
        </button>
      </div>

      <div className="weekly-review-grid monthly-grid">
        {stats.map(([label, value, extra]) => (
          <div key={label} className="weekly-review-stat">
            <span>{label}</span>
            <strong>{value}</strong>
            {extra ? <small className="monthly-change">{extra} vs the month before</small> : null}
          </div>
        ))}
      </div>

      {report.topSubject || report.topHabit ? (
        <p className="panel-note">
          {report.topSubject ? <>Most studied: <strong>{report.topSubject.name}</strong>, {formatMinutes(report.topSubject.minutes)}. </> : null}
          {report.topHabit ? <>Most consistent habit: <strong>{report.topHabit.title}</strong>, {report.topHabit.count} days.</> : null}
        </p>
      ) : null}

      <div className="weekly-review-actions">
        <button type="button" className="btn btn-sm" onClick={share}>
          <FiShare2 /> Share my month
        </button>
        {note ? <span className="panel-note">{note}</span> : null}
      </div>
    </section>
  );
}

export default MonthlyReport;
