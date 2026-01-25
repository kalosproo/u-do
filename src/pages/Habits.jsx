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
  const [habitType, setHabitType] = useState("strict");
  const [reminderTime, setReminderTime] = useState("");
  // 🟢 Save habits to localStorage
const saveHabitsToLocal = (habits) => {
  localStorage.setItem("u_do_habits", JSON.stringify(habits));
};

// 🟢 Get habits from localStorage
const getHabitsFromLocal = () => {
  const data = localStorage.getItem("u_do_habits");
  return data ? JSON.parse(data) : [];
};




  const user = auth.currentUser;
  const today = new Date().toISOString().split("T")[0];
  const isReminderMissed = (habit) => {
  if (!habit.reminderTime) return false;

  const now = new Date();

  const [h, m] = habit.reminderTime.split(":");
  const reminder = new Date();
  reminder.setHours(h, m, 0, 0);

  const doneToday = habit.completedDays?.[today];

  return now > reminder && !doneToday;
};

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
const getHabitPercentage = (habit) => {
  if (!habit.durationDays) return null;

  const completedCount = Object.keys(habit.completedDays || {}).length;
  return Math.round((completedCount / habit.durationDays) * 100);
};

  const addHabit = async () => {
    if (!title.trim()) {
  alert("Habit title required");
  return;
}

    if (!title) return;

 await addDoc(collection(db, "users", user.uid, "habits"), {
  title,
  type: habitType,            
  reminderTime: reminderTime || null,
  streak: 0,
  completedDays: {},
  createdAt: new Date(),
  updatedAt: new Date(),
});






    setTitle("");
    setReminderTime("");
    setHabitType("strict");
    fetchHabits();
  };
const toggleHabitForToday = async (habit, day) => {
  if (!user) return;

  const habitRef = doc(db, "users", user.uid, "habits", habit.id);

  const completedDays = habit.completedDays || {};
  const alreadyDone = completedDays[day] === true;

  let newCompletedDays = { ...completedDays };
  let newStreak = habit.streak || 0;

  if (alreadyDone) {
    
    delete newCompletedDays[day];
    newStreak = Math.max(newStreak - 1, 0);
  } else {
     
    newCompletedDays[day] = true;

    if (habit.type === "strict") {
      const yesterday = new Date(day);
      yesterday.setDate(yesterday.getDate() - 1);
      const yKey = yesterday.toISOString().split("T")[0];

      newStreak = completedDays[yKey] ? newStreak + 1 : 1;
    } else {
      
      newStreak = Object.keys(newCompletedDays).length;
    }
  }

  await updateDoc(habitRef, {
    completedDays: newCompletedDays,
    streak: newStreak,
    updatedAt: new Date(),
  });

  fetchHabits();
};


const getCompletionPercentage = (habit) => {
  if (!habit.createdAt) return 0;

  const createdDate = habit.createdAt.toDate
    ? habit.createdAt.toDate()
    : new Date(habit.createdAt);

  const todayDate = new Date(today);

   
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

  fetchHabits();  
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
const isReminderMissed = (habit) => {
  if (!habit.reminderTime) return false;

  const now = new Date();
  const [h, m] = habit.reminderTime.split(":");
  const reminder = new Date();
  reminder.setHours(h, m, 0, 0);

  const doneToday = habit.completedDays?.[today];

  return now > reminder && !doneToday;
};

  return {
    totalHabits,
    completedToday,
    percentage,
  };
};

 useEffect(() => {
  const fetchHabits = async () => {
    try {
      const snapshot = await getDocs(
        collection(db, "users", user.uid, "habits")
      );

      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setHabits(list);
      saveHabitsToLocal(list); // 🔥 save to local
    } catch (error) {
      console.log("Firestore failed, loading habits from local");
      const localHabits = getHabitsFromLocal();
      setHabits(localHabits);
    }
  };

  fetchHabits();
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
<input
  type="time"
  value={reminderTime}
  onChange={(e) => setReminderTime(e.target.value)}
  style={{ marginTop: "6px" }}
/>


<div style={{ margin: "8px 0" }}>
  <button
  onClick={() => setHabitType("strict")}
  style={{
    background: habitType === "strict" ? "#ff5555" : "#333",
    color: "white",
    marginRight: "6px",
  }}
>
  Strict
</button>


  <button
    onClick={() => setHabitType("flexible")}
    style={{
      background: habitType === "flexible" ? "#22c55e" : "#333",
      color: "white",
  
    }}
  >
    Flexible
  </button>
</div>

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
      <tr
  key={habit.id}
  style={{
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    height: "44px",
    backgroundColor: isReminderMissed(habit)
      ? "rgba(255, 0, 0, 0.08)"
      : "transparent",
  }}
  
>
  
       <td
  style={{
    display: "flex",
    alignItems: "center",
    gap: "10px",
  }}
>
  
  {/* Habit title + streak + reminder */}
<div style={{ display: "flex", flexDirection: "column" }}>
  <span>
    {habit.title} 🔥{habit.streak}
  </span>

  {habit.reminderTime && (
  <span
    style={{
      fontSize: "12px",
      marginTop: "2px",
      color: isReminderMissed(habit) ? "#ff4d4f" : "#aaa",
      fontWeight: isReminderMissed(habit) ? "600" : "400",
    }}
  >
    ⏰ {habit.reminderTime}
    {isReminderMissed(habit) && " • Pending"}
  </span>
)}
</div>

  {/* Habit type badge (read-only) */}
  <span
    style={{
      padding: "2px 6px",
      fontSize: "12px",
      borderRadius: "6px",
      backgroundColor:
        habit.type === "strict" ? "#ff4d4f" : "#22c55e",
      color: "white",
      cursor: "default",
    }}
  >
    {habit.type === "strict" ? "Strict" : "Flexible"}
  </span>



  <span style={{ fontSize: "12px", opacity: 0.7 }}>
   {habit.durationDays && (
  <span
    style={{
      marginLeft: "8px",
      fontSize: "12px",
      opacity: 0.7,
    }}
  >
    {Math.round(
      (Object.keys(habit.completedDays || {}).length /
        habit.durationDays) *
        100
    )}
    %
  </span>
)}

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
