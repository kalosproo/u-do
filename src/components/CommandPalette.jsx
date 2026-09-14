import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { FiArrowRight, FiCommand, FiX } from "react-icons/fi";

const isTypingTarget = (target) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

const NAVIGATION = [
  ["Home", "/", "Overview of your life"],
  ["Tasks", "/tasks", "All tasks and priorities"],
  ["Habits", "/habits", "Recurring progress"],
  ["Planner", "/planner", "Your schedule"],
  ["Finance", "/finance", "Transactions and spending"],
  ["Friends", "/friends", "Accountability with friends"],
  ["Profile", "/profile", "Profile and account"],
];

export default function CommandPalette() {
  const navigate = useNavigate();
  const labelId = useId();
  const inputRef = useRef(null);
  const lastFocusRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const commands = useMemo(
    () => [
      { label: "Capture something", hint: "Task, habit, or transaction", run: () => window.dispatchEvent(new Event("udo:quick-capture")) },
      { label: "Create a task", hint: "Open Tasks", run: () => navigate("/tasks") },
      { label: "Create a habit", hint: "Open Habits", run: () => navigate("/habits") },
      { label: "Add a transaction", hint: "Open Finance", run: () => navigate("/finance") },
      { label: "Create a plan", hint: "Open Planner", run: () => navigate("/planner") },
      ...NAVIGATION.map(([label, path, hint]) => ({ label: `Go to ${label}`, hint, run: () => navigate(path) })),
    ],
    [navigate]
  );
  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? commands.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(term)) : commands;
  }, [commands, query]);

  const close = () => { setOpen(false); setQuery(""); setActiveIndex(0); };
  const execute = (command) => { close(); command.run(); };

  useEffect(() => {
    const onOpen = () => { lastFocusRef.current = document.activeElement; setOpen(true); };
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!open) onOpen();
        return;
      }
      if (!open || isTypingTarget(event.target)) return;
      if (event.key === "Escape") close();
    };
    window.addEventListener("udo:command-palette", onOpen);
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("udo:command-palette", onOpen); window.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    return () => lastFocusRef.current?.focus?.();
  }, [open]);

  const selectedIndex = Math.min(activeIndex, Math.max(matches.length - 1, 0));

  if (!open) return null;
  return createPortal(
    <div className="command-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="command-palette" role="dialog" aria-modal="true" aria-labelledby={labelId}>
        <div className="command-search-row">
          <FiCommand aria-hidden="true" />
          <label id={labelId} className="sr-only" htmlFor="command-search">Command palette</label>
          <input id="command-search" ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands" onKeyDown={(event) => {
            if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(index + 1, matches.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0)); }
            if (event.key === "Enter" && matches[selectedIndex]) execute(matches[selectedIndex]);
            if (event.key === "Escape") close();
          }} />
          <button type="button" className="btn btn-icon" onClick={close} aria-label="Close command palette"><FiX /></button>
        </div>
        <div className="command-results" role="listbox" aria-label="Commands">
          {matches.map((command, index) => <button key={command.label} type="button" className={`command-item ${index === selectedIndex ? "is-active" : ""}`} role="option" aria-selected={index === selectedIndex} onMouseEnter={() => setActiveIndex(index)} onClick={() => execute(command)}><span><strong>{command.label}</strong><small>{command.hint}</small></span><FiArrowRight aria-hidden="true" /></button>)}
          {!matches.length ? <p className="command-empty">No matching commands.</p> : null}
        </div>
        <footer className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> to navigate</span><span><kbd>↵</kbd> to select</span><span><kbd>Esc</kbd> to close</span></footer>
      </section>
    </div>, document.body
  );
}
