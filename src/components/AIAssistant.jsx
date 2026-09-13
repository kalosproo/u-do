import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FiAlertCircle, FiCheck, FiCpu, FiX } from "react-icons/fi";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { ask, formatAssistantError } from "../services/ai/assistant";
import { applyCalls } from "../services/ai/runtime";
import { isDestructive, summarizeCall } from "../services/ai/tools";

const SUGGESTIONS = [
  "What should I focus on today?",
  "How much did I spend this month?",
  "Which habits am I behind on?",
];

/**
 * Thin shell around services/ai: it collects a question, shows what the
 * assistant read, and applies staged actions only when the user confirms.
 * None of the reasoning or data access lives here.
 */
function AIAssistant({ collapsed = false }) {
  const requireUser = useAuthGuard();
  const inputRef = useRef(null);

  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [reply, setReply] = useState("");
  const [pending, setPending] = useState([]);
  const [outcome, setOutcome] = useState(null);

  const reset = () => {
    setReply("");
    setPending([]);
    setOutcome(null);
    setStatus("");
  };

  const close = () => {
    setIsOpen(false);
    setQuestion("");
    reset();
  };

  // The textarea grows with the text instead of hiding it on one line.
  const autoGrow = (element) => {
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
  };

  const submit = async (text = question) => {
    const user = requireUser();
    if (!user || !text.trim() || busy) return;

    setBusy(true);
    reset();

    try {
      const result = await ask({ uid: user.uid, user }, text.trim());
      setReply(result.reply || "Done.");
      setPending(result.actions);
    } catch (error) {
      setStatus(formatAssistantError(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmActions = async () => {
    const user = requireUser();
    if (!user || !pending.length) return;

    const destructive = pending.filter((call) => isDestructive(call.tool));

    if (destructive.length) {
      const lines = destructive.map((call) => `• ${summarizeCall(call)}`).join("\n");
      if (!window.confirm(`This permanently deletes data:\n\n${lines}\n\nContinue?`)) return;
    }

    setBusy(true);
    setStatus("");

    try {
      // Reported straight from what actually ran — never assumed.
      const result = await applyCalls({ uid: user.uid, user }, pending, { confirmedDestructive: true });
      setOutcome(result);
      setPending([]);
    } catch (error) {
      setStatus(error?.message || "Couldn't apply those changes.");
    } finally {
      setBusy(false);
    }
  };

  const launcher = collapsed ? (
    <button
      type="button"
      className="assistant-launch-btn is-icon"
      onClick={() => setIsOpen(true)}
      aria-label="Open AI Assistant"
      title="AI Assistant"
    >
      <FiCpu />
    </button>
  ) : (
    <button type="button" className="assistant-launch-btn" onClick={() => setIsOpen(true)}>
      <FiCpu />
      <span>AI Assistant</span>
    </button>
  );

  return (
    <>
      {launcher}

      {isOpen &&
        createPortal(
          <div className="assistant-overlay" role="dialog" aria-modal="true" aria-label="AI Assistant">
            <section className="assistant-popup">
              <header className="assistant-popup-header">
                <h4 className="panel-title">U.Do Assistant</h4>
                <button type="button" className="assistant-close-btn" onClick={close} aria-label="Close">
                  <FiX />
                </button>
              </header>

              <p className="assistant-muted">
                Ask about your tasks, habits, spending or friends. I read your real data, and any
                change is shown for you to confirm first.
              </p>

              {!reply && !outcome ? (
                <div className="assistant-quick-actions">
                  {SUGGESTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="assistant-chip"
                      onClick={() => {
                        setQuestion(item);
                        submit(item);
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              ) : null}

              <textarea
                ref={inputRef}
                className="assistant-input"
                rows={1}
                placeholder="e.g. add a task to submit the lab report, no due date"
                value={question}
                onChange={(event) => {
                  setQuestion(event.target.value);
                  autoGrow(event.target);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />

              <div className="assistant-cta-row">
                <button
                  type="button"
                  className="assistant-apply-btn"
                  onClick={() => submit()}
                  disabled={busy || !question.trim()}
                >
                  {busy ? "Thinking…" : "Ask"}
                </button>
              </div>

              {status ? (
                <p className="assistant-status">
                  <FiAlertCircle /> {status}
                </p>
              ) : null}

              {reply ? <p className="assistant-summary">{reply}</p> : null}

              {pending.length ? (
                <div className="assistant-response">
                  <p className="assistant-muted">
                    {pending.length} change{pending.length === 1 ? "" : "s"} ready — nothing is saved
                    until you confirm.
                  </p>

                  <div className="assistant-action-list">
                    {pending.map((call, index) => (
                      <div
                        key={`${call.tool}-${index}`}
                        className={`assistant-action ${isDestructive(call.tool) ? "is-destructive" : ""}`}
                      >
                        <span>{summarizeCall(call)}</span>
                        <button
                          type="button"
                          className="autoplan-remove"
                          aria-label={`Drop: ${summarizeCall(call)}`}
                          onClick={() => setPending((list) => list.filter((_, i) => i !== index))}
                        >
                          <FiX />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="assistant-cta-row">
                    <button type="button" className="assistant-apply-btn" onClick={confirmActions} disabled={busy}>
                      <FiCheck /> {busy ? "Applying…" : `Apply ${pending.length}`}
                    </button>
                    <button type="button" className="quickcap-secondary" onClick={() => setPending([])} disabled={busy}>
                      Discard
                    </button>
                  </div>
                </div>
              ) : null}

              {outcome ? (
                <div className="assistant-response">
                  <p className="assistant-summary">
                    {outcome.succeeded} change{outcome.succeeded === 1 ? "" : "s"} applied
                    {outcome.failed.length ? `, ${outcome.failed.length} failed` : ""}.
                  </p>

                  {outcome.failed.length ? (
                    <div className="assistant-action-list">
                      {outcome.failed.map((entry, index) => (
                        <p key={`${entry.tool}-${index}`} className="assistant-status">
                          <FiAlertCircle /> {entry.tool}: {entry.error}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <p className="assistant-muted">Reopen the page to see the changes.</p>
                </div>
              ) : null}
            </section>
          </div>,
          document.body
        )}
    </>
  );
}

export default AIAssistant;
