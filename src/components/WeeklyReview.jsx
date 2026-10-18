import { useMemo, useState } from "react";
import { FiShare2, FiX } from "react-icons/fi";

import { reviewWeekFor, weeklyReview } from "../utils/weeklyReview";
import { formatMoney } from "../utils/money";

const dismissKey = (uid, week) => `u_do_review_dismissed_${uid}_${week.start}`;

const readDismissed = (uid, week) => {
  try {
    return localStorage.getItem(dismissKey(uid, week)) === "1";
  } catch {
    return false;
  }
};

const rangeLabel = (week) => {
  const fmt = (key) =>
    new Date(`${key}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${fmt(week.start)} – ${fmt(week.end)}`;
};

/**
 * Sunday's (and Monday's) look back at the week. Every figure is counted from
 * the person's own records; a quiet week says so instead of celebrating zeros.
 * Closing it hides it until next week, on this device.
 */
function WeeklyReview({ uid, tasks, habits, plans, expenses }) {
  const [week] = useState(() => reviewWeekFor());
  const [hidden, setHidden] = useState(() => (week ? readDismissed(uid, week) : true));
  const [note, setNote] = useState("");

  const review = useMemo(
    () => (week ? weeklyReview({ tasks, habits, plans, expenses }, week) : null),
    [week, tasks, habits, plans, expenses]
  );

  if (!week || hidden || !review) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(uid, week), "1");
    } catch {
      /* Hidden for this visit anyway. */
    }
    setHidden(true);
  };

  const stats = [
    ["Tasks finished", review.tasksDone],
    ["Habit check-ins", review.checkIns],
    ["Plans kept", review.plansTotal ? `${review.plansDone}/${review.plansTotal}` : "—"],
    ["Money in · out", review.hasMoney ? `${formatMoney(review.moneyIn)} · ${formatMoney(review.moneyOut)}` : "—"],
  ];

  const share = async () => {
    const text = [
      `My week on U.Do (${rangeLabel(week)}):`,
      `${review.tasksDone} tasks finished`,
      `${review.checkIns} habit check-ins${review.topHabit ? ` — most: ${review.topHabit.title}` : ""}`,
      review.plansTotal ? `${review.plansDone} of ${review.plansTotal} plans kept` : null,
    ]
      .filter(Boolean)
      .join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: "My week on U.Do", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setNote("Copied — paste it anywhere.");
    } catch (error) {
      if (error?.name !== "AbortError") setNote("Couldn't share right now.");
    }
  };

  return (
    <section className="panel weekly-review" aria-label="Weekly review">
      <div className="weekly-review-head">
        <div>
          <p className="eyebrow">{week.isPast ? "LAST WEEK" : "THIS WEEK"} · {rangeLabel(week)}</p>
          <h3 className="weekly-review-title">
            {review.empty ? "A quiet week." : review.tasksDone + review.checkIns >= 10 ? "A strong week." : "Your week, in short."}
          </h3>
        </div>
        <button type="button" className="weekly-review-close" onClick={dismiss} aria-label="Hide until next week">
          <FiX />
        </button>
      </div>

      {review.empty ? (
        <p className="panel-note">
          Nothing logged this week. A fresh one starts Monday — one task is enough to begin.
        </p>
      ) : (
        <>
          <div className="weekly-review-grid">
            {stats.map(([label, value]) => (
              <div key={label} className="weekly-review-stat">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {review.topHabit ? (
            <p className="panel-note">
              Most consistent: <strong>{review.topHabit.title}</strong>, {review.topHabit.count}{" "}
              {review.topHabit.count === 1 ? "day" : "days"}.
            </p>
          ) : null}
          <div className="weekly-review-actions">
            <button type="button" className="btn btn-sm" onClick={share}>
              <FiShare2 /> Share my week
            </button>
            {note ? <span className="panel-note">{note}</span> : null}
          </div>
        </>
      )}
    </section>
  );
}

export default WeeklyReview;
