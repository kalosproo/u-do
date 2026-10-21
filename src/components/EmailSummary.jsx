import { useEffect, useState } from "react";
import { FiMail } from "react-icons/fi";

import { useAuth } from "../hooks/useAuth";
import { emailAvailable, readEmailPrefs, saveEmailPrefs } from "../services/emailPrefs";

const DEFAULT_TIME = "07:30";

/**
 * The opt-in morning summary email. Hidden until the deployment has email
 * switched on (appConfig/email), so nobody turns on something that can't send.
 * Works on any phone — unlike web push, email needs no home-screen install.
 */
function EmailSummary() {
  const { user } = useAuth();
  const [state, setState] = useState({ uid: null, available: false, daily: false, monthly: false, time: DEFAULT_TIME });
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    (async () => {
      const available = await emailAvailable();
      const prefs = available ? await readEmailPrefs(user.uid).catch(() => null) : null;
      if (!cancelled) {
        setState({ uid: user.uid, available, daily: prefs?.daily === true, monthly: prefs?.monthly === true, time: prefs?.time || DEFAULT_TIME });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user || state.uid !== user.uid || !state.available) return null;

  const google = (user.providerData || []).some((p) => p.providerId === "google.com");
  const confirmed = user.emailVerified || google;

  const save = async (patch) => {
    const next = { ...state, ...patch };
    setState(next);
    setNote("");
    try {
      await saveEmailPrefs(user.uid, next);
      if (patch.daily === true) setNote(`Done. The first one arrives tomorrow around ${next.time}.`);
      if (patch.monthly === true) setNote(`Done. The next one arrives on the 1st around ${next.time}.`);
    } catch {
      setNote("Couldn't save that. Try again.");
    }
  };

  return (
    <article className="panel profile-card">
      <div className="panel-head">
        <h3 className="panel-title">Morning email</h3>
      </div>

      <p className="profile-data-copy">
        A short email each morning with what&apos;s due, what&apos;s overdue, what you planned and the
        habits to tick. Only on days with something on — never an empty one.
      </p>

      {confirmed ? (
        <>
          <label className="push-type">
            <input type="checkbox" checked={state.daily} onChange={(event) => save({ daily: event.target.checked })} />
            <span>
              <strong>
                <FiMail aria-hidden="true" /> Email me a daily summary
              </strong>
              <span className="panel-note">Sent to {user.email}. Every email has a one-tap unsubscribe.</span>
            </span>
          </label>
          <label className="push-type">
            <input type="checkbox" checked={state.monthly} onChange={(event) => save({ monthly: event.target.checked })} />
            <span>
              <strong>
                <FiMail aria-hidden="true" /> Email me a monthly report
              </strong>
              <span className="panel-note">On the 1st: last month&apos;s tasks, focus time, habits and money.</span>
            </span>
          </label>
          {state.daily || state.monthly ? (
            <div className="push-window">
              <span className="push-window-label">Send it at</span>
              <div className="push-window-times">
                <input type="time" value={state.time} aria-label="Summary time" onChange={(event) => save({ time: event.target.value || DEFAULT_TIME })} />
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="panel-note">Confirm your email address first — the banner at the top of the app sends the link.</p>
      )}

      {note ? <p className="profile-status" role="status">{note}</p> : null}
    </article>
  );
}

export default EmailSummary;
