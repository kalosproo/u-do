import { useEffect, useState } from "react";
import { auth } from "../services/firebase";
import { db } from "../services/firebase";
import { deleteDoc, doc } from "firebase/firestore";
import {
  collection,
  addDoc,
  getDocs,
} from "firebase/firestore";

function Planner() {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [plans, setPlans] = useState([]);
  const [priority, setPriority] = useState("medium");

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

return (
  <div className="main-content">
  <div className="board-page">
    <div className="board-header">
      <h2 className="page-title">Planner</h2>

      <div className="week-nav">
        <button>{"<"}</button>
        <span>Week of March 3</span>
        <button>{">"}</button>
      </div>
    </div>

    <div className="week-grid">
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
        <div key={day} className="day-column">
          <div className="day-header">
            <span className="day-name">{day}</span>
            <span className="day-date">03</span>
          </div>

          <div className="day-body">
            <div className="task-card">Sample Task</div>
          </div>

          <div className="add-task">+ Add Task</div>
        </div>
      ))}
    </div>
  </div>
  </div>
);
}

export default Planner;