import { FiBell, FiBellOff } from "react-icons/fi";

import { usePush } from "../hooks/usePush";

const TYPE_LABEL = {
  digest: "Daily digest",
  habits: "Habit streak nudge",
  tasks: "Tasks due today",
  friends: "Friend requests",
};

const TYPE_NOTE = {
  digest: "One message covering everything below. With this on, the next two stay quiet.",
  habits: "If a habit still isn't ticked at your reminder time.",
  tasks: "Anything due today that isn't done.",
  friends: "When someone sends or accepts a request. Sent as it happens.",
};

/**
 * The reminder controls.
 *
 * Every unavailable case says which one it is. A greyed-out toggle teaches
 * nobody anything, and the iOS case in particular is invisible otherwise:
 * Safari delivers no web push until the site is on the Home Screen, so an
 * iPhone user who is not told that concludes the feature is broken.
 */
function NotificationSettings() {
  const { loading, availability, enabled, time, types, busy, error, enable, disable, update } =
    usePush();

  if (loading) return null;

  return (
    <article className="panel profile-card">
      <div className="panel-head">
        <h3 className="panel-title">Reminders</h3>
      </div>

      {availability === "available" ? (
        <>
          <p className="profile-data-copy">
            A notification at a time you choose, so a streak doesn&apos;t quietly end while
            you&apos;re busy. Turning this off deletes the token your browser gave us.
          </p>

          <div className="profile-actions">
            <button
              type="button"
              className={enabled ? "btn" : "btn btn-primary"}
              onClick={enabled ? disable : enable}
              disabled={busy}
            >
              {enabled ? <FiBellOff /> : <FiBell />}
              {busy ? "Working…" : enabled ? "Turn reminders off" : "Turn reminders on"}
            </button>
          </div>

          {enabled ? (
            <div className="push-settings">
              <label className="push-time">
                <span>Remind me at</span>
                <input
                  type="time"
                  value={time}
                  onChange={(event) => update({ time: event.target.value })}
                />
              </label>

              <div className="push-types">
                {Object.keys(TYPE_LABEL).map((key) => (
                  <label key={key} className="push-type">
                    <input
                      type="checkbox"
                      checked={types[key] !== false}
                      onChange={(event) =>
                        update({ types: { ...types, [key]: event.target.checked } })
                      }
                    />
                    <span>
                      <strong>{TYPE_LABEL[key]}</strong>
                      <span className="panel-note">{TYPE_NOTE[key]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="profile-data-copy">{unavailableCopy(availability)}</p>
      )}

      {error ? <p className="login-error">{error}</p> : null}
    </article>
  );
}

function unavailableCopy(availability) {
  switch (availability) {
    case "ios-not-installed":
      return "On iPhone and iPad, Safari only delivers notifications once U.Do is on your Home Screen. Tap Share, then Add to Home Screen, open U.Do from there, and this will be ready to switch on.";
    case "not-configured":
      return "Reminders aren't set up on this deployment yet — it's missing its web push key.";
    default:
      return "This browser doesn't support web notifications. Chrome, Edge, Firefox and Safari 16.4+ all do.";
  }
}

export default NotificationSettings;
