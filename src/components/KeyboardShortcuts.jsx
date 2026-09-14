import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiX } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

const isTypingTarget = (target) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
const destinations = { t: "/tasks", h: "/habits", p: "/planner", f: "/finance", r: "/friends" };

export default function KeyboardShortcuts() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const pendingGo = useRef(false);
  const close = () => setOpen(false);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return;
      if (event.key === "Escape") { pendingGo.current = false; close(); return; }
      if (event.key === "?" && !event.metaKey && !event.ctrlKey) { event.preventDefault(); setOpen(true); return; }
      if (pendingGo.current) {
        pendingGo.current = false;
        const path = destinations[event.key.toLowerCase()];
        if (path) { event.preventDefault(); navigate(path); }
        return;
      }
      if (event.key.toLowerCase() === "g" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        pendingGo.current = true;
        window.setTimeout(() => { pendingGo.current = false; }, 900);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  if (!open) return null;
  return createPortal(<div className="shortcut-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><section className="shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title"><header><div><p className="eyebrow">KEYBOARD</p><h2 id="shortcuts-title">Move through U.Do faster</h2></div><button type="button" className="btn btn-icon" onClick={close} aria-label="Close keyboard shortcuts"><FiX /></button></header><div className="shortcut-list"><p><kbd>⌘</kbd><kbd>K</kbd><span>Open command palette</span></p><p><kbd>G</kbd><kbd>T</kbd><span>Go to Tasks</span></p><p><kbd>G</kbd><kbd>H</kbd><span>Go to Habits</span></p><p><kbd>G</kbd><kbd>P</kbd><span>Go to Planner</span></p><p><kbd>G</kbd><kbd>F</kbd><span>Go to Finance</span></p><p><kbd>G</kbd><kbd>R</kbd><span>Go to Friends</span></p><p><kbd>Esc</kbd><span>Close a dialog</span></p></div></section></div>, document.body);
}
