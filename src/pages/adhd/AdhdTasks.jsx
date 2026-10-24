import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiEdit2, FiPlay, FiX } from "react-icons/fi";

import { AddBar, AdhdPage, Chips, Fold, Sheet, Tick, Toast } from "../../components/adhd/AdhdUI";
import { useToast } from "../../components/adhd/useToast";
import { useAuth } from "../../hooks/useAuth";
import { useFocus } from "../../hooks/useFocus";
import { createTask, deleteTask, fetchTasks, setSubtasks, setTaskStatus, updateTask } from "../../services/tasks";
import { TASKS_CHANGED, WHEN, dueFor, gentleDue, groupTasks } from "../../utils/adhd";
import { formatRelativeDay, todayKey } from "../../utils/dateKeys";
import { isRepeating } from "../../utils/recurrence";
import { STARTER_MINUTES } from "../../utils/focusTimer";
import { addSubtask, removeSubtask, subtaskProgress, toggleSubtask } from "../../utils/subtasks";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Past this many, older tasks fold away instead of crowding today. */
const EARLIER_INLINE = 3;

const whenOf = (task, today) => {
  if (!task.dueDate) return "someday";
  if (task.dueDate <= today) return "today";
  return task.dueDate === dueFor("tomorrow") ? "tomorrow" : null;
};

/**
 * Tasks in ADHD mode: three places (today, coming up, someday), one box to
 * add, and a big tick. Everything else about a task — steps, when, delete —
 * is in the sheet that opens when you tap it.
 */
