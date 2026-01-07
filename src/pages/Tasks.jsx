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
      createdAt: new Date(),
    });

    setTitle("");
    fetchTasks();
  };

  const deleteTask = async (id) => {
    await deleteDoc(doc(db, "users", user.uid, "tasks", id));
    fetchTasks();
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  return (
    <div style={{ padding: "20px", paddingBottom: "60px" }}>
      <h2>Tasks</h2>

      <input
        placeholder="New task"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button onClick={addTask}>Add</button>

      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            {task.title}
            <button onClick={() => deleteTask(task.id)}>❌</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Tasks;
