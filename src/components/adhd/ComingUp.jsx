import { useEffect, useState } from "react";
import { FiBookOpen, FiClock } from "react-icons/fi";

import { useAuth } from "../../hooks/useAuth";
import { listExams } from "../../services/exams";
import { listClasses } from "../../services/timetable";
import { daysUntil, upcomingExams } from "../../utils/exams";
import { currentOrNext, describeWait } from "../../utils/timetable";
import { useWarm } from "./useWarm";

/** How far ahead an exam is worth a line on today's screen. */
const EXAM_HORIZON_DAYS = 21;

const clock = (time) => {
  const [h, m] = time.split(":").map(Number);
  const at = new Date();
  at.setHours(h, m, 0, 0);
  return at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

const examWhen = (days) => (days === 0 ? "Exam today" : days === 1 ? "Exam tomorrow" : `Exam in ${days} days`);

/**
 * The time-shaped things on Today: the class you're in or the next one
 * today, and the nearest exam in the next three weeks. Nothing when there's
 * neither, so a free day stays empty.
 */
function ComingUp() {
  const { user } = useAuth();
  const uid = user?.uid || "";
  const [classes, setClasses] = useWarm(uid ? `${uid}:classes` : "");
  const [exams, setExams] = useWarm(uid ? `${uid}:exams` : "");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    Promise.all([listClasses(uid).catch(() => []), listExams(uid).catch(() => [])]).then(([nextClasses, nextExams]) => {
      if (cancelled) return;
      setClasses(nextClasses);
      setExams(nextExams);
    });
    return () => {
      cancelled = true;
    };
  }, [uid, setClasses, setExams]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Today's only: tomorrow's nine o'clock belongs to tomorrow's screen.
  const lesson = currentOrNext(classes || [], now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = lesson && (lesson.status === "now" || lesson.minutes + nowMinutes < 1440) ? lesson : null;
  const exam = upcomingExams(exams || [], now).find((item) => daysUntil(item.date, now) <= EXAM_HORIZON_DAYS);
  if (!today && !exam) return null;

  return (
    <section className="adhd-coming" aria-label="Coming up">
      <p className="adhd-eyebrow">Coming up</p>
      <ul>
        {today ? (
          <li>
            <span className="adhd-coming-icon" aria-hidden="true">
              <FiClock />
            </span>
            <span className="adhd-coming-text">
              <strong>{today.cls.subject}</strong>
              <small>
                {today.status === "now" ? `On now, until ${clock(today.cls.end)}` : `${clock(today.cls.start)} · ${describeWait(today.minutes, today.cls, now)}`}
                {today.cls.room ? ` · ${today.cls.room}` : ""}
              </small>
            </span>
          </li>
        ) : null}
        {exam ? (
          <li>
            <span className="adhd-coming-icon" aria-hidden="true">
              <FiBookOpen />
            </span>
            <span className="adhd-coming-text">
              <strong>{exam.title || exam.subject}</strong>
              <small>{examWhen(daysUntil(exam.date, now))}</small>
            </span>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

export default ComingUp;
