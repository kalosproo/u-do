import { FiChevronLeft, FiChevronRight, FiPlus, FiTrash2 } from "react-icons/fi";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../services/firebase";
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";
import { generateWeeklyPlan } from "../services/autoPlanner";

function sortPlans(list) {
  return [...list].sort((a, b) => {
    if (Boolean(a.completed) !== Boolean(b.completed)) {
      return a.completed ? 1 : -1;
    }

    const orderA = Number.isFinite(a.order) ? a.order : 9999;
    const orderB = Number.isFinite(b.order) ? b.order : 9999;
    if (orderA !== orderB) return orderA - orderB;

    return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  });
}

function PlannerTaskCard({
  plan,
  isDragging,
  editingTaskId,
  editingText,
  setEditingText,
  setEditingTaskId,
  updateTask,
  deletePlan,
  toggleCompleted,
  onDragStart,
  onDropOnTask,
  onDragOver,
}) {
  return (
    <div
      title={plan.title}
      className={`task-card priority-${plan.priority} ${plan.completed ? "task-completed" : ""} ${
        isDragging ? "task-dragging" : ""
      }`}
      draggable={!plan.completed}
      onDragStart={() => onDragStart(plan.id)}
      onDragOver={onDragOver}
      onDrop={() => onDropOnTask(plan.id)}
    >
      <div className="task-main">
        <input
          type="checkbox"
          checked={Boolean(plan.completed)}
          className="task-checkbox"
          onDragStart={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleCompleted(plan)}
        />

        {editingTaskId === plan.id ? (
          <input
            autoFocus
            className="inline-input"
            value={editingText}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setEditingText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") updateTask(plan.id);
              if (e.key === "Escape") {
                setEditingTaskId(null);
                setEditingText("");
              }
            }}
          />
        ) : (
          <div
            className="task-title-wrap"
            onClick={(e) => {
              e.stopPropagation();
              setEditingTaskId(plan.id);
              setEditingText(plan.title);
            }}
          >
            <span className="task-title">{plan.title}</span>
            {plan.time ? <small className="task-time">{plan.time}</small> : null}
          </div>
        )}
      </div>

      <FiTrash2
        className="delete-icon"
        onClick={(e) => {
          e.stopPropagation();
          deletePlan(plan.id);
        }}
      />
    </div>
  );
}

