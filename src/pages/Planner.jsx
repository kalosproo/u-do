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

  return (
    <div style={{ padding: "20px", paddingBottom: "60px" }}>
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

      <ul>
        {plans.map((plan) => (
                <li key={plan.id}>
        {plan.title} – {plan.date}
        <button onClick={() => deletePlan(plan)}>❌</button>
      </li>
        ))}
      </ul>
    </div>
  );
}
  
export default Planner;