import { updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { auth } from "../services/firebase";
import { db } from "../services/firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
} from "firebase/firestore";

function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [filter, setFilter] = useState("all");


  const user = auth.currentUser;

  const fetchTasks = async () => {
    if (!user) return;

    const querySnapshot = await getDocs(
      collection(db, "users", user.uid, "tasks")
    );

    const taskList = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    setTasks(taskList);
  };

const addTask = async () => {
  if (!title) return;

  await addDoc(collection(db, "users", user.uid, "tasks"), {
    title,
    completed: false,
    priority: priority,
    createdAt: new Date(),
  });

  setTitle("");
  setPriority("medium");
  fetchTasks();
};

  const deleteTask = async (id) => {
    await deleteDoc(doc(db, "users", user.uid, "tasks", id));
    fetchTasks();
  };
const toggleTask = async (task) => {
  const taskRef = doc(db, "users", user.uid, "tasks", task.id);

  // 1️⃣ Update task
  await updateDoc(taskRef, {
    completed: !task.completed,
  });

  // 2️⃣ IF task is completed → remove from planner
  if (!task.completed) {
    const plannerSnap = await getDocs(
      collection(db, "users", user.uid, "planner")
    );

    plannerSnap.forEach(async (planDoc) => {
      if (planDoc.data().taskId === task.id) {
        await deleteDoc(
          doc(db, "users", user.uid, "planner", planDoc.id)
        );
      }
    });
  }

  fetchTasks();   // refresh tasks
};


 useEffect(() => {
  if (user) {
    fetchTasks();
  }
}, [user]);

const filteredTasks = tasks.filter((task) => {
  if (filter === "completed") return task.completed;
  if (filter === "pending") return !task.completed;
  return true;
});
  return (
    <div style={{ padding: "20px", paddingBottom: "60px" }}>
      <h2>Tasks</h2>

      <input
        placeholder="New task"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select value={priority} onChange={(e) => setPriority(e.target.value)}>
  <option value="low">Low</option>
  <option value="medium">Medium</option>
  <option value="high">High</option>
  </select>

      <button onClick={addTask}>Add</button>
      <div style={{ marginTop: "10px" }}>
  <button onClick={() => setFilter("all")}>All</button>
  <button onClick={() => setFilter("pending")}>Pending</button>
  <button onClick={() => setFilter("completed")}>Completed</button>
</div>
{filteredTasks.length === 0 ? (
  <p style={{ opacity: 0.6, marginTop: "15px" }}>
    No tasks yet 📝
  </p>
) : (
  <ul>
    {filteredTasks.map((task) => (
      <li
  key={task.id}
  style={{
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 0",
  }}
>

        <small style={{ marginLeft: "8px" }}>
          [{task.priority}]
        </small>

        <span
          style={{
            textDecoration: task.completed ? "line-through" : "none",
            marginLeft: "8px",
          }}
        >
          {task.title}
        </span>
        <button onClick={() => deleteTask(task.id)}>❌</button>
      </li>
    ))}
  </ul>
)}
    </div>
  );
}

export default Tasks;
