import { useMemo, useRef, useState } from "react";
import { FiArrowRight, FiCheck, FiGrid, FiMoon, FiPlay, FiPlus, FiRepeat, FiX, FiZap } from "react-icons/fi";

import { useAdhd } from "../../hooks/useAdhd";
import { useAuth } from "../../hooks/useAuth";
import { useFocus } from "../../hooks/useFocus";
import { createTask, normalizeTask, setSubtasks, setTaskStatus } from "../../services/tasks";
import { MAX_PICKS, currentStep, gentleDue, isOpen, pickForMe, rankTasks, swapNow, todayPlan, togglePick } from "../../utils/adhd";
import { playDone } from "../../utils/ambient";
import { formatRelativeDay, todayKey } from "../../utils/dateKeys";
import { celebrate } from "../../utils/feedback";
import { STARTER_MINUTES, formatClock, formatMinutes } from "../../utils/focusTimer";
import { morph, morphName } from "../../utils/morph";
import { toggleSubtask } from "../../utils/subtasks";
import { Burst, Check, DayTrack, HoldButton, ProgressRing } from "./AdhdBits";
import { Tick } from "./AdhdUI";
import { enrichHabit, toggledLogs } from "./habitBits";
import { setHabitLogs } from "../../services/habits";
import { Link } from "react-router-dom";

/** How many open tasks the picker shows before "Show all". */
const SHORT_LIST = 8;
/** Long enough to see the tick land before the next task glides in. */
const FINISH_MS = 760;
const COUNT_WORDS = ["", "one", "two", "three"];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dateLine = () =>
  new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

