import { useEffect, useState } from "react";
import { auth } from "../services/firebase";
import { db } from "../services/firebase";
import { collection, getDocs } from "firebase/firestore";

function Home() {
  const [total, setTotal] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [todayPlans, setTodayPlans] = useState(0);

  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const taskSnap = await getDocs(
        collection(db, "users", user.uid, "tasks")
      );
      const tasks = taskSnap.docs.map(d => d.data());
      setTotal(tasks.length);
      setCompleted(tasks.filter(t => t.completed).length);

      const today = new Date().toISOString().split("T")[0];
      const planSnap = await getDocs(
        collection(db, "users", user.uid, "planner")
      );
      const plans = planSnap.docs.map(d => d.data());
      setTodayPlans(plans.filter(p => p.date === today).length);
    };

    fetchData();
  }, [user]);

  return (
    <div className="home-page">
      <h1 className="page-title">Dashboard</h1>

      <div className="dashboard-grid">
        <div className="dashboard-left">
          <div className="card large">
            <h3>Today Summary</h3>
            <ul>
              <li>Total Tasks: {total}</li>
              <li>Completed: {completed}</li>
              <li>Pending: {total - completed}</li>
              <li>Today's Plans: {todayPlans}</li>
            </ul>
          </div>

          <div className="card large">
            <h3>Expenses</h3>
            <p>Expense charts will appear here.</p>
          </div>
        </div>

        <div className="dashboard-right">
          <div className="card">
            <h3>Finance</h3>
            <p>Today: ₹ —</p>
            <p>This Month: ₹ —</p>
          </div>

          <div className="card">
            <h3>Habits</h3>
            <p>Habit streak preview will appear here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
