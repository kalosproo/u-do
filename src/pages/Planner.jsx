import { FiTrash2 } from "react-icons/fi";
import { useEffect, useState } from "react";
import { auth } from "../services/firebase";
import { db } from "../services/firebase";
import { deleteDoc, doc } from "firebase/firestore";
import {
  collection,
  addDoc,
  getDocs,
} from "firebase/firestore";
import { updateDoc } from "firebase/firestore";

function Planner() {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [plans, setPlans] = useState([]);
  const [priority, setPriority] = useState("medium");
  const [currentDate, setCurrentDate] = useState(new Date());const [activeInputDate, setActiveInputDate] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingText, setEditingText] = useState("");

  const user = auth.currentUser;

  const fetchPlans = async () => {
    if (!user) return;

    const snapshot = await getDocs(
      collection(db, "users", user.uid, "planner")
    );

    const list = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    setPlans(list);
  };
  const formatDateKey = (date) => {
  return new Date(date).toISOString().split("T")[0];
};
const addTaskToDate = async (date) => {
  if (!newTaskTitle.trim()) return;

  await addDoc(
    collection(db, "users", user.uid, "planner"),
    {
      title: newTaskTitle,
      date: formatDateKey(date),
      priority: "medium",
      createdAt: new Date(),
    }
  );

  setNewTaskTitle("");
  setActiveInputDate(null);
  fetchPlans();
};
const updateTask = async (plan) => {
  if (!editingText.trim()) return;

  await updateDoc(
    doc(db, "users", user.uid, "planner", plan.id),
    {
      title: editingText,
    }
  );

  setEditingTaskId(null);
  setEditingText("");
  fetchPlans();
};
const addPlan = async () => {
  if (!title || !date) return;

  await addDoc(
    collection(db, "users", user.uid, "planner"),
    {
      title,
      date,
      priority,
      createdAt: new Date(),
    }
  );

  setTitle("");
  setPriority("medium");
  setDate("");
  fetchPlans();
};

  
const deletePlan = async (plan) => {
  await deleteDoc(
    doc(db, "users", user.uid, "planner", plan.id)
  );

  fetchPlans();
};

useEffect(() => {
    if (user) {
      fetchPlans();
    }
  }, [user]);
const today = new Date().toISOString().split("T")[0];
const groupedPlans = plans.reduce((acc, plan) => {
  if (!acc[plan.date]) {
    acc[plan.date] = [];
  }
  acc[plan.date].push(plan);
  return acc;
}, {});
const sortedDates = Object.keys(groupedPlans).sort(
  (a, b) => new Date(a) - new Date(b)
);
const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun, 1 = Mon ...
  const diff = day === 0 ? -6 : 1 - day; // make Monday start
  d.setDate(d.getDate() + diff);
  return d;
};

const startOfWeek = getStartOfWeek(currentDate);

const weekDays = Array.from({ length: 7 }).map((_, i) => {
  const date = new Date(startOfWeek);
  date.setDate(startOfWeek.getDate() + i);
  return date;
});
return (
  <div className="main-content">
  <div className="board-page">
    <div className="board-header">
      <h2 className="page-title">Planner</h2>

      <div className="week-nav">
        <button onClick={() =>
  setCurrentDate(prev => {
  const newDate = new Date(prev);
  newDate.setDate(prev.getDate() - 7);
  return newDate;
})
}>
  {"<"}
</button>
        <span>
  Week of {startOfWeek.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}
</span>
       <button onClick={() =>
  setCurrentDate(new Date(currentDate.setDate(currentDate.getDate() + 7)))
}>
  {">"}
</button>
      </div>
    </div>

<div className="week-grid">
  {weekDays.map((date) => {
    const isToday =
      date.toDateString() === new Date().toDateString();
      
    return (
      <div
  key={date.toISOString()}
  className={`day-column ${isToday ? "today-column" : ""}`}>
        <div className="day-header">
          <span className="day-name">
            {date.toLocaleDateString("en-US", { weekday: "short" })}
          </span>

          <span className="day-date">
            {date.getDate()}
          </span>
        </div>

        <div className="day-body">
  {plans
    .filter((plan) => plan.date === formatDateKey(date))
    .map((plan) => (
      <div
  key={plan.id}
  className={`task-card priority-${plan.priority}`}
>

  {editingTaskId === plan.id ? (
    <input
      autoFocus
      className="inline-input"
      value={editingText}
      onChange={(e) => setEditingText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") updateTask(plan);
        if (e.key === "Escape") {
          setEditingTaskId(null);
          setEditingText("");
        }
      }}
    />
  ) : (
    <>
      <span
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
          deletePlan(plan);
        }}
      />
    </>
  )}

</div>
    ))}
    {plans.filter((plan) => plan.date === formatDateKey(date)).length === 0 && (
  <div className="empty-day">No tasks</div>
)}
</div>

        {activeInputDate === formatDateKey(date) ? (
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
  <div
    className="add-task"
    onClick={() => setActiveInputDate(formatDateKey(date))}
  >
    + Add Task
  </div>
)}
      </div>
    );
  })}
</div>
  </div>
  </div>
);
}

export default Planner;