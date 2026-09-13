import { useEffect, useRef, useState } from "react";
import { FiMoreHorizontal } from "react-icons/fi";

/**
 * The secondary-action menu for a page.
 *
 * Anything that isn't a primary action lives here — most importantly the
 * destructive ones, which used to sit in the page header competing with Add
 * and Create. Every page uses this same control in the same corner, so
 * "where do I clear this?" has one answer everywhere.
 *
 * The menu closes on Escape, on a click outside, and after any item runs;
 * Escape hands focus back to the trigger so keyboard users aren't stranded.
 */
function PageMenu({ label = "More actions", children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="page-menu" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="page-menu-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
      >
        <FiMoreHorizontal />
      </button>

      {open ? (
        // Any activation inside the panel dismisses it, so an item never has
        // to remember to close the menu it lives in.
        <div className="page-menu-panel" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

/** A non-interactive grouping label, e.g. the heading above destructive rows. */
export function PageMenuLabel({ children }) {
  return <p className="page-menu-label">{children}</p>;
}

export default PageMenu;
