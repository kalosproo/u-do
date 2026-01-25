import { useEffect, useState } from "react";
import { auth } from "../services/firebase";
import { db } from "../services/firebase";
import { collection, getDocs } from "firebase/firestore";

function Home() {
  const [theme, setTheme] = useState(
  localStorage.getItem("u_do_theme") || "dark"
);
useEffect(() => {
  document.body.className = theme;
  localStorage.setItem("u_do_theme", theme);
}, [theme]);

  const [total, setTotal] = useState(0);
  const [completed, setCompleted] = useState(0);
   const [todayPlans, setTodayPlans] = useState(0);

  const user = auth.currentUser;

  const fetchTaskSummary = async () => {
    if (!user) return;

    const snapshot = await getDocs(
      collection(db, "users", user.uid, "tasks")
    );

    const tasks = snapshot.docs.map((d) => d.data());

    setTotal(tasks.length);
    setCompleted(tasks.filter((t) => t.completed).length);
  };
  const fetchTodayPlans = async () => {
  if (!user) return;

  const today = new Date().toISOString().split("T")[0];

  const snapshot = await getDocs(
    collection(db, "users", user.uid, "planner")
  );

  const plans = snapshot.docs.map((doc) => doc.data());

  const todayCount = plans.filter(
    (plan) => plan.date === today
  ).length;

  setTodayPlans(todayCount);
};

  useEffect(() => {
  if (user) {
    fetchTaskSummary();
    fetchTodayPlans();
  }
}, [user]);


  return (
    <div style={{ padding: "20px", paddingBottom: "60px" }}>
      
    <button
  onClick={() =>
    setTheme(theme === "dark" ? "light" : "dark")
  }
  style={{
  position: "absolute",
  top: "12px",
  right: "12px",
  padding: "6px 12px",
  borderRadius: "20px",
  border: "none",
  cursor: "pointer",
}}

>
  {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
</button>

<div
  style={{
    background: "rgba(255,255,255,0.05)",
    padding: "16px",
    borderRadius: "12px",
  }}
>

      <h2>Today Summary</h2>
      <p>📝 Total Tasks: {total}</p>
      <p>✅ Completed: {completed}</p>
      <p>⏳ Pending: {total - completed}</p>
      <p>📅 Today’s Plans: {todayPlans}</p>
    </div>
    </div>
  );
}

export default Home;
