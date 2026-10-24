import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiChevronDown, FiPlus, FiX } from "react-icons/fi";

import { playDone } from "../../utils/ambient";
import { buzz, celebrate } from "../../utils/feedback";
import { quietMotion } from "../../utils/morph";
import { Burst } from "./AdhdBits";

/**
 * The few pieces every ADHD screen is built from, so they all behave the
 * same way: one header, one kind of sheet, one tick, one way to choose, one
 * way to add. Fewer kinds of thing is most of what makes it calm.
 */

/** A screen: a small line on top, a serif title with one word in italic, a line under it. */
export function AdhdPage({ eyebrow, title, italic, sub, action, className = "", children }) {
  return (
    <section className={`adhd-page ${className}`}>
      <header className="adhd-page-head">
        <div className="adhd-head-top">
          <p className="adhd-date">{eyebrow}</p>
          {action}
        </div>
        <h1 className="adhd-title">
          {title}
          {italic ? (
            <>
              {" "}
              <em>{italic}</em>
            </>
          ) : null}
        </h1>
        {sub ? <p className="adhd-sub">{sub}</p> : null}
      </header>
      {children}
    </section>
  );
}

/**
 * A sheet that rises from the bottom over a dimmed page. Tapping outside,
 * the close button, Escape, or dragging it down puts it away; while it's up
 * the page behind stays still. It follows the finger and springs back if
 * let go too soon, like the sheets on a phone.
 */
export function Sheet({ open, onClose, label, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  const closingRef = useRef(false);
  const drag = useRef(null);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(
      () => {
        closingRef.current = false;
        setClosing(false);
        closeRef.current?.();
      },
      quietMotion() ? 0 : 220
    );
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (event) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.classList.add("adhd-sheet-open");
    // Focus the first field if there is one, otherwise the sheet itself.
    const timer = setTimeout(() => {
      const field = panelRef.current?.querySelector("input, textarea");
      (field || panelRef.current)?.focus({ preventScroll: true });
    }, 60);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("adhd-sheet-open");
      previous?.focus?.({ preventScroll: true });
    };
  }, [open, requestClose]);

  // Dragging: the panel follows the finger directly, with no re-render per frame.
  const onDown = (event) => {
    if (event.button > 0 || !panelRef.current) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { start: event.clientY, y: event.clientY, t: event.timeStamp, v: 0 };
    panelRef.current.classList.add("is-dragging");
  };
  const onMove = (event) => {
    const d = drag.current;
    if (!d || !panelRef.current) return;
    d.v = (event.clientY - d.y) / Math.max(1, event.timeStamp - d.t);
    d.y = event.clientY;
    d.t = event.timeStamp;
    panelRef.current.style.transform = `translate3d(0, ${Math.max(0, event.clientY - d.start)}px, 0)`;
  };
  const onUp = (event) => {
    const d = drag.current;
    drag.current = null;
    const panel = panelRef.current;
    if (!d || !panel) return;
    panel.classList.remove("is-dragging");
    // Far enough, or flicked: away it goes. Otherwise it springs back.
    if (event.clientY - d.start > 110 || d.v > 0.7) {
      panel.classList.add("is-flung");
      panel.style.transform = "translate3d(0, 110%, 0)";
      requestClose();
    } else {
      panel.style.transform = "";
    }
  };

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className={`adhd-sheet-layer${closing ? " is-closing" : ""}`}>
      <button type="button" className="adhd-sheet-backdrop" aria-label="Close" tabIndex={-1} onClick={requestClose} />
      <div ref={panelRef} className="adhd-sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <span className="adhd-sheet-grab" aria-hidden="true" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <span className="adhd-sheet-handle" />
        </span>
        <button type="button" className="adhd-sheet-close" aria-label="Close" onClick={requestClose}>
          <FiX />
        </button>
        {children}
      </div>
    </div>,
    document.body
  );
}

/**
 * The round tick used everywhere something gets done. Ticking it rings the
 * soft chime, taps the phone and sends out a ring and a few sparks;
 * unticking is quiet.
 */
export function Tick({ done, onToggle, label, size = "md" }) {
  const [pops, setPops] = useState(0);
  return (
    <button
      type="button"
      className={`adhd-tick is-${size}${done ? " is-done" : ""}`}
      aria-pressed={Boolean(done)}
      aria-label={label}
      onClick={() => {
        if (!done) {
          celebrate();
          playDone();
          setPops((n) => n + 1);
        }
        onToggle();
      }}
    >
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="14.5" />
        <path d="M10 16.6 14.2 20.8 22.4 12" />
      </svg>
      {pops ? (
        <>
          <span key={`ring-${pops}`} className="adhd-tick-ripple" aria-hidden="true" />
          <Burst key={`burst-${pops}`} small />
        </>
      ) : null}
    </button>
  );
}

/**
 * A row you can swipe: right to finish it, left to push it to tomorrow. The
 * row follows the finger and shows what letting go will do; short of the
 * mark it springs back. Up-and-down still scrolls the page, and a tap is
 * still a tap.
 */
