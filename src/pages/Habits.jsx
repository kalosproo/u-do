import { useCallback, useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from "firebase/firestore";

const getDateKey = (date) => date.toISOString().split("T")[0];

const getRecentDays = (count = 7) =>
  Array.from({ length: count })
    .map((_, index) => {
      const d = new Date();
      d.setDate(d.getDate() - (count - 1 - index));
      return getDateKey(d);
    });

const normalizeHabit = (raw) => ({
  ...raw,
  type: raw.type || "strict",
  streak: Number(raw.streak || 0),
  completedDays: raw.completedDays || {},
  reminderTime: raw.reminderTime || "",
});

function Habits() {
  const [habits, setHabits] = useState([]);
  const [title, setTitle] = useState("");
  const [habitType, setHabitType] = useState("strict");
  const [reminderTime, setReminderTime] = useState("");

  const user = auth.currentUser;
  const today = getDateKey(new Date());
  const days = useMemo(() => getRecentDays(7), []);

  const isReminderMissed = useCallback(
    (habit) => {
      if (!habit.reminderTime || habit.completedDays?.[today]) return false;

      const now = new Date();
      const [h, m] = habit.reminderTime.split(":").map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return false;

      const reminder = new Date();
      reminder.setHours(h, m, 0, 0);
      return now > reminder;
    },
    [today]
  );

  const fetchHabits = useCallback(async () => {
    if (!user) return;

    try {
      const snapshot = await getDocs(collection(db, "users", user.uid, "habits"));
      const list = snapshot.docs.map((item) => normalizeHabit({ id: item.id, ...item.data() }));
      setHabits(list);
      localStorage.setItem("u_do_habits", JSON.stringify(list));
    } catch {
      const local = localStorage.getItem("u_do_habits");
      setHabits(local ? JSON.parse(local) : []);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const timer = setTimeout(() => {
      fetchHabits();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchHabits, user]);

  const addHabit = async () => {
    if (!title.trim() || !user) return;

    await addDoc(collection(db, "users", user.uid, "habits"), {
      title: title.trim(),
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
    if (!user || day !== today) return;

    const completedDays = { ...(habit.completedDays || {}) };
    const alreadyDone = completedDays[day] === true;
    let newStreak = Number(habit.streak || 0);

    if (alreadyDone) {
      delete completedDays[day];
      newStreak = Math.max(newStreak - 1, 0);
    } else {
      completedDays[day] = true;

      if (habit.type === "strict") {
        const yesterday = new Date(day);
        yesterday.setDate(yesterday.getDate() - 1);
        const yKey = getDateKey(yesterday);
        newStreak = habit.completedDays?.[yKey] ? newStreak + 1 : 1;
      } else {
        newStreak = Object.keys(completedDays).length;
      }
    }

    await updateDoc(doc(db, "users", user.uid, "habits", habit.id), {
      completedDays,
      streak: newStreak,
      updatedAt: new Date(),
    });

    fetchHabits();
  };

  const deleteHabitItem = async (habitId) => {
    if (!user) return;
    await deleteDoc(doc(db, "users", user.uid, "habits", habitId));
    fetchHabits();
  };

  const todayStats = useMemo(() => {
    const totalHabits = habits.length;
    const completedToday = habits.filter((habit) => habit.completedDays?.[today]).length;
    const percentage = totalHabits === 0 ? 0 : Math.round((completedToday / totalHabits) * 100);
    return { totalHabits, completedToday, percentage };
  }, [habits, today]);

  return (
    <div className="page" style={{ padding: "20px", paddingBottom: "60px" }}>
      <h2>Habits</h2>

      <div style={{ marginBottom: "15px", fontSize: "14px", opacity: 0.85 }}>
        <span>Total: {todayStats.totalHabits}</span> | <span>Done today: {todayStats.completedToday}</span> |{" "}
        <span>{todayStats.percentage}% today</span>
      </div>

      <input placeholder="New habit" value={title} onChange={(e) => setTitle(e.target.value)} />
      <input
        type="time"
        value={reminderTime}
        onChange={(e) => setReminderTime(e.target.value)}
        style={{ marginTop: "6px" }}
      />

      <div style={{ margin: "8px 0" }}>
        <button
          onClick={() => setHabitType("strict")}
          style={{ background: habitType === "strict" ? "#ff5555" : "#333", color: "white", marginRight: "6px" }}
        >
          Strict
        </button>

        <button onClick={() => setHabitType("flexible")} style={{ background: habitType === "flexible" ? "#22c55e" : "#333", color: "white" }}>
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
                backgroundColor: isReminderMissed(habit) ? "rgba(255, 0, 0, 0.08)" : "transparent",
              }}
            >
              <td style={{ display: "flex", alignItems: "center", gap: "10px" }}>
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

                <span
                  style={{
                    padding: "2px 6px",
                    fontSize: "12px",
                    borderRadius: "6px",
                    backgroundColor: habit.type === "strict" ? "#ff4d4f" : "#22c55e",
                    color: "white",
                    cursor: "default",
                  }}
                >
                  {habit.type === "strict" ? "Strict" : "Flexible"}
                </span>

                <button
                  onClick={() => deleteHabitItem(habit.id)}
                  style={{ cursor: "pointer", background: "transparent", border: "none", opacity: 0.7 }}
                  title="Delete habit"
                >
                  ❌
                </button>
              </td>

              {days.map((day) => (
                <td key={day}>
                  <div
                    onClick={() => toggleHabitForToday(habit, day)}
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
