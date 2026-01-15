import { useEffect, useState } from "react";
import { auth } from "../services/firebase";
import { db } from "../services/firebase";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
} from "firebase/firestore";

function Habits() {
  const [habits, setHabits] = useState([]);
  const [title, setTitle] = useState("");


  const user = auth.currentUser;
  const today = new Date().toISOString().split("T")[0];
  const days = Array.from({ length: 7 }).map((_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - i);
  return d.toISOString().split("T")[0];
}).reverse();


  const fetchHabits = async () => {
    if (!user) return;

    const snapshot = await getDocs(
      collection(db, "users", user.uid, "habits")
    );

    const list = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    }));

    setHabits(list);
  };

  const addHabit = async () => {
    if (!title) return;

    await addDoc(collection(db, "users", user.uid, "habits"), {
  title,
  streak: 0,
  completedDays: {},   // 👈 ADD ONLY THIS
  createdAt: new Date(),
});

    setTitle("");
    fetchHabits();
  };
const toggleHabitForToday = async (habit, day) => {
  if (!user) return;

  const habitRef = doc(db, "users", user.uid, "habits", habit.id);

  const alreadyDone = habit.completedDays?.[day] === true;

  const updatedCompletedDays = {
    ...(habit.completedDays || {}),
    [day]: !alreadyDone,
  };

  const updatedStreak = alreadyDone
    ? Math.max((habit.streak || 0) - 1, 0)
    : (habit.streak || 0) + 1;

  await updateDoc(habitRef, {
    completedDays: updatedCompletedDays,
    streak: updatedStreak,
  });

  fetchHabits();
};


  useEffect(() => {
    if (user) fetchHabits();
  }, [user]);

  return (
    <div style={{ padding: "20px", paddingBottom: "60px" }}>
      <h2>Habits</h2>

      <input
        placeholder="New habit"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <button onClick={addHabit}>Add Habit</button>

      <table>
  <thead>
    <tr>
      <th>Habit</th>
      {days.map((day) => (
        <th key={day}>{day.slice(8)}</th>
      ))}
    </tr>
  </thead>

  <tbody>
    {habits.map((habit) => (
      <tr key={habit.id}>
        <td>
          {habit.title} 🔥{habit.streak}
        </td>

        {days.map((day) => (
          <td key={day}>
            <div
  onClick={() => {
    if (day === today) {
      toggleHabitForToday(habit, day);
    }
  }}
  style={{
    width: "18px",
    height: "18px",
    border: "1px solid #888",
    borderRadius: "4px",
    cursor: day === today ? "pointer" : "not-allowed",
    backgroundColor: habit.completedDays?.[day]
      ? "#22c55e"
      : "transparent",
    color: "white",
    textAlign: "center",
    lineHeight: "18px",
    opacity: day === today ? 1 : 0.4,
  }}
>
  {habit.completedDays?.[day] ? "✓" : ""}
</div>

          </td>
        ))}
      </tr>
    ))}
  </tbody>
</table>

    </div>
  );
}

export default Habits;