export function Swipe({ onRight, onLeft, rightLabel, leftLabel, disabled = false, children }) {
  const topRef = useRef(null);
  const drag = useRef(null);
  const swallow = useRef(false);

  // Written straight to the elements: following a finger never re-renders.
  const place = (x, animate = false) => {
    const top = topRef.current;
    if (!top) return;
    const wrap = top.parentElement;
    const reach = Math.min(1, Math.abs(x) / Math.max(1, wrap.offsetWidth * 0.3));
    top.classList.toggle("is-settling", animate);
    top.style.transform = x ? `translate3d(${x}px, 0, 0)` : "";
    // On the way back the row keeps its card look until it has landed.
    if (x) wrap.dataset.side = x > 0 ? "right" : "left";
    else if (!animate) delete wrap.dataset.side;
    wrap.style.setProperty("--reach", String(reach));
    if (reach >= 1 && !wrap.hasAttribute("data-armed")) buzz(8);
    wrap.toggleAttribute("data-armed", reach >= 1);
  };
  const landed = () => {
    const top = topRef.current;
    if (!top || top.style.transform) return;
    top.classList.remove("is-settling");
    delete top.parentElement.dataset.side;
  };

  const onDown = (event) => {
    swallow.current = false;
    if (disabled || event.button > 0) return;
    drag.current = { x: event.clientX, y: event.clientY, active: false, id: event.pointerId };
  };
  const onMove = (event) => {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    if (!d.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        drag.current = null; // A scroll, not a swipe.
        return;
      }
      if (Math.abs(dx) < 10) return;
      d.active = true;
      event.currentTarget.setPointerCapture?.(d.id);
    }
    // Free toward a side that does something, stiff toward one that doesn't.
    const allowed = (dx > 0 && onRight) || (dx < 0 && onLeft);
    place(allowed ? dx : dx * 0.15);
  };
  const onUp = (event) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    swallow.current = true;
    const wrap = topRef.current?.parentElement;
    const width = wrap?.offsetWidth || 300;
    const dx = event.clientX - d.x;
    if (dx > width * 0.3 && onRight) {
      celebrate();
      place(width, true);
      setTimeout(onRight, 180);
    } else if (dx < -width * 0.3 && onLeft) {
      place(-width, true);
      setTimeout(onLeft, 180);
    } else {
      place(0, true);
    }
  };

  return (
    <div
      className="adhd-swipe"
      onClickCapture={(event) => {
        // The click that ends a swipe isn't a tap on whatever was under the finger.
        if (swallow.current) {
          swallow.current = false;
          event.stopPropagation();
          event.preventDefault();
        }
      }}
    >
      {!disabled ? (
        <div className="adhd-swipe-under" aria-hidden="true">
          {onRight ? <span className="is-right">{rightLabel}</span> : <span />}
          {onLeft ? <span className="is-left">{leftLabel}</span> : <span />}
        </div>
      ) : null}
      <div
        ref={topRef}
        className="adhd-swipe-top"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onTransitionEnd={(event) => event.target === event.currentTarget && landed()}
      >
        {children}
      </div>
    </div>
  );
}

/** Two or three choices in a row, one of them picked. Never more than three. */
export function Chips({ options, value, onChange, label, size = "md", stack = false }) {
  return (
    <div className={`adhd-chips is-${size}${stack ? " is-stack" : ""}`} role="radiogroup" aria-label={label}>
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          className={value === key ? "is-on" : ""}
          onClick={() => onChange(key)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * One line to add something. Anything that only matters once you've started
 * typing (when, how often) waits underneath until then.
 */
export function AddBar({ placeholder, onAdd, label, inputMode, children }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      if ((await onAdd(value)) !== false) setText("");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={`adhd-addbar${text.trim() ? " is-typing" : ""}`} onSubmit={submit}>
      <div className="adhd-add">
        <FiPlus aria-hidden="true" />
        <input
          value={text}
          maxLength={200}
          placeholder={placeholder}
          aria-label={label || placeholder}
          inputMode={inputMode}
          enterKeyHint="done"
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="adhd-add-btn" disabled={!text.trim() || busy}>
          Add
        </button>
      </div>
      {children && text.trim() ? <div className="adhd-addbar-more">{children}</div> : null}
    </form>
  );
}

/** A section that can fold away, closed unless it matters right now. */
export function Fold({ title, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={`adhd-fold${open ? " is-open" : ""}`}>
      <button type="button" className="adhd-fold-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="adhd-eyebrow">{title}</span>
        {count ? <span className="adhd-fold-count">{count}</span> : null}
        <FiChevronDown aria-hidden="true" className="adhd-fold-chevron" />
      </button>
      {open ? (
        <div id={id} className="adhd-fold-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** A quiet note that floats above the dock for a moment, with an optional Undo. */
export function Toast({ message, onUndo }) {
  if (!message) return null;
  return (
    <div className="adhd-toast" role="status" aria-live="polite">
      <span>{message}</span>
      {onUndo ? (
        <button type="button" onClick={onUndo}>
          Undo
        </button>
      ) : null}
    </div>
  );
}
