import { useState } from "react";
import { FiCalendar, FiCopy } from "react-icons/fi";

import { useAuth } from "../hooks/useAuth";
import { getCalendarFeedUrl, googleCalendarUrl, webcalUrl } from "../services/calendarFeed";
import { friendlyError } from "../utils/friendlyError";

/**
 * Calendar sync: one private link that Google Calendar or Apple Calendar
 * subscribes to, showing exams and planner entries and updating on its own.
 * Asked for on a tap rather than on load, so nobody gets a link they did not
 * want.
 */
function CalendarSync() {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  if (!user) return null;

  const load = async (reset = false) => {
    setBusy(true);
    setNote("");
    try {
      setUrl(await getCalendarFeedUrl({ reset }));
      if (reset) setNote("New link made. The old one has stopped working — add the new one to your calendar.");
    } catch (error) {
      // A server function that isn't deployed yet answers without CORS
      // headers, which the SDK reports as "internal"; online, that means
      // "not switched on yet", not a bad connection.
      setNote(
        error?.code === "functions/internal" && navigator.onLine !== false
          ? "Calendar sync isn't switched on yet. Try again later."
          : friendlyError(error, "Couldn't get your link. Try again.")
      );
    }
    setBusy(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied.");
    } catch {
      setNote("Couldn't copy — press and hold the link to copy it instead.");
    }
  };

  const reset = () => {
    if (window.confirm("Make a new link? The old one stops working, so calendars using it stop updating.")) load(true);
  };

  return (
    <article className="panel profile-card calendar-sync">
      <div className="panel-head">
        <h3 className="panel-title">Calendar sync</h3>
      </div>

      <p className="profile-data-copy">
        See your exams and planner in Google Calendar or Apple Calendar. They update on their own every few hours.
      </p>

      {url ? (
        <>
          <div className="calendar-sync-actions">
            <a className="btn btn-primary" href={googleCalendarUrl(url)} target="_blank" rel="noreferrer noopener">
              <FiCalendar aria-hidden="true" /> Add to Google Calendar
            </a>
            <a className="btn" href={webcalUrl(url)}>
              <FiCalendar aria-hidden="true" /> Add to Apple Calendar
            </a>
          </div>
          <div className="calendar-sync-link">
            <code>{url}</code>
            <button type="button" className="icon-btn" onClick={copy} aria-label="Copy link" title="Copy link">
              <FiCopy />
            </button>
          </div>
          <p className="panel-note">
            Anyone with this link can see your exams and plans, so keep it to yourself.{" "}
            <button type="button" className="focus-link" onClick={reset} disabled={busy}>
              Reset link
            </button>
          </p>
        </>
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => load(false)} disabled={busy}>
          <FiCalendar aria-hidden="true" /> {busy ? "Getting your link…" : "Set up calendar sync"}
        </button>
      )}

      {note ? <p className="profile-status" role="status">{note}</p> : null}
    </article>
  );
}

export default CalendarSync;
