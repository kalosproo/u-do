import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { dayLeft } from "../../utils/adhd";

const buzz = (pattern) => {
  try {
    if (!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) navigator.vibrate?.(pattern);
  } catch {
    /* No motor, no matter. */
  }
};

/**
 * Today's picks as one ring cut into equal arcs: lit when done, breathing
 * for the one in progress, faint for the rest.
 */
export function ProgressRing({ states, size = 52 }) {
  const r = 21;
  const c = 2 * Math.PI * r;
  const n = Math.max(1, states.length);
  const gap = n > 1 ? 8 : 0;
  const arc = (c - gap * n) / n;
  return (
    <svg className="adhd-ring" viewBox="0 0 50 50" width={size} height={size} aria-hidden="true">
      {states.map((state, index) => (
        <circle
          key={index}
          cx="25"
          cy="25"
          r={r}
          className={state ? `is-${state}` : ""}
          strokeDasharray={`${arc} ${c - arc}`}
          strokeDashoffset={c / 4 - gap / 2 - index * (arc + gap)}
        />
      ))}
    </svg>
  );
}

/** A slim track of the waking day with a dot for now, and what's left of it. */
export function DayTrack() {
  const [day, setDay] = useState(() => dayLeft());
  useEffect(() => {
    const timer = setInterval(() => setDay(dayLeft()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="adhd-day">
      <span className="adhd-day-track" aria-hidden="true">
        <span className="adhd-day-fill" style={{ "--day": day.progress }} />
        <span className="adhd-day-dot" style={{ "--day": day.progress }} />
      </span>
      <span className="adhd-day-label">{day.label}</span>
    </div>
  );
}

/** A tick that draws itself: the circle, then the fill, then the mark. */
export function Check({ drawn, className = "" }) {
  return (
    <svg className={`adhd-check${drawn ? " is-drawn" : ""} ${className}`} viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r="24" />
      <path d="M15 27.5 22.5 35 37.5 18.5" />
    </svg>
  );
}

const SPARKS = Array.from({ length: 18 }, (_, i) => {
  // Evenly spread, with a fixed wobble so it never looks mechanical.
  const wobble = ((i * 37) % 11) - 5;
  return { angle: i * 20 + wobble, distance: 70 + ((i * 53) % 5) * 14, size: 3 + ((i * 29) % 3), delay: (i % 4) * 18 };
});

/** A soft burst of light from the centre of whatever it sits in. Re-key it to fire again. */
export function Burst() {
  return (
    <span className="adhd-burst" aria-hidden="true">
      {SPARKS.map((spark, i) => (
        <i
          key={i}
          style={{
            "--a": `${spark.angle}deg`,
            "--d": `${spark.distance}px`,
            "--s": `${spark.size}px`,
            animationDelay: `${spark.delay}ms`,
          }}
        />
      ))}
    </span>
  );
}

/**
 * Press and hold to finish: a fill sweeps across while held, and lets go
 * if you do. A deliberate moment, and no more ticking things by accident.
 * Keyboards and screen readers finish with a normal press.
 */
export function HoldButton({ onComplete, label, className = "", children, ms = 650 }) {
  const ref = useRef(null);
  const frame = useRef(0);
  const started = useRef(0);
  const finished = useRef(false);
  const hintTimer = useRef(0);
  const [hint, setHint] = useState(false);

  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      clearTimeout(hintTimer.current);
    },
    []
  );

  const set = (value) => ref.current?.style.setProperty("--hold", String(value));

  const complete = () => {
    if (finished.current) return;
    finished.current = true;
    set(1);
    ref.current?.classList.remove("is-holding");
    buzz([14, 40, 22]);
    onComplete();
  };

  // Times come from the events and frames themselves, which share one clock.
  const tick = (time) => {
    const progress = Math.min(1, Math.max(0, (time - started.current) / ms));
    set(progress);
    if (progress >= 1) complete();
    else frame.current = requestAnimationFrame(tick);
  };

  const begin = (event) => {
    if (finished.current || event.button > 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    started.current = event.timeStamp;
    ref.current?.classList.add("is-holding");
    setHint(false);
    buzz(6);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(tick);
  };

  const end = (event) => {
    if (finished.current || !started.current) return;
    cancelAnimationFrame(frame.current);
    if (event.timeStamp - started.current < 220) {
      setHint(true);
      clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), 1800);
    }
    started.current = 0;
    ref.current?.classList.remove("is-holding");
    set(0);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`adhd-hold ${className}${hint ? " is-hinting" : ""}`}
      aria-label={label}
      title="Press and hold"
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(event) => event.preventDefault()}
      // A press from a keyboard or screen reader arrives as a click with no pointer.
      onClick={(event) => {
        if (event.detail === 0) complete();
      }}
    >
      <span className="adhd-hold-label">{hint ? "Keep holding…" : children}</span>
      {/* The fill carries its own inverted copy of the label, so the words
          change colour exactly where the fill has reached. */}
      <span className="adhd-hold-fill" aria-hidden="true">
        <span className="adhd-hold-label">{hint ? "Keep holding…" : children}</span>
      </span>
    </button>
  );
}

/**
 * The light behind ADHD mode's home: two soft pools that drift so slowly
 * you only notice the room feels alive, and a fine grain over everything.
 */
export function Ambient() {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="adhd-ambient" aria-hidden="true">
      <span className="adhd-ambient-a" />
      <span className="adhd-ambient-b" />
      <span className="adhd-ambient-grain" />
    </div>,
    document.body
  );
}
