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

  const taskRef = await addDoc(
    collection(db, "users", user.uid, "tasks"),
    {
      title,
      completed: false,
      priority,
      createdAt: new Date(),
    }
  );

  await addDoc(collection(db, "users", user.uid, "planner"), {
    title,
    date,
    taskId: taskRef.id,
    createdAt: new Date(),
  });

  setTitle("");
  setPriority("medium");
  setDate("");
  fetchPlans();
};

  
const deletePlan = async (plan) => {
  await deleteDoc(
    doc(db, "users", user.uid, "planner", plan.id)
  );

  if (plan.taskId) {
    await deleteDoc(
      doc(db, "users", user.uid, "tasks", plan.taskId)
    );
  }

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
const sortedDates = Object.keys(groupedPlans).sort();
 return (
  <div
    className="page"
    style={{ padding: "20px", paddingBottom: "60px" }}
  >

      <h2>Weekly Planner</h2>

      <input
        placeholder="Plan title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <select value={priority} onChange={(e) => setPriority(e.target.value)}>
  <option value="low">Low</option>
  <option value="medium">Medium</option>
  <option value="high">High</option>
</select>


      <button onClick={addPlan}>Add Plan</button>
{sortedDates.length === 0 && (
  <p style={{ opacity: 0.6, marginTop: "15px" }}>
    No plans added yet 📅
  </p>
)}
{sortedDates.map((date) => (
  <div key={date} style={{ marginTop: "15px" }}>
    <h4
  style={{
    color: date === today ? "#22c55e" : "#aaa",
    marginBottom: "6px",
  }}
>

  📅 {date} {date === today && "(Today)"}
</h4>
    <ul>
      {groupedPlans[date].map((plan) => (
        <li
  key={plan.id}
  style={{
    display: "flex",
    justifyContent: "space-between",
    padding: "4px 0",
  }}
>

          {plan.title}
          <button onClick={() => deletePlan(plan)}>❌</button>
        </li>
      ))}
    </ul>
  </div>
))}
    </div>
  );
}
  
export default Planner;