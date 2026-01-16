import { useEffect, useState } from "react";
import { auth } from "../services/firebase";
import { db } from "../services/firebase";
import {
  collection,
  addDoc,
  deleteDoc,
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

  const completedDays = habit.completedDays || {};
  const alreadyDoneToday = completedDays[day] === true;

  // yesterday date
  const yesterday = new Date(day);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().split("T")[0];

  let newStreak = habit.streak || 0;

  if (alreadyDoneToday) {
    // ❌ untick today
    delete completedDays[day];
    newStreak = Math.max(newStreak - 1, 0);
  } else {
    // ✅ tick today
    if (!completedDays[yesterdayKey]) {
      // missed yesterday → reset streak
      newStreak = 1;
    } else {
      // continued streak
      newStreak = newStreak + 1;
    }

    completedDays[day] = true;
  }

  await updateDoc(habitRef, {
    completedDays,
    streak: newStreak,
  });

  fetchHabits();
};
const getCompletionPercentage = (habit) => {
  if (!habit.createdAt) return 0;

  const createdDate = habit.createdAt.toDate
    ? habit.createdAt.toDate()
    : new Date(habit.createdAt);

  const todayDate = new Date(today);

  // total days since habit creation (inclusive)
  const diffTime = todayDate - createdDate;
  const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

  const completedCount = habit.completedDays
    ? Object.keys(habit.completedDays).length
    : 0;

  if (totalDays <= 0) return 0;

  return Math.round((completedCount / totalDays) * 100);
};

const deleteHabit = async (habitId) => {
  if (!user) return;

  const ok = window.confirm("Delete this habit?");
  if (!ok) return;

  await deleteDoc(
    doc(db, "users", user.uid, "habits", habitId)
  );

  fetchHabits(); // refresh UI
};
const getTodayStats = () => {
  const totalHabits = habits.length;

  const completedToday = habits.filter(
    (habit) => habit.completedDays?.[today]
  ).length;

  const percentage =
    totalHabits === 0
      ? 0
      : Math.round((completedToday / totalHabits) * 100);

  return {
    totalHabits,
    completedToday,
    percentage,
  };
};

 useEffect(() => {
    if (user) fetchHabits();
  }, [user]);

  return (
    <div style={{ padding: "20px", paddingBottom: "60px" }}>
      <h2>Habits</h2>
      <div
  style={{
    marginBottom: "15px",
    fontSize: "14px",
    opacity: 0.85,
  }}
>
  <span>Total: {getTodayStats().totalHabits}</span>{" "}
  | <span>Done today: {getTodayStats().completedToday}</span>{" "}
  | <span>{getTodayStats().percentage}% today</span>
</div>


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
        <td
  style={{
    display: "flex",
    alignItems: "center",
    gap: "10px",
  }}
>
  <span style={{ fontWeight: 500 }}>
    {habit.title}
  </span>

  <span style={{ opacity: 0.8 }}>
    🔥 {habit.streak}
  </span>

  <span style={{ fontSize: "12px", opacity: 0.7 }}>
    {getCompletionPercentage(habit)}%
  </span>

  <button
    onClick={() => deleteHabit(habit.id)}
    style={{
      cursor: "pointer",
      background: "transparent",
      border: "none",
      opacity: 0.7,
    }}
    title="Delete habit"
  >
    ❌
  </button>
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
  backgroundColor: habit.completedDays?.[day] ? "#22c55e" : "transparent",
  color: "white",
  textAlign: "center",
  lineHeight: "18px",
  opacity: day === today ? 1 : 0.4,
  transition: "transform 0.1s ease",
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
