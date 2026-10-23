import { useMemo, useState } from "react";
import { FiArrowRight, FiCheck, FiGrid, FiMoon, FiPlay, FiPlus, FiRepeat, FiZap } from "react-icons/fi";

import { useAdhd } from "../../hooks/useAdhd";
import { useAuth } from "../../hooks/useAuth";
import { useFocus } from "../../hooks/useFocus";
import { createTask, normalizeTask, setSubtasks, setTaskStatus } from "../../services/tasks";
import { MAX_PICKS, currentStep, gentleDue, isOpen, pickForMe, rankTasks, swapNow, todayPlan, togglePick } from "../../utils/adhd";
import { playDone } from "../../utils/ambient";
import { formatRelativeDay, todayKey } from "../../utils/dateKeys";
import { celebrate } from "../../utils/feedback";
import { STARTER_MINUTES } from "../../utils/focusTimer";
import { toggleSubtask } from "../../utils/subtasks";

/** How many open tasks the picker shows before "Show all". */
const SHORT_LIST = 8;
/** Long enough to see the tick land before the card moves on. */
const FINISH_MS = 720;

const dateLine = () =>
  new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

function Check({ drawn }) {
  return (
    <svg className={`adhd-check${drawn ? " is-drawn" : ""}`} viewBox="0 0 52 52" aria-hidden="true">
      <circle cx="26" cy="26" r="24" />
      <path d="M15 27.5 22.5 35 37.5 18.5" />
    </svg>
  );
}

/**
 * Home in ADHD mode. One screen, one question at a time: what are today's
 * three, and what's the one thing now? Everything else is a tap away under
 * "Everything", never in the way.
 */
