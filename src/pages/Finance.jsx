import { useEffect, useState } from "react";
import { auth, db } from "../services/firebase";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,    
  doc,
  setDoc
} from "firebase/firestore";
const EXPENSE_CATEGORIES = [
  "Food",
  "Travel",
  "Shopping",
  "Rent",
  "Bills",
  "Education",
  "Entertainment",
];

const INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Gift",
  "Other",
];
const convertExpensesToCSV = (expenses) => {
  if (!expenses.length) return "";

  const headers = [
    "Title",
    "Amount",
    "Category",
    "Type",
    "Date",
  ];

  const rows = expenses.map(exp => [
    exp.title,
    exp.amount,
    exp.category,
    exp.type,
    `"${exp.date}"`,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.join(","))
  ].join("\n");

  return csvContent;
};

function Finance() {
 const saveExpensesToLocal = (data) => {
  if (!user) return;
  localStorage.setItem(
    `u_do_expenses_${user.uid}`,
    JSON.stringify(data)
  );
};


const getExpensesFromLocal = () => {
  if (!user) return [];
  const data = localStorage.getItem(
    `u_do_expenses_${user.uid}`
  );
  return data ? JSON.parse(data) : [];
};



  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [customCategories, setCustomCategories] = useState([]);
  const [date, setDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [expenses, setExpenses] = useState([]);
  const [type, setType] = useState("expense");  
   const categories = [
  ...(type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES),
  ...customCategories,
];



  const user = auth.currentUser;
  const today = new Date().toISOString().split("T")[0];

   
  const fetchExpenses = async () => {
  if (!user) return;

  try {
    const snapshot = await getDocs(
      collection(db, "users", user.uid, "expenses")
    );

    const list = snapshot.docs.map(doc => ({
  id: doc.id,        // 🔥 VERY IMPORTANT
  ...doc.data(),
}));

    const localList = getExpensesFromLocal();

    const latestData = getLatestExpenses(
      list,
      localList
    );

    setExpenses(latestData);
    saveExpensesToLocal(latestData);

    // If local data is newer, push to Firebase
    if (latestData === localList) {
      for (const item of localList) {
        if (!item.id) {
          await addDoc(
            collection(db, "users", user.uid, "expenses"),
            item
          );
        }
      }
    }
  } catch (error) {
    console.log("Firebase failed, using local data");
    const localList = getExpensesFromLocal();
    setExpenses(localList);
  }
};
const downloadFinanceCSV = () => {
  const csv = convertExpensesToCSV(expenses);

  if (!csv) {
    alert("No data to export");
    return;
  }

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "u-do-finance.csv";
  link.click();

  URL.revokeObjectURL(url);
};


   
  
  const addExpense = async () => {
  if (!title || !amount || !category) {
    alert("Please fill all fields");
    return;
  }

  const newExpense = {
  id: Date.now().toString(), // 🔥 ADD THIS LINE
  title,
  amount: Number(amount),
  type,
  category,
  date,
  createdAt: new Date(),
  updatedAt: new Date(),
};


  // 🔥 1. UI immediately update
  const updatedExpenses = [...expenses, newExpense];
  setExpenses(updatedExpenses);
  saveExpensesToLocal(updatedExpenses);

  // 🔥 2. Firebase save (background)
  try {
   const expenseRef = doc(
  db,
  "users",
  user.uid,
  "expenses",
  newExpense.id
);

await setDoc(expenseRef, newExpense);
  } catch (err) {
    console.log("Saved locally, Firebase failed");
  }

  // 🔹 reset fields
  setTitle("");
  setAmount("");
  setCategory("");
  setType("expense");
};

 
  const getTodayTotal = () => {
  return expenses
    .filter((e) => e.date === today)
    .reduce((sum, e) => {
      if (e.type === "income") return sum + e.amount;
      return sum - e.amount;
    }, 0);
};


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
  if (!id) return;

  // 🔥 1. UI update immediately
  const updated = expenses.filter((e) => e.id !== id);
  setExpenses(updated);
  saveExpensesToLocal(updated);

  // 🔥 2. Try Firebase delete
  try {
    await deleteDoc(
      doc(db, "users", user.uid, "expenses", id)
    );
  } catch (err) {
    console.log("Firebase delete failed, local updated");
  }
};


const getLatestExpenses = (firebaseList, localList) => {
  if (firebaseList.length === 0) return localList;
  if (localList.length === 0) return firebaseList;

  const firebaseLatest = Math.max(
    ...firebaseList.map((e) => new Date(e.updatedAt).getTime())
  );

  const localLatest = Math.max(
    ...localList.map((e) => new Date(e.updatedAt).getTime())
  );

  return firebaseLatest >= localLatest
    ? firebaseList
    : localList;
};


  useEffect(() => {
    if (user) fetchExpenses();
  }, [user]);
const getCategorySummary = () => {
  const summary = {};

  expenses
  .filter((e) => e.type === "expense")
  .forEach((item) => {

    if (!item.category) return;  
    if (!summary[item.category]) {
      summary[item.category] = 0;
    }
    summary[item.category] += Number(item.amount);
  });
try {
  // firebase fetch logic
} catch (err) {
  console.log("Firebase failed, loading local data");
  setExpenses(getExpensesFromLocal());
}

  return summary;
};
const getCategoryChartData = () => {
  const summary = getCategorySummary();

  return Object.entries(summary).map(
    ([category, amount]) => ({
      category,
      amount,
    })
  );
};

const chartData = getCategoryChartData();

 return (
  <div className="main-content">
    {/* PAGE TITLE */}
    <h2>Finance</h2>

    {/* ================= TOP SUMMARY CARDS ================= */}
    <div className="finance-cards">
      <div className="card">
        <h4>Today</h4>
        <p>₹{getTodayTotal()}</p>
      </div>

      <div className="card">
        <h4>This Month</h4>
        <p>₹{getMonthlyTotal()}</p>
      </div>
    </div>

    {/* ================= ACTION BAR ================= */}
    <div className="card" style={{ marginBottom: "24px" }}>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        <button
          onClick={() => setType("expense")}
          className={type === "expense" ? "active" : ""}
        >
          Expense
        </button>

        <button
          onClick={() => setType("income")}
          className={type === "income" ? "active" : ""}
        >
          Income
        </button>

        <button onClick={downloadFinanceCSV}>
          Export CSV
        </button>
      </div>

      <div style={{ marginTop: "16px" }}>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Select Category</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Add custom category"
          value={customCategory}
          onChange={(e) => setCustomCategory(e.target.value)}
        />

        <button
          onClick={() => {
            if (!customCategory.trim()) return;
            setCustomCategories((prev) => [
              ...new Set([...prev, customCategory.trim()])
            ]);
            setCustomCategory("");
          }}
        >
          Add
        </button>
      </div>
    </div>

    {/* ================= ADD TRANSACTION ================= */}
    <div className="card">
      <h3>Add Transaction</h3>

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
    </div>

    {/* ================= CATEGORY SUMMARY ================= */}
    <div className="card">
      <h3>Expenses by Category</h3>
      <ul>
        {Object.entries(getCategorySummary()).map(([cat, total]) => (
          <li key={cat}>
            {cat} – ₹{total}
          </li>
        ))}
      </ul>
    </div>

    {/* ================= TRANSACTION LIST ================= */}
    <div className="card">
      <h3>Recent Transactions</h3>
      <ul>
        {getMonthlyExpenses().map((exp) => (
          <li key={exp.id} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{exp.title} ({exp.date})</span>

            <span
              style={{
                color: exp.type === "income"
                  ? "var(--text-muted)"
                  : "var(--text)"
              }}
            >
              {exp.type === "income" ? "+" : "-"}₹{exp.amount}
            </span>

            <button onClick={() => deleteExpense(exp.id)}>❌</button>
          </li>
        ))}
      </ul>
    </div>

    {/* ================= CHART ================= */}
    {chartData.length > 0 && (
      <div className="card">
        <h3>Spending by Category</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData}>
            <XAxis dataKey="category" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="amount" fill="rgba(255,255,255,0.35)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    )}
  </div>
)};
export default Finance;
