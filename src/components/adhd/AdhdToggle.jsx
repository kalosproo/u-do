import { useAdhd } from "../../hooks/useAdhd";

const WHAT = [
  ["Today's three", "Home asks for up to three things, then shows only the one to do now."],
  ["Just start", "Five minutes on the timer, then the choice to keep going."],
  ["Kind words", "Nothing is \"overdue\" or \"broken\" — it's from earlier, or welcome back."],
  ["Quiet screens", "No leaderboards, charts, ads or moving background. Bigger, calmer type."],
];

/** The switch for ADHD mode, on Profile. Only accounts trying it ever see this. */
function AdhdToggle() {
  const adhd = useAdhd();
  if (!adhd?.available) return null;

  return (
    <article className="panel profile-card adhd-toggle-card">
      <div className="panel-head">
        <h3 className="panel-title">
          ADHD mode <span className="adhd-beta">Beta</span>
        </h3>
        <button
          type="button"
          role="switch"
          aria-checked={adhd.enabled}
          aria-label="ADHD mode"
          className={`adhd-switch${adhd.enabled ? " is-on" : ""}`}
          onClick={() => adhd.setEnabled(!adhd.enabled)}
        >
          <span />
        </button>
      </div>
      <p className="profile-data-copy">A calmer U.Do that asks for one thing at a time. Turn it off whenever you like; nothing you&apos;ve added changes.</p>
      <ul className="adhd-toggle-list">
        {WHAT.map(([title, body]) => (
          <li key={title}>
            <strong>{title}</strong>
            <span>{body}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default AdhdToggle;
