import { useEffect, useState } from "react";
import { FiMapPin } from "react-icons/fi";
import { Link } from "react-router-dom";

import { useAuth } from "../hooks/useAuth";
import { listClasses } from "../services/timetable";
import { currentOrNext, describeWait } from "../utils/timetable";

const clock = (time) => {
  const [h, m] = time.split(":").map(Number);
  const at = new Date();
  at.setHours(h, m, 0, 0);
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

/** Home's one line about the timetable: the class on now, or the next one. */
function NextClass() {
  const { user } = useAuth();
  const [state, setState] = useState({ uid: null, classes: [] });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    listClasses(user.uid)
      .then((classes) => !cancelled && setState({ uid: user.uid, classes }))
      .catch(() => !cancelled && setState({ uid: user.uid, classes: [] }));
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!user || state.uid !== user.uid) return null;
  const info = currentOrNext(state.classes, now);
  if (!info) return null;
  const { cls, status, minutes } = info;

  return (
    <Link to="/planner" className="panel next-class" aria-label={`${status === "now" ? "Now" : "Next"}: ${cls.subject}`}>
      <span className="eyebrow">{status === "now" ? "NOW" : "NEXT CLASS"}</span>
      <strong className="next-class-subject">{cls.subject}</strong>
      <span className="next-class-meta">
        {status === "now" ? `until ${clock(cls.end)}` : `${clock(cls.start)} · ${describeWait(minutes, cls, now)}`}
        {cls.room ? (
          <>
            {" · "}
            <FiMapPin aria-hidden="true" /> {cls.room}
          </>
        ) : null}
      </span>
    </Link>
  );
}

export default NextClass;
