import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiChevronDown, FiPlus, FiX } from "react-icons/fi";

import { playDone } from "../../utils/ambient";
import { celebrate } from "../../utils/feedback";

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
 * the close button or Escape puts it away; while it's up the page behind
 * stays still.
 */
export function Sheet({ open, onClose, label, children }) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const onKey = (event) => {
      if (event.key === "Escape") closeRef.current?.();
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
  }, [open]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="adhd-sheet-layer">
      <button type="button" className="adhd-sheet-backdrop" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div ref={panelRef} className="adhd-sheet" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <span className="adhd-sheet-handle" aria-hidden="true" />
        <button type="button" className="adhd-sheet-close" aria-label="Close" onClick={onClose}>
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
 * soft chime and taps the phone; unticking is quiet.
 */
export function Tick({ done, onToggle, label, size = "md" }) {
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
        }
        onToggle();
      }}
    >
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="14.5" />
        <path d="M10 16.6 14.2 20.8 22.4 12" />
      </svg>
    </button>
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
