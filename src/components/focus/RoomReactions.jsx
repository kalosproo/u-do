import { useEffect, useState } from "react";
import { FiCoffee, FiHeart, FiMoon, FiSmile, FiStar, FiThumbsUp, FiZap } from "react-icons/fi";

import { useAuth } from "../../hooks/useAuth";
import { useStudyRoom } from "../../hooks/useStudyRoom";
import { REACTION_MS, REACTIONS } from "../../services/studyRooms";

const ICONS = { thumbs: FiThumbsUp, zap: FiZap, coffee: FiCoffee, star: FiStar, heart: FiHeart, moon: FiMoon };
const LABELS = { thumbs: "Thumbs up", zap: "Let's go", coffee: "Coffee break", star: "Nice work", heart: "Love it", moon: "Tired" };

/**
 * Quick reactions in a study room: a fixed row of icons, and the ones
 * people just sent, shown for a few seconds. No typing, by design.
 */
function RoomReactions({ compact = false }) {
  const { user } = useAuth();
  const study = useStudyRoom();
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const members = study?.members || [];
  const latest = members.reduce((max, member) => Math.max(max, member.reactedAt || 0), 0);

  // Ticks only while a reaction is still on screen.
  useEffect(() => {
    if (!latest || Date.now() - latest > REACTION_MS) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [latest]);

  if (!study?.room) return null;

  const recent = members.filter((member) => member.reaction && now - member.reactedAt < REACTION_MS);

  const bubbles = (
    <div className="room-reactions-live" aria-live="polite">
      {recent.map((member) => {
        const Icon = ICONS[member.reaction];
        return (
          <span key={`${member.uid}-${member.reactedAt}`} className="room-reaction-bubble">
            <Icon aria-hidden="true" />
            {member.uid === user?.uid ? "You" : member.name.split(" ")[0]}
            <span className="sr-only">: {LABELS[member.reaction]}</span>
          </span>
        );
      })}
    </div>
  );

  const bar = (
    <div className="room-reactions-bar" role="group" aria-label="React">
      {REACTIONS.map((key) => {
        const Icon = ICONS[key];
        return (
          <button
            key={key}
            type="button"
            aria-label={LABELS[key]}
            title={LABELS[key]}
            onClick={() => {
              setNow(Date.now());
              setOpen(false);
              study.react(key);
            }}
          >
            <Icon />
          </button>
        );
      })}
    </div>
  );

  // On the full-screen timer: one button in the top bar opens the row, and
  // reactions show as bubbles just under it, clear of the clock.
  if (compact) {
    return (
      <div className="room-reactions is-compact">
        <button
          type="button"
          className="focus-icon-btn"
          aria-label="React"
          aria-expanded={open}
          title="React"
          onClick={() => setOpen((value) => !value)}
        >
          <FiSmile />
        </button>
        {open ? <div className="room-reactions-pop">{bar}</div> : null}
        {!open && recent.length ? <div className="room-reactions-toasts">{bubbles}</div> : null}
      </div>
    );
  }

  return (
    <div className="room-reactions">
      {bubbles}
      {bar}
    </div>
  );
}

export default RoomReactions;
