import { FiChevronLeft, FiChevronRight, FiPlus, FiTrash2 } from "react-icons/fi";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";

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
  const [newTaskTime, setNewTaskTime] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [dragTaskId, setDragTaskId] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const user = auth.currentUser;

  const formatDateKey = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const fetchPlans = async () => {
    if (!user) return;

    const snapshot = await getDocs(collection(db, "users", user.uid, "planner"));

    const list = snapshot.docs.map((planDoc) => ({
      id: planDoc.id,
      completed: false,
      order: 0,
      ...planDoc.data(),
    }));

    setPlans(list);
  };

  const addTaskToDate = async (date, timeValue = newTaskTime) => {
    if (!newTaskTitle.trim() || !user) return;

    const dateKey = formatDateKey(date);
    const dayPlans = plans.filter((plan) => plan.date === dateKey && !plan.completed);

    await addDoc(collection(db, "users", user.uid, "planner"), {
      title: newTaskTitle.trim(),
      date: dateKey,
      priority: "medium",
      time: timeValue || "",
      completed: false,
      order: dayPlans.length,
      createdAt: new Date(),
    });

    setNewTaskTitle("");
    setNewTaskTime("");
    setActiveInputDate(null);
    fetchPlans();
  };

  const updateTask = async (planId) => {
    if (!editingText.trim() || !user) return;

    await updateDoc(doc(db, "users", user.uid, "planner", planId), {
      title: editingText.trim(),
    });

    setEditingTaskId(null);
    setEditingText("");
    fetchPlans();
  };

  const toggleCompleted = async (plan) => {
    if (!user) return;

    const sameDay = plans.filter((item) => item.date === plan.date && item.id !== plan.id);
    const targetGroup = sameDay.filter((item) => item.completed === !plan.completed);

    await updateDoc(doc(db, "users", user.uid, "planner", plan.id), {
      completed: !plan.completed,
      order: targetGroup.length,
    });

    fetchPlans();
  };

  const deletePlan = async (planId) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "planner", planId));
    fetchPlans();
  };

  useEffect(() => {
    if (user) {
      fetchPlans();
    }
  }, [user]);


  useEffect(() => {
    if (!isTimerRunning) return undefined;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          return 0;
        }

        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const formattedTimer = `${String(Math.floor(timerSeconds / 60)).padStart(2, "0")}:${String(
    timerSeconds % 60
  ).padStart(2, "0")}`;

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
    if (!user) return;
    await Promise.all(
      nextDayPlans.map((plan, index) =>
        updateDoc(doc(db, "users", user.uid, "planner", plan.id), {
          order: index,
          date: dayKey,
        })
      )
    );
  };

  const moveTask = async (targetDate, targetTaskId = null) => {
    if (!dragTaskId || !user) return;

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

  return (
    <section className="board-page">
      <div className="board-header">
        <div>
          <h2 className="page-title">Planner</h2>
          <p className="planner-subtitle">Plan your week by day and keep tasks in clear focus.</p>
        </div>

        <div className="week-nav" role="navigation" aria-label="Week navigation">
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
        <span className="meta-pill">Completed {completedWeekTasks} / {totalWeekTasks} this week</span>

        <div className="planner-timer" role="timer" aria-live="polite">
          <strong>{formattedTimer}</strong>
          <button type="button" onClick={() => setIsTimerRunning((prev) => !prev)}>
            {isTimerRunning ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsTimerRunning(false);
              setTimerSeconds(25 * 60);
            }}
          >
            Reset
          </button>
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
                          setNewTaskTime("");
                        }
                      }}
                    />
                    <input
                      type="time"
                      className="inline-time"
                      value={newTaskTime}
                      onChange={(e) => setNewTaskTime(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addTaskToDate(date, e.currentTarget.value);
                      }}
                    />
                    <button type="button" className="inline-save" onClick={() => addTaskToDate(date)}>
                      Save
                    </button>
                  </div>
                ) : (
                  <button type="button" className="add-task" onClick={() => {
                      setActiveInputDate(dateKey);
                      setNewTaskTitle("");
                      setNewTaskTime("");
                    }}>
                    <FiPlus />
                    Add task
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default Planner;
