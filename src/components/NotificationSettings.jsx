import { FiBell, FiBellOff, FiSend } from "react-icons/fi";

import { usePush } from "../hooks/usePush";
import InstallCard from "./InstallCard";

/**
 * Each reminder has its own rhythm, and the copy says what it is.
 *
 * A switch labelled only "Tasks" gives no way to predict what turning it on
 * costs you. One that says "every 30 minutes until they're done" does, which
 * is the difference between a reminder someone keeps and one they block.
 */
const TYPES = [
  {
    key: "tasks",
    label: "Tasks",
    note: "Every 30 minutes until everything due is done. Overdue tasks count.",
  },
  {
    key: "habits",
    label: "Habits",
    note: "Every hour until the day's habits are ticked.",
  },
  {
    key: "planner",
    label: "Today's plan",
    note: "Once, when the window opens, listing what you planned for today.",
  },
  {
    key: "friends",
    label: "Friend requests",
    note: "As they happen. Ignores the window.",
  },
];

function NotificationSettings() {
  const {
    loading,
    availability,
    enabled,
    start,
    end,
    types,
    busy,
    error,
    enable,
    disable,
    update,
    device,
    test,
    sendTest,
  } = usePush();

  if (loading) return null;

  return (
    <article className="panel profile-card">
      <div className="panel-head">
        <h3 className="panel-title">Reminders</h3>
      </div>

      {availability === "available" ? (
        <>
          <p className="profile-data-copy">
            Nudges that keep coming until the thing is actually done, inside a window
            you set. Turning this off deletes the token your browser gave us.
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

          {enabled && device === "needs-permission" ? (
            <div className="push-device-note">
              <p className="panel-note">
                Reminders are on for your account, but this device hasn&apos;t been allowed to
                show them yet.
              </p>
              <button type="button" className="btn btn-primary" onClick={enable} disabled={busy}>
                <FiBell /> Turn on for this device
              </button>
            </div>
          ) : null}

          {enabled ? (
            <div className="push-test">
              <button
                type="button"
                className="btn"
                onClick={sendTest}
                disabled={test.state === "sending"}
              >
                <FiSend /> {test.state === "sending" ? "Sending…" : "Send a test notification"}
              </button>
              {test.state === "done" ? (
                <p className={`panel-note ${test.result?.ok && test.result.sent > 0 ? "" : "push-test-problem"}`} role="status">
                  {testCopy(test.result)}
                </p>
              ) : null}
            </div>
          ) : null}

          {enabled ? (
            <div className="push-settings">
              <div className="push-window">
                <span className="push-window-label">Remind me between</span>

                <div className="push-window-times">
                  <input
                    type="time"
                    value={start}
                    aria-label="Reminders start"
                    onChange={(event) => update({ start: event.target.value })}
                  />
                  <span aria-hidden="true">and</span>
                  <input
                    type="time"
                    value={end}
                    aria-label="Reminders end"
                    onChange={(event) => update({ end: event.target.value })}
                  />
                </div>
              </div>

              <p className="panel-note push-window-note">
                Nothing is sent outside this. Repeating reminders without an end is how
                you get a notification at 3am.
              </p>

              <div className="push-types">
                {TYPES.map(({ key, label, note }) => (
                  <label key={key} className="push-type">
                    <input
                      type="checkbox"
                      checked={types[key] !== false}
                      onChange={(event) =>
                        update({ types: { ...types, [key]: event.target.checked } })
                      }
                    />
                    <span>
                      <strong>{label}</strong>
                      <span className="panel-note">{note}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="profile-data-copy">{unavailableCopy(availability)}</p>
          {availability === "ios-not-installed" ? <InstallCard inline /> : null}
        </>
      )}

      {error ? <p className="login-error">{error}</p> : null}
    </article>
  );
}

function testCopy(result) {
  if (!result) return "";
  if (result.ok && result.sent > 0) {
    const devices = result.sent === 1 ? "1 device" : `${result.sent} devices`;
    return `Sent to ${devices}. It should appear within a minute. If it doesn't, check that notifications for U.Do (or your browser) are allowed in your phone's settings, and that Focus or Do Not Disturb is off.`;
  }
  if (result.ok && result.devices === 0) {
    return "No device is registered for reminders. Turn reminders off, then on again on this device.";
  }
  if (result.ok) {
    return "The devices on record no longer accept notifications, so they were removed. Turn reminders off, then on again on this device.";
  }
  if (result.reason === "too-soon") return "Give it a few seconds before sending another test.";
  if (result.reason === "server") return "Couldn't reach U.Do's reminder service right now. Try again in a little while.";
  return result.message || "The test couldn't be sent.";
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
