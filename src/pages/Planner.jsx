import { FiChevronLeft, FiChevronRight, FiPlus, FiTrash2 } from "react-icons/fi";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";

function Planner() {
  const [plans, setPlans] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeInputDate, setActiveInputDate] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingText, setEditingText] = useState("");

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
      ...planDoc.data(),
    }));

    setPlans(list);
  };

  const addTaskToDate = async (date) => {
    if (!newTaskTitle.trim() || !user) return;

    await addDoc(collection(db, "users", user.uid, "planner"), {
      title: newTaskTitle.trim(),
      date: formatDateKey(date),
      priority: "medium",
      createdAt: new Date(),
    });

    setNewTaskTitle("");
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

  const totalWeekTasks = weekDays.reduce((acc, day) => {
    const dayKey = formatDateKey(day);
    return acc + (plansByDate[dayKey]?.length || 0);
  }, 0);

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
        <span className="meta-pill">Total tasks this week: {totalWeekTasks}</span>
      </div>

      <div className="week-grid-wrap">
        <div className="week-grid">
          {weekDays.map((date) => {
            const dateKey = formatDateKey(date);
            const dayPlans = plansByDate[dateKey] || [];
            const isToday = date.toDateString() === new Date().toDateString();

            return (
              <div key={date.toISOString()} className={`day-column ${isToday ? "today-column" : ""}`}>
                <div className="day-header">
                  <span className="day-name">
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                    {isToday ? <em className="today-pill">Today</em> : null}
                  </span>

                  <span className="day-date">{date.getDate()}</span>
                </div>

                <div className="day-body">
                  {dayPlans.map((plan) => (
                    <div key={plan.id} className={`task-card priority-${plan.priority}`}>
                      {editingTaskId === plan.id ? (
                        <input
                          autoFocus
                          className="inline-input"
                          value={editingText}
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
                        <>
                          <span
                            className="task-title"
                            onClick={() => {
                              setEditingTaskId(plan.id);
                              setEditingText(plan.title);
                            }}
                          >
                            {plan.title}
                          </span>

                          <FiTrash2
                            className="delete-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePlan(plan.id);
                            }}
                          />
                        </>
                      )}
                    </div>
                  ))}

                  {dayPlans.length === 0 && <div className="empty-day">No tasks yet</div>}
                </div>

                {activeInputDate === dateKey ? (
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
                ) : (
                  <button type="button" className="add-task" onClick={() => setActiveInputDate(dateKey)}>
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
