import { useEffect, useState } from "react";
import { auth, db } from "../services/firebase";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,   // ✅ ADD THIS LINE
  doc,
} from "firebase/firestore";

function Finance() {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [expenses, setExpenses] = useState([]);
  const [type, setType] = useState("expense"); // default


  const user = auth.currentUser;
  const today = new Date().toISOString().split("T")[0];

  // =========================
  // FETCH EXPENSES
  // =========================
  const fetchExpenses = async () => {
    if (!user) return;

    const snapshot = await getDocs(
      collection(db, "users", user.uid, "expenses")
    );

    const list = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    setExpenses(list);
  };

  // =========================
  // ADD EXPENSE
  // (logic reused from old project)
  // =========================
  const addExpense = async () => {
    if (!title || !amount) return;

    await addDoc(collection(db, "users", user.uid, "expenses"), {
  title,
  amount: Number(amount),
  type, // 👈 NEW
  date,
  createdAt: new Date(),
});


    setTitle("");
    setAmount("");
    setType("expense");
    fetchExpenses();
  };

  // =========================
  // DAILY TOTAL
  // (old project reduce logic)
  // =========================
  const getTodayTotal = () => {
  return expenses
    .filter((e) => e.date === today)
    .reduce((sum, e) => {
      if (e.type === "income") return sum + e.amount;
      return sum - e.amount;
    }, 0);
};


  // =========================
  // MONTHLY TOTAL
  // (old project month grouping)
  // =========================
 const getMonthlyTotal = () => {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  return expenses
    .filter((e) => {
      const d = new Date(e.date);
      return (
        d.getMonth() === month &&
        d.getFullYear() === year
      );
    })
    .reduce((sum, e) => {
      if (e.type === "income") return sum + e.amount;
      return sum - e.amount;
    }, 0);
};

  const getMonthlyExpenses = () => {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  return expenses.filter((e) => {
    const d = new Date(e.date);
    return (
      d.getMonth() === month &&
      d.getFullYear() === year
    );
  });
};
const deleteExpense = async (id) => {
  if (!user) return;

  await deleteDoc(
    doc(db, "users", user.uid, "expenses", id)
  );

  fetchExpenses(); // refresh list
};



  useEffect(() => {
    if (user) fetchExpenses();
  }, [user]);

  return (
    <div style={{ padding: "20px", paddingBottom: "60px" }}>
      <h2>Finance</h2>

      {/* SUMMARY (FROM OLD PROJECT LOGIC) */}
      <div style={{ marginBottom: "15px", fontSize: "14px" }}>
        <div
  style={{
    color: getTodayTotal() >= 0 ? "green" : "red",
    fontWeight: "600",
  }}
>
  Today: ₹{getTodayTotal()}
</div>

<div
  style={{
    color: getMonthlyTotal() >= 0 ? "green" : "red",
    fontWeight: "600",
  }}
>
  This Month: ₹{getMonthlyTotal()}
</div>

      </div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
  <button
    onClick={() => setType("expense")}
    style={{
      backgroundColor: type === "expense" ? "#ff4d4f" : "#333",
      color: "white",
      padding: "6px 12px",
      borderRadius: "6px",
      border: "none",
      cursor: "pointer",
    }}
  >
    Expense
  </button>

  <button
    onClick={() => setType("income")}
    style={{
      backgroundColor: type === "income" ? "#22c55e" : "#333",
      color: "white",
      padding: "6px 12px",
      borderRadius: "6px",
      border: "none",
      cursor: "pointer",
    }}
  >
    Income
  </button>
</div>



      {/* ADD EXPENSE */}
      <input
        placeholder="Enter Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <input
        type="number"
        placeholder="Amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />

      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />

      <button onClick={addExpense}>
  {type === "income" ? "Add Income" : "Add Expense"}
</button>


      {/* EXPENSE LIST */}
      <h3 style={{ marginTop: "20px" }}>
  This Month Expenses
</h3>

<ul>
  {getMonthlyExpenses().map((exp) => (
<li
  key={exp.id}
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
  }}
>
  <span>
    {exp.title} ({exp.date})
  </span>

  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
    <span
      style={{
        color: exp.type === "income" ? "green" : "red",
        fontWeight: "600",
      }}
    >
      {exp.type === "income" ? "+" : "-"}₹{exp.amount}
    </span>

    {/* ❌ Delete button */}
    <button
      onClick={() => deleteExpense(exp.id)}
      style={{
        background: "transparent",
        border: "none",
        color: "#ff4d4f",
        fontSize: "16px",
        cursor: "pointer",
      }}
      title="Delete"
    >
      ❌
    </button>
  </div>
</li>



  ))}
</ul>

    </div>
  );
}

export default Finance;