function AdhdTasks() {
  const { user } = useAuth();
  const focus = useFocus();
  const today = todayKey();
  const [tasks, setTasks] = useState(null);
  const [when, setWhen] = useState("today");
  const [openId, setOpenId] = useState(null);
  const [leaving, setLeaving] = useState(() => new Set());
  const [error, setError] = useState("");
  const [toast, showToast, hideToast] = useToast(5000);
  const doomed = useRef(null);
  const [doomedId, setDoomedId] = useState(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setTasks(await fetchTasks(user.uid));
    } catch {
      setTasks((current) => current ?? []);
      setError("Couldn't load your tasks. Pull down or come back in a moment.");
    }
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    window.addEventListener(TASKS_CHANGED, load);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(TASKS_CHANGED, load);
    };
  }, [load]);

  // A delete waits for its Undo to run out; leaving the page makes it final.
  const finishDelete = useCallback(() => {
    const pending = doomed.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    doomed.current = null;
    deleteTask(pending.uid, pending.task.id)
      .then(() => setTasks((list) => (list || []).filter((task) => task.id !== pending.task.id)))
      .catch(() => {});
  }, []);
  useEffect(() => finishDelete, [finishDelete]);

  const visible = useMemo(() => (tasks || []).filter((task) => task.id !== doomedId), [tasks, doomedId]);
  const groups = useMemo(() => groupTasks(visible, today), [visible, today]);
  const selected = visible.find((task) => task.id === openId) || null;

  const patch = (id, changes) => setTasks((list) => (list || []).map((task) => (task.id === id ? { ...task, ...changes } : task)));

  const add = async (title) => {
    try {
      await createTask(user.uid, { title, dueDate: dueFor(when), priority: "medium" });
      await load();
      return true;
    } catch {
      setError("Couldn't add that. Try again in a moment.");
      return false;
    }
  };

  const complete = async (task) => {
    setLeaving((set) => new Set(set).add(task.id));
    await wait(560);
    patch(task.id, { status: "done", completed: true, completedAt: new Date().toISOString() });
    setLeaving((set) => {
      const next = new Set(set);
      next.delete(task.id);
      return next;
    });
    showToast("Done. Nice.", () => reopen(task));
    try {
      await setTaskStatus(user.uid, task, "done");
    } catch {
      setError("Couldn't save that tick.");
    }
    load();
  };

  const reopen = async (task) => {
    hideToast();
    patch(task.id, { status: "todo", completed: false, completedAt: null });
    try {
      await setTaskStatus(user.uid, task, "todo");
    } finally {
      load();
    }
  };

  const move = async (task, key) => {
    const dueDate = dueFor(key);
    patch(task.id, { dueDate });
    try {
      await updateTask(user.uid, task.id, { dueDate });
    } catch {
      setError("Couldn't move that.");
      load();
    }
  };

  const changeSteps = async (task, subtasks) => {
    patch(task.id, { subtasks });
    try {
      await setSubtasks(user.uid, task.id, subtasks);
    } catch {
      setError("Couldn't save that step.");
      load();
    }
  };

  const remove = (task) => {
    finishDelete();
    setOpenId(null);
    doomed.current = { task, uid: user.uid, timer: setTimeout(finishDelete, 5000) };
    setDoomedId(task.id);
    showToast("Task deleted.", () => {
      clearTimeout(doomed.current?.timer);
      doomed.current = null;
      hideToast();
      setDoomedId(null);
    });
  };

  const rename = async (task, title) => {
    patch(task.id, { title });
    try {
      await updateTask(user.uid, task.id, { title });
    } catch {
      setError("Couldn't rename that.");
      load();
    }
  };

  // Moves a pile of old tasks to Someday in one go: a clean slate, nothing
  // lost. Repeating tasks stay, because a repeat needs its date.
  const freshStart = async (list) => {
    const moving = list.filter((task) => !isRepeating(task.repeat));
    if (!moving.length) return;
    const before = new Map(moving.map((task) => [task.id, task.dueDate]));
    setTasks((current) => (current || []).map((task) => (before.has(task.id) ? { ...task, dueDate: "" } : task)));
    showToast(`${moving.length} moved to Someday. Fresh start.`, async () => {
      hideToast();
      setTasks((current) => (current || []).map((task) => (before.has(task.id) ? { ...task, dueDate: before.get(task.id) } : task)));
      try {
        await Promise.all([...before].map(([id, dueDate]) => updateTask(user.uid, id, { dueDate })));
      } finally {
        load();
      }
    });
    try {
      await Promise.all(moving.map((task) => updateTask(user.uid, task.id, { dueDate: "" })));
    } catch {
      setError("Couldn't move all of them.");
      load();
    }
  };

  const start = (task) => {
    setOpenId(null);
    if (focus?.session) focus.open();
    else focus?.start(STARTER_MINUTES, task.title, { starter: true, taskId: task.id });
  };

  const row = (task, meta) => {
    const steps = subtaskProgress(task.subtasks);
    const going = leaving.has(task.id);
    const done = task.status === "done";
    const extra = [meta, steps.total ? `${steps.done} of ${steps.total} steps` : ""].filter(Boolean).join(" · ");
    return (
      <li key={task.id} className={`adhd-row${going ? " is-leaving" : ""}${done ? " is-done" : ""}`}>
        <Tick done={done || going} onToggle={() => (done ? reopen(task) : complete(task))} label={done ? `Not done: ${task.title}` : `Finish ${task.title}`} />
        <button type="button" className="adhd-row-main" onClick={() => setOpenId(task.id)}>
          <span className="adhd-row-title">{task.title}</span>
          {extra ? <span className="adhd-row-meta">{extra}</span> : null}
        </button>
      </li>
    );
  };

  // A few old tasks sit with today's; a pile of them folds away on its own.
  const earlier = groups.today.filter((task) => task.dueDate < today);
  const foldEarlier = earlier.length > EARLIER_INLINE;
  const todayRows = foldEarlier ? groups.today.filter((task) => task.dueDate >= today) : groups.today;
  const count = todayRows.length;

  return (
    <AdhdPage
      eyebrow="Tasks"
      title="What's"
      italic="next?"
      sub={tasks === null ? " " : count ? `${count} for today. Start with the top one.` : "Nothing for today. Add one, or enjoy it."}
      action={
        <Link to="/tasks?full=1" className="adhd-ghost">
          Full view
        </Link>
      }
    >
      <div className="adhd-card adhd-tasks-add">
        <AddBar placeholder="What needs doing?" onAdd={add}>
          <Chips options={WHEN} value={when} onChange={setWhen} label="When" size="sm" />
        </AddBar>
      </div>

      {error ? (
        <p className="adhd-error" role="alert">
          {error}
        </p>
      ) : null}

      {tasks === null ? (
        <div className="adhd-skeleton" aria-busy="true" aria-label="Loading tasks">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <section className="adhd-list-block">
            <p className="adhd-eyebrow">Today</p>
            {todayRows.length ? (
              <ul className="adhd-rows">{todayRows.map((task) => row(task, task.dueDate < today ? gentleDue(task.dueDate, today) : ""))}</ul>
            ) : (
              <p className="adhd-empty">Clear. Add something above, or pull one from below.</p>
            )}
          </section>

          {foldEarlier ? (
            <Fold title="From earlier" count={earlier.length}>
              <div className="adhd-fresh">
                <p>These have waited a while. No guilt — move them out of the way and start fresh.</p>
                <button type="button" className="adhd-btn adhd-btn-sm" onClick={() => freshStart(earlier)}>
                  Fresh start: move to Someday
                </button>
              </div>
              <ul className="adhd-rows">{earlier.map((task) => row(task, formatRelativeDay(task.dueDate)))}</ul>
            </Fold>
          ) : null}

          {groups.soon.length ? (
            <Fold title="Coming up" count={groups.soon.length}>
              <ul className="adhd-rows">{groups.soon.map((task) => row(task, formatRelativeDay(task.dueDate)))}</ul>
            </Fold>
          ) : null}

          {groups.someday.length ? (
            <Fold title="Someday" count={groups.someday.length}>
              <ul className="adhd-rows">{groups.someday.map((task) => row(task, ""))}</ul>
            </Fold>
          ) : null}

          {groups.done.length ? (
            <Fold title="Done" count={groups.done.length}>
              <ul className="adhd-rows">{groups.done.map((task) => row(task, ""))}</ul>
            </Fold>
          ) : null}
        </>
      )}

      <Sheet open={Boolean(selected)} onClose={() => setOpenId(null)} label={selected?.title || "Task"}>
        {selected ? (
          <TaskSheet
            task={selected}
            today={today}
            timerRunning={Boolean(focus?.session)}
            onStart={() => start(selected)}
            onMove={(key) => move(selected, key)}
            onSteps={(steps) => changeSteps(selected, steps)}
            onRename={(title) => rename(selected, title)}
            onDelete={() => remove(selected)}
          />
        ) : null}
      </Sheet>

      <Toast message={toast?.message} onUndo={toast?.onUndo} />
    </AdhdPage>
  );
}