function Planner() {
  const [plans, setPlans] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeInputDate, setActiveInputDate] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [dragTaskId, setDragTaskId] = useState(null);
  const [autoPlanOpen, setAutoPlanOpen] = useState(false);
  const [autoPlanLoading, setAutoPlanLoading] = useState(false);
  const [autoPlanApplying, setAutoPlanApplying] = useState(false);
  const [autoPlanSummary, setAutoPlanSummary] = useState("");
  const [autoPlanItems, setAutoPlanItems] = useState([]);
  const [autoPlanStatus, setAutoPlanStatus] = useState("");

  const user = auth.currentUser;
  const navigate = useNavigate();
  const requireUser = () => {
    const currentUser = auth.currentUser;
    if (!currentUser) navigate("/login");
    return currentUser;
  };

  const formatDateKey = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const fetchPlans = useCallback(async () => {
    if (!user) return;

    const snapshot = await getDocs(collection(db, "users", user.uid, "planner"));

    const list = snapshot.docs.map((planDoc) => ({
      id: planDoc.id,
      completed: false,
      order: 0,
      ...planDoc.data(),
    }));

    setPlans(list);
  }, [user]);

  const addTaskToDate = async (date) => {
    const currentUser = requireUser();
    if (!currentUser || !newTaskTitle.trim()) return;

    const dateKey = formatDateKey(date);
    const dayPlans = plans.filter((plan) => plan.date === dateKey && !plan.completed);

    await addDoc(collection(db, "users", currentUser.uid, "planner"), {
      title: newTaskTitle.trim(),
      date: dateKey,
      priority: "medium",
      completed: false,
      order: dayPlans.length,
      createdAt: new Date(),
    });

    setNewTaskTitle("");
    setActiveInputDate(null);
    fetchPlans();
  };

  const updateTask = async (planId) => {
    const currentUser = requireUser();
    if (!currentUser || !editingText.trim()) return;

    await updateDoc(doc(db, "users", currentUser.uid, "planner", planId), {
      title: editingText.trim(),
    });

    setEditingTaskId(null);
    setEditingText("");
    fetchPlans();
  };

  const toggleCompleted = async (plan) => {
    const currentUser = requireUser();
    if (!currentUser) return;

    const sameDay = plans.filter((item) => item.date === plan.date && item.id !== plan.id);
    const targetGroup = sameDay.filter((item) => item.completed === !plan.completed);

    await updateDoc(doc(db, "users", currentUser.uid, "planner", plan.id), {
      completed: !plan.completed,
      order: targetGroup.length,
    });

    fetchPlans();
  };

  const deletePlan = async (planId) => {
    const currentUser = requireUser();
    if (!currentUser) return;
    await deleteDoc(doc(db, "users", currentUser.uid, "planner", planId));
    fetchPlans();
  };

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      fetchPlans();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchPlans, user]);


  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  };

  const startOfWeek = getStartOfWeek(currentDate);

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }).map((_, i) => {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        return date;
      }),
    [startOfWeek]
  );

  const plansByDate = useMemo(
    () =>
      plans.reduce((acc, plan) => {
        if (!acc[plan.date]) {
          acc[plan.date] = [];
        }
        acc[plan.date].push(plan);
        return acc;
      }, {}),
    [plans]
  );

  const sortedPlansByDate = useMemo(() => {
    const sorted = {};
    Object.keys(plansByDate).forEach((dateKey) => {
      sorted[dateKey] = sortPlans(plansByDate[dateKey]);
    });
    return sorted;
  }, [plansByDate]);

  const totalWeekTasks = weekDays.reduce((acc, day) => {
    const dayKey = formatDateKey(day);
    return acc + (sortedPlansByDate[dayKey]?.length || 0);
  }, 0);

  const completedWeekTasks = weekDays.reduce((acc, day) => {
    const dayKey = formatDateKey(day);
    const completed = (sortedPlansByDate[dayKey] || []).filter((plan) => plan.completed).length;
    return acc + completed;
  }, 0);

  const findPlanById = (id) => plans.find((item) => item.id === id);

  const moveAndPersistOrder = async (dayKey, nextDayPlans) => {
    const currentUser = requireUser();
    if (!currentUser) return;
    await Promise.all(
      nextDayPlans.map((plan, index) =>
        updateDoc(doc(db, "users", currentUser.uid, "planner", plan.id), {
          order: index,
          date: dayKey,
        })
      )
    );
  };

  const moveTask = async (targetDate, targetTaskId = null) => {
    const currentUser = requireUser();
    if (!dragTaskId || !currentUser) return;

    const activePlan = findPlanById(dragTaskId);
    if (!activePlan || activePlan.completed) return;

    const fromDate = activePlan.date;
    const fromPlans = sortPlans((plansByDate[fromDate] || []).filter((p) => !p.completed));
    const toPlans = sortPlans((plansByDate[targetDate] || []).filter((p) => !p.completed));

    if (fromDate === targetDate) {
      const oldIndex = fromPlans.findIndex((p) => p.id === dragTaskId);
      const overIndex = targetTaskId ? toPlans.findIndex((p) => p.id === targetTaskId) : toPlans.length - 1;
      if (oldIndex < 0 || overIndex < 0 || oldIndex === overIndex) {
        setDragTaskId(null);
        return;
      }

      const reordered = [...fromPlans];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(overIndex, 0, moved);

      await moveAndPersistOrder(fromDate, reordered);
      setDragTaskId(null);
      fetchPlans();
      return;
    }

    const sourceWithoutActive = fromPlans.filter((p) => p.id !== dragTaskId);
    const moving = { ...activePlan, date: targetDate };
    const targetIndex = targetTaskId ? Math.max(toPlans.findIndex((p) => p.id === targetTaskId), 0) : toPlans.length;

    const targetNext = [...toPlans];
    targetNext.splice(targetIndex, 0, moving);

    await Promise.all([
      moveAndPersistOrder(fromDate, sourceWithoutActive),
      moveAndPersistOrder(targetDate, targetNext),
    ]);

    setDragTaskId(null);
    fetchPlans();
  };

  const openAutoPlanner = async () => {
    if (!auth.currentUser) return navigate("/login");
    setAutoPlanOpen(true); setAutoPlanLoading(true); setAutoPlanStatus(""); setAutoPlanSummary(""); setAutoPlanItems([]);
    const weekDates = weekDays.map((date) => ({ date: formatDateKey(date), weekday: date.toLocaleDateString("en-US", { weekday: "short" }) }));
    const scheduledByDate = Object.fromEntries(weekDates.map(({ date }) => [date, (sortedPlansByDate[date] || []).map((plan) => plan.title)]));
    try {
      const snapshot = await getDocs(collection(db, "users", user.uid, "tasks"));
      const pendingTasks = snapshot.docs.map((item) => item.data()).filter((task) => task.status !== "done" && !task.completed).map((task) => ({ title: task.title, dueDate: task.dueDate || "", priority: task.priority || "medium" }));
      const result = await generateWeeklyPlan({ weekDates, pendingTasks, scheduledByDate });
      setAutoPlanSummary(result.summary); setAutoPlanItems(result.assignments.map((item, index) => ({ ...item, id: `${item.date}-${index}` }))); setAutoPlanStatus(result.error || "");
    } catch (error) { setAutoPlanStatus(error?.message || "Couldn't load your tasks. Please try again."); }
    finally { setAutoPlanLoading(false); }
  };
  const closeAutoPlanner = () => { setAutoPlanOpen(false); setAutoPlanItems([]); setAutoPlanSummary(""); setAutoPlanStatus(""); };
  const startAddingTask = (dateKey) => {
    if (!auth.currentUser) return navigate("/login");
    setActiveInputDate(dateKey);
    setNewTaskTitle("");
  };
  const applyAutoPlan = async () => {
    const currentUser = requireUser();
    if (!currentUser || !autoPlanItems.length) return;
    setAutoPlanApplying(true); setAutoPlanStatus("");
    try {
      const countByDate = {};
      autoPlanItems.forEach(({ date }) => { countByDate[date] ??= (sortedPlansByDate[date] || []).length; });
      await Promise.all(autoPlanItems.map(({ title, date, priority }) => addDoc(collection(db, "users", currentUser.uid, "planner"), { title, date, priority, completed: false, order: countByDate[date]++, createdAt: new Date() })));
      await fetchPlans(); closeAutoPlanner();
    } catch (error) { setAutoPlanStatus(error?.message || "Couldn't add these to your planner. Please try again."); }
    finally { setAutoPlanApplying(false); }
  };

  return (
    <section className="board-page">
      <div className="board-header">
        <div className="planner-title-wrap">
          <div className="page-title-pill">
            <h2 className="page-title">Planner</h2>
          </div>
          <p className="planner-subtitle">Plan your week by day and keep tasks in clear focus.</p>
        </div>

        <div className="week-nav" role="navigation" aria-label="Week navigation">
          <button type="button" className="autoplan-trigger" onClick={openAutoPlanner}>AI Auto-Plan Week</button>
          <button
            type="button"
            aria-label="Previous week"
            onClick={() =>
              setCurrentDate((prev) => {
                const newDate = new Date(prev);
                newDate.setDate(newDate.getDate() - 7);
                return newDate;
              })
            }
          >
            <FiChevronLeft />
          </button>
          <span>
            Week of{" "}
            {startOfWeek.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
          <button
            type="button"
            aria-label="Next week"
            onClick={() =>
              setCurrentDate((prev) => {
                const newDate = new Date(prev);
                newDate.setDate(newDate.getDate() + 7);
                return newDate;
              })
            }
          >
            <FiChevronRight />
          </button>
        </div>
      </div>

      <div className="planner-meta">
        <div className="planner-progress-card" aria-label={`Completed ${completedWeekTasks} of ${totalWeekTasks} this week`}>
          <span className="meta-pill">Completed {completedWeekTasks} / {totalWeekTasks} this week</span>
          <div className="planner-progress-track">
            <span style={{ width: `${totalWeekTasks ? Math.round((completedWeekTasks / totalWeekTasks) * 100) : 0}%` }} />
          </div>
        </div>
      </div>

      <div className="week-grid-wrap">
        <div className="week-grid">
          {weekDays.map((date) => {
            const dateKey = formatDateKey(date);
            const dayPlans = sortedPlansByDate[dateKey] || [];
            const activePlans = dayPlans.filter((plan) => !plan.completed);
            const completedPlans = dayPlans.filter((plan) => plan.completed);
            const isToday = date.toDateString() === new Date().toDateString();

            return (
              <div
                key={date.toISOString()}
                className={`day-column ${isToday ? "today-column" : ""}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => moveTask(dateKey)}
              >
                <div className="day-header">
                  <span className="day-name">
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                    {isToday ? <em className="today-pill">Today</em> : null}
                    {dayPlans.length > 0 ? <em className="task-dot">{dayPlans.length}</em> : null}
                  </span>

                  <span className="day-date">{date.getDate()}</span>
                </div>

                <div className="day-body">
                  {activePlans.map((plan) => (
                    <PlannerTaskCard
                      key={plan.id}
                      plan={plan}
                      isDragging={dragTaskId === plan.id}
                      editingTaskId={editingTaskId}
                      editingText={editingText}
                      setEditingText={setEditingText}
                      setEditingTaskId={setEditingTaskId}
                      updateTask={updateTask}
                      deletePlan={deletePlan}
                      toggleCompleted={toggleCompleted}
                      onDragStart={setDragTaskId}
                      onDropOnTask={(targetTaskId) => moveTask(dateKey, targetTaskId)}
                      onDragOver={(e) => e.preventDefault()}
                    />
                  ))}

                  {completedPlans.length > 0 && (
                    <div className="completed-block">
                      <p className="completed-label">Completed</p>
                      {completedPlans.map((plan) => (
                        <PlannerTaskCard
                          key={plan.id}
                          plan={plan}
                          isDragging={false}
                          editingTaskId={editingTaskId}
                          editingText={editingText}
                          setEditingText={setEditingText}
                          setEditingTaskId={setEditingTaskId}
                          updateTask={updateTask}
                          deletePlan={deletePlan}
                          toggleCompleted={toggleCompleted}
                          onDragStart={setDragTaskId}
                          onDropOnTask={(targetTaskId) => moveTask(dateKey, targetTaskId)}
                          onDragOver={(e) => e.preventDefault()}
                        />
                      ))}
                    </div>
                  )}

                  {dayPlans.length === 0 && <div className="empty-day">No tasks yet</div>}
                </div>

                {activeInputDate === dateKey ? (
                  <div className="inline-add-row">
                    <input
                      autoFocus
                      className="inline-input"
                      placeholder="New task..."
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addTaskToDate(date);
                        if (e.key === "Escape") {
                          setActiveInputDate(null);
                          setNewTaskTitle("");
                        }
                      }}
                    />
                    <button type="button" className="inline-save" onClick={() => addTaskToDate(date)}>
                      Save
                    </button>
                  </div>
                ) : (
                  <button type="button" className="add-task" onClick={() => startAddingTask(dateKey)}>
                    <FiPlus />
                    Add task
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {autoPlanOpen && <div className="autoplan-overlay" role="dialog" aria-modal="true" aria-label="AI Auto-Plan Week"><section className="autoplan-popup"><div className="autoplan-header"><h4>AI Auto-Plan Week</h4><button type="button" className="autoplan-close" onClick={closeAutoPlanner} aria-label="Close">✕</button></div>
        {autoPlanLoading ? <p className="autoplan-muted">Reading your tasks and this week's planner...</p> : <>{autoPlanSummary && <p className="autoplan-summary">{autoPlanSummary}</p>}{autoPlanStatus && <p className="autoplan-status">{autoPlanStatus}</p>}{autoPlanItems.length ? <div className="autoplan-list">{autoPlanItems.map((item) => <div key={item.id} className="autoplan-item"><div><strong>{item.title}</strong><small>{item.date} · {item.priority}</small></div><button type="button" className="autoplan-remove" onClick={() => setAutoPlanItems((items) => items.filter((current) => current.id !== item.id))} aria-label={`Remove ${item.title}`}>✕</button></div>)}</div> : !autoPlanStatus && <p className="autoplan-muted">Nothing new to schedule right now.</p>}{autoPlanItems.length ? <div className="autoplan-cta-row"><button type="button" className="autoplan-primary" onClick={applyAutoPlan} disabled={autoPlanApplying}>{autoPlanApplying ? "Adding..." : `Add ${autoPlanItems.length} to Planner`}</button><button type="button" className="autoplan-secondary" onClick={closeAutoPlanner} disabled={autoPlanApplying}>Cancel</button></div> : null}</>}</section></div>}
    </section>
  );
}

export default Planner;