function AdhdHome({ tasks: rawTasks, onChanged, onPatch, onShowAll }) {
  const { user } = useAuth();
  const adhd = useAdhd();
  const focus = useFocus();
  const today = todayKey();
  const tasks = useMemo(() => rawTasks.map(normalizeTask), [rawTasks]);
  const plan = useMemo(() => todayPlan(tasks, adhd.picks), [tasks, adhd.picks]);
  const ranked = useMemo(() => rankTasks(tasks, today), [tasks, today]);

  const [draft, setDraft] = useState(null);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(null);
  const [stepLeaving, setStepLeaving] = useState(null);
  const [error, setError] = useState("");

  const firstName = user?.displayName?.trim()?.split(/\s+/)[0] || "";
  const hour = new Date().getHours();
  const hello = `${hour < 12 ? "Morning" : hour < 18 ? "Hey" : "Evening"}${firstName ? `, ${firstName}` : ""}.`;

  const picking = draft !== null || plan.picked.length === 0;
  const allDone = !picking && !plan.now;
  const donePicked = plan.picked.filter((task) => !isOpen(task));
  // Done first, then the one now, then the rest: the bar fills left to right.
  const segments = [...donePicked.map(() => "is-done"), ...(plan.now ? ["is-now"] : []), ...plan.next.map(() => "")];

  const openPicker = () => {
    setError("");
    setDraft(plan.picked.filter(isOpen).map((task) => task.id));
  };

  const savePicks = (chosen) => {
    // Finished picks stay on the bar while there's room, so progress isn't lost.
    const keep = donePicked.map((task) => task.id).slice(0, Math.max(0, MAX_PICKS - chosen.length));
    adhd.setPicks([...keep, ...chosen]);
    setDraft(null);
    setShowAllTasks(false);
  };

  const chosen = draft ?? [];
  const room = MAX_PICKS - chosen.length;

  const addTask = async (event) => {
    event.preventDefault();
    const title = newTitle.trim();
    if (!user || !title || adding) return;
    setAdding(true);
    setError("");
    try {
      const ref = await createTask(user.uid, { title, dueDate: today, priority: "medium" });
      setNewTitle("");
      setDraft((current) => togglePick(current ?? [], ref.id));
      await onChanged();
    } catch {
      setError("Couldn't add that. Try again in a moment.");
    } finally {
      setAdding(false);
    }
  };

  const finish = async (task) => {
    if (!user || finishing) return;
    setFinishing(task.id);
    celebrate();
    playDone();
    await new Promise((resolve) => setTimeout(resolve, FINISH_MS));
    onPatch(task.id, { status: "done", completed: true });
    setFinishing(null);
    try {
      await setTaskStatus(user.uid, task, "done");
      await onChanged();
    } catch {
      setError("Couldn't save that tick. It'll be there when you try again.");
      await onChanged();
    }
  };

  const finishStep = async (task, step) => {
    if (!user || stepLeaving) return;
    setStepLeaving(step.id);
    celebrate();
    playDone();
    await new Promise((resolve) => setTimeout(resolve, 360));
    const next = toggleSubtask(task.subtasks, step.id);
    onPatch(task.id, { subtasks: next });
    setStepLeaving(null);
    try {
      await setSubtasks(user.uid, task.id, next);
    } catch {
      setError("Couldn't save that step.");
      await onChanged();
    }
  };

  const justStart = (task) => {
    if (focus?.session) focus.open();
    else focus?.start(STARTER_MINUTES, task.title, { starter: true });
  };

  return (
    <section className="adhd-home" aria-label="Today">
      <header className="adhd-head">
        <div>
          <p className="adhd-date">{dateLine()}</p>
          <h1 className="adhd-hello">{hello}</h1>
          <p className="adhd-sub">
            {picking
              ? "What matters today? Pick up to three. Fewer is fine."
              : allDone
                ? "Everything you picked is done."
                : "One thing at a time. That's the whole plan."}
          </p>
        </div>
        <button type="button" className="adhd-ghost" onClick={onShowAll}>
          <FiGrid aria-hidden="true" /> Everything
        </button>
      </header>

      {!picking && plan.picked.length ? (
        <div className="adhd-progress">
          <div className="adhd-bars" role="progressbar" aria-valuemin={0} aria-valuemax={plan.picked.length} aria-valuenow={plan.done} aria-label="Today's progress">
            {segments.map((state, index) => (
              <span key={index} className={state} />
            ))}
          </div>
          <span className="adhd-progress-label">
            {plan.done} of {plan.picked.length} done
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="adhd-error" role="alert">
          {error}
        </p>
      ) : null}

      {picking ? (
        <article className="adhd-card adhd-picker">
          <div className="adhd-picker-head">
            <p className="adhd-eyebrow">Today&apos;s {MAX_PICKS}</p>
            <span className="adhd-count">
              {chosen.length}/{MAX_PICKS}
            </span>
          </div>

          {ranked.length ? (
            <ul className="adhd-options">
              {(showAllTasks ? ranked : ranked.slice(0, SHORT_LIST)).map((task, index) => {
                const position = chosen.indexOf(task.id);
                const selected = position !== -1;
                const due = gentleDue(task.dueDate, today) || (task.dueDate ? formatRelativeDay(task.dueDate) : "");
                return (
                  <li key={task.id} style={{ "--i": index }}>
                    <button
                      type="button"
                      className={`adhd-option${selected ? " is-selected" : ""}`}
                      aria-pressed={selected}
                      disabled={!selected && room === 0}
                      onClick={() => setDraft(togglePick(chosen, task.id))}
                    >
                      <span className="adhd-option-mark" aria-hidden="true">
                        {selected ? position + 1 : ""}
                      </span>
                      <span className="adhd-option-text">
                        <span className="adhd-option-title">{task.title}</span>
                        {due || task.subtasks.length ? (
                          <span className="adhd-option-meta">
                            {due}
                            {due && task.subtasks.length ? " · " : ""}
                            {task.subtasks.length ? `${task.subtasks.length} steps` : ""}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="adhd-empty">Your list is empty. Add the one thing you want to get done today.</p>
          )}

          {ranked.length > SHORT_LIST && !showAllTasks ? (
            <button type="button" className="adhd-link" onClick={() => setShowAllTasks(true)}>
              Show all {ranked.length}
            </button>
          ) : null}

          <form className="adhd-add" onSubmit={addTask}>
            <FiPlus aria-hidden="true" />
            <input
              value={newTitle}
              maxLength={200}
              placeholder="Add something for today"
              aria-label="New task for today"
              onChange={(event) => setNewTitle(event.target.value)}
            />
            <button type="submit" className="adhd-add-btn" disabled={!newTitle.trim() || adding}>
              Add
            </button>
          </form>

          <div className="adhd-picker-actions">
            <button
              type="button"
              className="adhd-btn"
              disabled={!ranked.length || room === 0}
              onClick={() => setDraft(pickForMe(tasks, today, chosen))}
            >
              <FiZap aria-hidden="true" /> Pick for me
            </button>
            <button type="button" className="adhd-btn adhd-btn-primary" disabled={!chosen.length} onClick={() => savePicks(chosen)}>
              {plan.picked.length ? "Save" : "Start my day"} <FiArrowRight aria-hidden="true" />
            </button>
          </div>
          {draft !== null && plan.picked.length ? (
            <button type="button" className="adhd-link adhd-link-center" onClick={() => setDraft(null)}>
              Keep what I had
            </button>
          ) : null}
        </article>
      ) : allDone ? (
        <article className="adhd-card adhd-celebrate">
          <Check drawn />
          <h2>{plan.picked.length === 1 ? "Done." : `All ${plan.picked.length} done.`}</h2>
          <p>That&apos;s a real day. Rest now — or pick more if you&apos;ve still got the spark.</p>
          <div className="adhd-picker-actions">
            <button type="button" className="adhd-btn" onClick={onShowAll}>
              <FiGrid aria-hidden="true" /> Everything
            </button>
            <button type="button" className="adhd-btn adhd-btn-primary" onClick={() => setDraft([])}>
              Pick more <FiArrowRight aria-hidden="true" />
            </button>
          </div>
        </article>
      ) : (
        <NowCard
          key={plan.now.id}
          task={plan.now}
          today={today}
          finishing={finishing === plan.now.id}
          stepLeaving={stepLeaving}
          timerRunning={Boolean(focus?.session)}
          canSwap={plan.next.length > 0}
          onStart={() => justStart(plan.now)}
          onDone={() => finish(plan.now)}
          onStep={(step) => finishStep(plan.now, step)}
          onSwap={() => adhd.setPicks(swapNow(adhd.picks, tasks))}
          onSkip={() => adhd.setPicks(adhd.picks.filter((id) => id !== plan.now.id))}
        />
      )}

      {!picking && (plan.next.length || donePicked.length) ? (
        <section className="adhd-later" aria-label="The rest of today">
          {plan.next.length ? <p className="adhd-eyebrow">Up next</p> : null}
          <ul>
            {plan.next.map((task) => (
              <li key={task.id} className="adhd-later-item">
                <span className="adhd-later-dot" aria-hidden="true" />
                <span>{task.title}</span>
              </li>
            ))}
            {donePicked.map((task) => (
              <li key={task.id} className="adhd-later-item is-done">
                <FiCheck aria-hidden="true" />
                <span>{task.title}</span>
              </li>
            ))}
          </ul>
          {!allDone ? (
            <button type="button" className="adhd-link" onClick={openPicker}>
              Change today&apos;s picks
            </button>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function NowCard({ task, today, finishing, stepLeaving, timerRunning, canSwap, onStart, onDone, onStep, onSwap, onSkip }) {
  const step = currentStep(task);
  const due = gentleDue(task.dueDate, today);
  const stepsDone = task.subtasks.length > 0 && !step;

  return (
    <article className={`adhd-card adhd-now${finishing ? " is-finishing" : ""}`} aria-live="polite">
      <div className="adhd-now-top">
        <p className="adhd-eyebrow">
          <span className="adhd-pulse" aria-hidden="true" /> Now
        </p>
        {due ? <span className="adhd-chip">{due}</span> : null}
      </div>

      <div className="adhd-now-body">
        <Check drawn={finishing} />
        <h2 className="adhd-now-title">{task.title}</h2>
      </div>

      {step ? (
        <div className={`adhd-step${stepLeaving === step.step.id ? " is-leaving" : ""}`} key={step.step.id}>
          <span className="adhd-step-count">
            Step {step.number} of {step.total}
          </span>
          <p className="adhd-step-title">{step.step.title}</p>
          <button type="button" className="adhd-step-done" onClick={() => onStep(step.step)}>
            <FiCheck aria-hidden="true" /> Done, next step
          </button>
        </div>
      ) : stepsDone ? (
        <p className="adhd-step-note">Every step is done. Tick it off.</p>
      ) : null}

      <div className="adhd-now-actions">
        <button type="button" className="adhd-btn adhd-btn-primary adhd-btn-lg" onClick={onStart}>
          <FiPlay aria-hidden="true" /> {timerRunning ? "Back to the timer" : `Just start · ${STARTER_MINUTES} min`}
        </button>
        <button type="button" className={`adhd-btn adhd-btn-lg${stepsDone ? " adhd-btn-primary" : ""}`} onClick={onDone}>
          <FiCheck aria-hidden="true" /> Done
        </button>
      </div>

      <div className="adhd-now-links">
        {canSwap ? (
          <button type="button" onClick={onSwap}>
            <FiRepeat aria-hidden="true" /> Swap
          </button>
        ) : null}
        <button type="button" onClick={onSkip}>
          <FiMoon aria-hidden="true" /> Not today
        </button>
      </div>
    </article>
  );
}

export default AdhdHome;
