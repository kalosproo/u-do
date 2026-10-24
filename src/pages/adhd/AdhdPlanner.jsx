import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { Confetti } from "../../components/adhd/AdhdBits";
import { AddBar, AdhdPage, Chips, Sheet, Tick } from "../../components/adhd/AdhdUI";
import { useAuth } from "../../hooks/useAuth";
import { createPlan, deletePlan, fetchPlans, persistPlanOrder, setPlanCompleted } from "../../services/planner";
import { dueFor } from "../../utils/adhd";

const DAYS = [
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
];

/**
 * The planner in ADHD mode: today or tomorrow, nothing further out. A plan
 * is ticked when it's done and stays on the list, crossed out, so the day
 * shows what it held.
 */
function AdhdPlanner() {
  const { user } = useAuth();
  const [plans, setPlans] = useState(null);
  const [day, setDay] = useState("today");
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState("");
  const [party, setParty] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setPlans(await fetchPlans(user.uid));
    } catch {
      setPlans((current) => current ?? []);
      setError("Couldn't load your plan.");
    }
  }, [user]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const key = dueFor(day);
  const list = useMemo(
    () => (plans || []).filter((plan) => plan.date === key).sort((a, b) => Number(a.completed) - Number(b.completed) || (a.order || 0) - (b.order || 0)),
    [plans, key]
  );
  const left = list.filter((plan) => !plan.completed).length;
  const selected = list.find((plan) => plan.id === openId) || null;

  const toggle = async (plan) => {
    const completed = !plan.completed;
    if (completed && left === 1) setParty((n) => n + 1);
    setPlans((current) => (current || []).map((item) => (item.id === plan.id ? { ...item, completed } : item)));
    try {
      await setPlanCompleted(user.uid, plan.id, completed, plan.order || 0);
    } catch {
      setError("Couldn't save that.");
      load();
    }
  };

  const add = async (title) => {
    try {
      await createPlan(user.uid, { title, date: key, order: list.length });
      await load();
      return true;
    } catch {
      setError("Couldn't add that.");
      return false;
    }
  };

  const moveTo = async (plan, other) => {
    setOpenId(null);
    const target = dueFor(other);
    const there = (plans || []).filter((item) => item.date === target && item.id !== plan.id);
    setPlans((current) => (current || []).map((item) => (item.id === plan.id ? { ...item, date: target, order: there.length } : item)));
    try {
      await persistPlanOrder(user.uid, target, [...there, plan]);
    } catch {
      setError("Couldn't move that.");
      load();
    }
  };

  const remove = async (plan) => {
    setOpenId(null);
    setPlans((current) => (current || []).filter((item) => item.id !== plan.id));
    try {
      await deletePlan(user.uid, plan.id);
    } catch {
      setError("Couldn't delete that.");
      load();
    }
  };

  const other = day === "today" ? "tomorrow" : "today";

  return (
    <AdhdPage
      eyebrow="Planner"
      title="Your"
      italic="plan."
      sub={plans === null ? " " : list.length ? (left ? `${left} still to go ${day === "today" ? "today" : "tomorrow"}.` : "All of it done.") : "Nothing planned. That's allowed."}
      action={
        <Link to="/planner?full=1" className="adhd-ghost">
          Full view
        </Link>
      }
    >
      <Chips options={DAYS} value={day} onChange={setDay} label="Day" />

      {error ? (
        <p className="adhd-error" role="alert">
          {error}
        </p>
      ) : null}

      {plans === null ? (
        <div className="adhd-skeleton" aria-busy="true" aria-label="Loading plan">
          <span />
          <span />
        </div>
      ) : list.length ? (
        <ul className="adhd-rows adhd-card adhd-rows-card">
          {list.map((plan) => (
            <li key={plan.id} className={`adhd-row${plan.completed ? " is-done" : ""}`}>
              <Tick done={plan.completed} onToggle={() => toggle(plan)} label={plan.completed ? `Not done: ${plan.title}` : `Done: ${plan.title}`} />
              <button type="button" className="adhd-row-main" onClick={() => setOpenId(plan.id)}>
                <span className="adhd-row-title">{plan.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="adhd-card adhd-tasks-add">
        <AddBar placeholder={`Plan something for ${day}`} onAdd={add} />
      </div>

      <Sheet open={Boolean(selected)} onClose={() => setOpenId(null)} label={selected?.title || "Plan"}>
        {selected ? (
          <div className="adhd-task-sheet">
            <h2 className="adhd-sheet-title adhd-sheet-task">{selected.title}</h2>
            <p className="adhd-sheet-meta">{day === "today" ? "Today" : "Tomorrow"}</p>
            <button type="button" className="adhd-btn" onClick={() => moveTo(selected, other)}>
              Move to {other}
            </button>
            <button type="button" className="adhd-link adhd-link-center adhd-danger" onClick={() => remove(selected)}>
              Delete
            </button>
          </div>
        ) : null}
      </Sheet>
      {party ? <Confetti key={party} /> : null}
    </AdhdPage>
  );
}

export default AdhdPlanner;