const salutation = () => {
  const hour = new Date().getHours();
  return hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

/**
 * Home in ADHD mode. One screen, one question at a time: what are today's
 * three, and what's the one thing now? Everything else is a tap away under
 * "Full view", never in the way.
 */
function AdhdHome({ tasks: rawTasks, habits = [], onHabitLogs, onChanged, onPatch, onShowAll }) {
  const { user } = useAuth();
  const adhd = useAdhd();
  const focus = useFocus();
  const today = todayKey();
  const tasks = useMemo(() => rawTasks.map(normalizeTask), [rawTasks]);
  const byId = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
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
  const picking = draft !== null || plan.picked.length === 0;
  const allDone = !picking && !plan.now;
  const donePicked = plan.picked.filter((task) => !isOpen(task));
  // Done first, then the one now, then the rest: the ring fills clockwise.
  const ringStates = [...donePicked.map(() => "done"), ...(plan.now ? ["now"] : []), ...plan.next.map(() => "")];
  const focusedToday = focus?.log?.[today]?.minutes || 0;

  const chosen = draft ?? [];
  const room = MAX_PICKS - chosen.length;

  const openPicker = (initial) => {
    setError("");
    morph(() => setDraft(initial));
  };

  const savePicks = (picks) => {
    // Finished picks stay in the ring while there's room, so progress isn't lost.
    const keep = donePicked.map((task) => task.id).slice(0, Math.max(0, MAX_PICKS - picks.length));
    morph(() => {
      adhd.setPicks([...keep, ...picks]);
      setDraft(null);
      setShowAllTasks(false);
    });
  };

  const choose = (id) => {
    celebrate();
    setDraft(togglePick(chosen, id));
  };

  // Fills the empty slots one by one, so you see it choosing.
  const pickSlowly = () => {
    const extra = pickForMe(tasks, today, chosen).filter((id) => !chosen.includes(id));
    extra.forEach((id, index) =>
      setTimeout(() => {
        celebrate();
        setDraft((current) => (current?.includes(id) ? current : togglePick(current ?? [], id)));
      }, 140 * (index + 1))
    );
  };

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
    playDone();
    await wait(FINISH_MS);
    morph(() => {
      onPatch(task.id, { status: "done", completed: true });
      setFinishing(null);
    });
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
    await wait(340);
    const next = toggleSubtask(task.subtasks, step.id);
    morph(() => {
      onPatch(task.id, { subtasks: next });
      setStepLeaving(null);
    });
    try {
      await setSubtasks(user.uid, task.id, next);
    } catch {
      setError("Couldn't save that step.");
      await onChanged();
    }
  };

  const justStart = (task) => {
    if (focus?.session) focus.open();
    else focus?.start(STARTER_MINUTES, task.title, { starter: true, taskId: task.id });
  };

  const doNow = (id) => morph(() => adhd.setPicks([id, ...adhd.picks.filter((item) => item !== id)]));

  const timer = focus?.session
    ? { label: `${focus.session.phase === "break" ? "Break" : focus.session.paused ? "Paused" : "In focus"} · ${formatClock(focus.remaining)}` }
    : null;

  return (
    <section className="adhd-home" aria-label="Today">
      <header className="adhd-head">
        <div className="adhd-head-top">
          <p className="adhd-date">{dateLine()}</p>
          <button type="button" className="adhd-ghost" onClick={onShowAll}>
            <FiGrid aria-hidden="true" /> Full view
          </button>
        </div>
        <h1 className="adhd-hello">
          {firstName ? (
            <>
              {salutation()},<br />
              <em>{firstName}.</em>
            </>
          ) : (
            `${salutation()}.`
          )}
        </h1>
        <p className="adhd-sub">
          {picking
            ? "What matters today? Pick up to three. Fewer is fine."
            : allDone
              ? "Everything you picked is done."
              : "One thing at a time. That's the whole plan."}
        </p>
      </header>

      <div className={`adhd-status${!picking && plan.picked.length ? "" : " is-single"}`}>
        {!picking && plan.picked.length ? (
          <div className="adhd-tile adhd-tile-ring" role="img" aria-label={`${plan.done} of ${plan.picked.length} done`}>
            <ProgressRing states={ringStates} />
            <span className="adhd-tile-text">
              <strong>
                {plan.done}
                <small>/{plan.picked.length}</small>
              </strong>
              <small>done today</small>
            </span>
          </div>
        ) : null}
        <div className="adhd-tile adhd-tile-day">
          <DayTrack />
        </div>
      </div>

      {error ? (
        <p className="adhd-error" role="alert">
          {error}
        </p>
      ) : null}

      {picking ? (
        <article className="adhd-card adhd-stage adhd-picker">
          <div className="adhd-picker-head">
            <p className="adhd-eyebrow">Your three</p>
            <span className="adhd-count">
              {chosen.length}/{MAX_PICKS}
            </span>
          </div>

          <ol className="adhd-tray">
            {Array.from({ length: MAX_PICKS }, (_, index) => {
              const task = byId.get(chosen[index]);
              return (
                <li key={task ? task.id : `empty-${index}`}>
                  {task ? (
                    <button type="button" className="adhd-slot is-filled" onClick={() => choose(task.id)} aria-label={`Remove ${task.title}`}>
                      <span className="adhd-slot-n">{index + 1}</span>
                      <span className="adhd-slot-title" style={{ viewTransitionName: morphName(task.id) }}>
                        {task.title}
                      </span>
                      <FiX aria-hidden="true" className="adhd-slot-x" />
                    </button>
                  ) : (
                    <span className="adhd-slot">
                      <span className="adhd-slot-n">{index + 1}</span>
                      <span className="adhd-slot-empty">{index === chosen.length ? "Tap a task below" : ""}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {ranked.length ? (
            <>
              <p className="adhd-eyebrow adhd-list-label">Your list</p>
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
                        onClick={() => choose(task.id)}
                      >
                        <span className="adhd-option-mark" aria-hidden="true">
                          {selected ? <FiCheck /> : null}
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
            </>
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
            <button type="button" className="adhd-btn" disabled={!ranked.length || room === 0} onClick={pickSlowly}>
              <FiZap aria-hidden="true" /> Pick for me
            </button>
            <button type="button" className="adhd-btn adhd-btn-primary" disabled={!chosen.length} onClick={() => savePicks(chosen)}>
              {plan.picked.length ? "Save" : "Start my day"} <FiArrowRight aria-hidden="true" />
            </button>
          </div>
          {draft !== null && plan.picked.length ? (
            <button type="button" className="adhd-link adhd-link-center" onClick={() => morph(() => setDraft(null))}>
              Keep what I had
            </button>
          ) : null}
        </article>
      ) : allDone ? (
        <article className="adhd-card adhd-stage adhd-celebrate">
          <div className="adhd-celebrate-mark">
            <Check drawn />
            <Burst />
          </div>
          <h2 className="adhd-serif">
            {plan.picked.length === 1 ? (
              <>
                That one&apos;s <em>done.</em>
              </>
            ) : (
              <>
                All {COUNT_WORDS[plan.picked.length] || plan.picked.length}, <em>done.</em>
              </>
            )}
          </h2>
          <p>That&apos;s a real day. Rest now — or pick more if you&apos;ve still got the spark.</p>
          {focusedToday >= 1 ? <p className="adhd-celebrate-stat">{formatMinutes(focusedToday)} of focus today</p> : null}
          <div className="adhd-picker-actions">
            <button type="button" className="adhd-btn" onClick={onShowAll}>
              <FiGrid aria-hidden="true" /> Full view
            </button>
            <button type="button" className="adhd-btn adhd-btn-primary" onClick={() => openPicker([])}>
              Pick more <FiArrowRight aria-hidden="true" />
            </button>
          </div>
        </article>
      ) : (
        <NowCard
          task={plan.now}
          today={today}
          finishing={finishing === plan.now.id}
          stepLeaving={stepLeaving}
          timer={timer}
          canSwap={plan.next.length > 0}
          onStart={() => justStart(plan.now)}
          onDone={() => finish(plan.now)}
          onStep={(step) => finishStep(plan.now, step)}
          onSwap={() => morph(() => adhd.setPicks(swapNow(adhd.picks, tasks)))}
          onSkip={() => morph(() => adhd.setPicks(adhd.picks.filter((id) => id !== plan.now.id)))}
        />
      )}

      {!picking && (plan.next.length || donePicked.length) ? (
        <section className="adhd-later" aria-label="The rest of today">
          {plan.next.length ? <p className="adhd-eyebrow">Up next</p> : null}
          <ul>
            {plan.next.map((task) => (
              <li key={task.id}>
                <button type="button" className="adhd-later-item" onClick={() => doNow(task.id)} aria-label={`Do ${task.title} now`}>
                  <span className="adhd-later-dot" aria-hidden="true" />
                  <span className="adhd-later-title" style={{ viewTransitionName: morphName(task.id) }}>
                    {task.title}
                  </span>
                  <span className="adhd-later-go" aria-hidden="true">
                    Do now <FiArrowRight />
                  </span>
                </button>
              </li>
            ))}
            {donePicked.map((task) => (
              <li key={task.id} className="adhd-later-item is-done">
                <span className="adhd-later-tick" aria-hidden="true">
                  <FiCheck />
                </span>
                <span className="adhd-later-title" style={{ viewTransitionName: morphName(task.id) }}>
                  {task.title}
                </span>
              </li>
            ))}
          </ul>
          {!allDone ? (
            <button type="button" className="adhd-link" onClick={() => openPicker(plan.picked.filter(isOpen).map((task) => task.id))}>
              Change today&apos;s picks
            </button>
          ) : null}
        </section>
      ) : null}

      <HabitStrip habits={habits} onLogs={onHabitLogs} />
    </section>
  );
}

function NowCard({ task, today, finishing, stepLeaving, timer, canSwap, onStart, onDone, onStep, onSwap, onSkip }) {
  const cardRef = useRef(null);
  const step = currentStep(task);
  const due = gentleDue(task.dueDate, today);
  const stepsDone = task.subtasks.length > 0 && !step;

  // A soft light follows the pointer across the card, on devices with one.
  const light = (event) => {
    if (event.pointerType !== "mouse" || !cardRef.current) return;
    const box = cardRef.current.getBoundingClientRect();
    cardRef.current.style.setProperty("--mx", `${event.clientX - box.left}px`);
    cardRef.current.style.setProperty("--my", `${event.clientY - box.top}px`);
  };

  return (
    <article ref={cardRef} className={`adhd-card adhd-stage adhd-now${finishing ? " is-finishing" : ""}`} onPointerMove={light}>
      <span className="adhd-now-light" aria-hidden="true" />

      <div className="adhd-now-top">
        <p className="adhd-eyebrow">
          <span className="adhd-pulse" aria-hidden="true" /> Now
        </p>
        {due ? <span className="adhd-chip">{due}</span> : null}
      </div>

      <div className="adhd-now-body" aria-live="polite">
        <Check drawn={finishing} />
        <h2 className="adhd-now-title" style={{ viewTransitionName: morphName(task.id) }}>
          {task.title}
        </h2>
      </div>

      {step ? (
        <div className={`adhd-step${stepLeaving === step.step.id ? " is-leaving" : ""}`} key={step.step.id}>
          <div className="adhd-step-rail" aria-hidden="true">
            {task.subtasks.map((item, index) => (
              <span key={item.id} className={item.done ? "is-done" : index === step.number - 1 ? "is-now" : ""} />
            ))}
          </div>
          <span className="adhd-step-count">
            Step {step.number} of {step.total}
          </span>
          <p className="adhd-step-title">{step.step.title}</p>
          <button type="button" className="adhd-step-done" onClick={() => onStep(step.step)}>
            <FiCheck aria-hidden="true" /> Done, next step
          </button>
        </div>
      ) : stepsDone ? (
        <p className="adhd-step-note">Every step is done. Hold to finish it.</p>
      ) : null}

      <div className="adhd-now-actions">
        <button type="button" className={`adhd-start${timer ? " is-live" : ""}`} onClick={onStart}>
          <span className="adhd-start-icon" aria-hidden="true">
            <FiPlay />
          </span>
          <span className="adhd-start-text">
            <strong>{timer ? timer.label : "Just start"}</strong>
            <small>{timer ? "Open the timer" : `${STARTER_MINUTES} minutes. That's all.`}</small>
          </span>
          <span className="adhd-start-glint" aria-hidden="true" />
        </button>
        <div className="adhd-hold-wrap">
          <HoldButton key={task.id} label={`Finish ${task.title}`} onComplete={onDone} className={stepsDone ? "is-ready" : ""}>
            <FiCheck aria-hidden="true" /> Hold to finish
          </HoldButton>
          {finishing ? <Burst /> : null}
        </div>
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

/** Little things today: the habits, as ticks, under the day's tasks. */
function HabitStrip({ habits, onLogs }) {
  const { user } = useAuth();
  const today = useMemo(() => new Date(), []);
  const list = useMemo(() => habits.map((habit) => enrichHabit(habit, today)), [habits, today]);
  if (!list.length) return null;
  const shown = list.slice(0, 4);
  const done = list.filter((habit) => habit.doneNow).length;

  const toggle = (habit) => {
    const logs = toggledLogs(habit, today);
    onLogs?.(habit.id, logs);
    if (user) setHabitLogs(user.uid, habit.id, logs).catch(() => onLogs?.(habit.id, habit.logs || {}));
  };

  return (
    <section className="adhd-strip" aria-label="Little things today">
      <div className="adhd-strip-head">
        <p className="adhd-eyebrow">Little things today</p>
        <span className="adhd-count">
          {done}/{list.length}
        </span>
      </div>
      <ul>
        {shown.map((habit) => (
          <li key={habit.id} className={habit.doneNow ? "is-done" : ""}>
            <Tick size="sm" done={habit.doneNow} onToggle={() => toggle(habit)} label={habit.doneNow ? `Untick ${habit.title}` : `Tick ${habit.title}`} />
            <span>{habit.title}</span>
          </li>
        ))}
      </ul>
      {list.length > shown.length ? (
        <Link to="/habits" className="adhd-link">
          All {list.length} habits
        </Link>
      ) : null}
    </section>
  );
}

export default AdhdHome;