function TaskSheet({ task, today, timerRunning, onStart, onMove, onSteps, onRename, onDelete }) {
  const done = task.status === "done";
  const when = whenOf(task, today);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);

  const save = (event) => {
    event.preventDefault();
    const title = draft.trim();
    if (title && title !== task.title) onRename(title);
    setEditing(false);
  };

  return (
    <div className="adhd-task-sheet">
      {editing ? (
        <form className="adhd-rename" onSubmit={save}>
          <input
            className="adhd-quick-input"
            value={draft}
            maxLength={200}
            aria-label="Task name"
            enterKeyHint="done"
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onBlur={save}
          />
        </form>
      ) : (
        <button type="button" className="adhd-sheet-rename" onClick={() => { setDraft(task.title); setEditing(true); }} aria-label={`Rename ${task.title}`}>
          <h2 className="adhd-sheet-title adhd-sheet-task">{task.title}</h2>
          <FiEdit2 aria-hidden="true" />
        </button>
      )}
      <p className="adhd-sheet-meta">
        {done ? "Done" : task.dueDate ? gentleDue(task.dueDate, today) || formatRelativeDay(task.dueDate) : "Someday"}
      </p>

      {!done ? (
        <button type="button" className="adhd-start adhd-start-sheet" onClick={onStart}>
          <span className="adhd-start-icon" aria-hidden="true">
            <FiPlay />
          </span>
          <span className="adhd-start-text">
            <strong>{timerRunning ? "Back to the timer" : "Just start"}</strong>
            <small>{timerRunning ? "Your timer is running" : `${STARTER_MINUTES} minutes. That's all.`}</small>
          </span>
        </button>
      ) : null}

      <div className="adhd-sheet-section">
        <p className="adhd-eyebrow">Steps</p>
        {task.subtasks.length ? (
          <ul className="adhd-steps">
            {task.subtasks.map((step) => (
              <li key={step.id} className={step.done ? "is-done" : ""}>
                <Tick size="sm" done={step.done} onToggle={() => onSteps(toggleSubtask(task.subtasks, step.id))} label={step.done ? `Not done: ${step.title}` : `Done: ${step.title}`} />
                <span>{step.title}</span>
                <button type="button" className="adhd-icon-btn" aria-label={`Remove ${step.title}`} onClick={() => onSteps(removeSubtask(task.subtasks, step.id))}>
                  <FiX />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="adhd-hint">Big task? Break it into tiny steps. The first one should take two minutes.</p>
        )}
        <AddBar placeholder={task.subtasks.length ? "Add another step" : "First tiny step"} onAdd={async (title) => onSteps(addSubtask(task.subtasks, title))} />
      </div>

      {!done ? (
        <div className="adhd-sheet-section">
          <p className="adhd-eyebrow">When</p>
          <Chips options={WHEN} value={when} onChange={onMove} label="When" />
        </div>
      ) : null}

      <button type="button" className="adhd-link adhd-link-center adhd-danger" onClick={onDelete}>
        Delete task
      </button>
    </div>
  );
}

export default AdhdTasks;
