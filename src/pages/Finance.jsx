import { useCallback, useEffect, useMemo, useState } from "react";
import { auth, db } from "../services/firebase";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { collection, addDoc, getDocs, deleteDoc, doc, setDoc } from "firebase/firestore";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../config/financeCategories";
import { useNavigate } from "react-router-dom";

const convertExpensesToCSV = (expenses) => {
  if (!expenses.length) return "";

  const headers = ["Title", "Amount", "Category", "Type", "Date"];
  const rows = expenses.map((exp) => [exp.title, exp.amount, exp.category, exp.type, `"${exp.date}"`]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
};

function Finance() {
  const user = auth.currentUser;
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [expenses, setExpenses] = useState([]);
  const [type, setType] = useState("expense");

  const categories = useMemo(
    () => (type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES),
    [type]
  );

  const saveExpensesToLocal = useCallback((data) => {
    if (!user) return;
    localStorage.setItem(`u_do_expenses_${user.uid}`, JSON.stringify(data));
  }, [user]);

  const getExpensesFromLocal = useCallback(() => {
    if (!user) return [];
    const data = localStorage.getItem(`u_do_expenses_${user.uid}`);
    return data ? JSON.parse(data) : [];
  }, [user]);

  const getLatestExpenses = (firebaseList, localList) => {
    if (firebaseList.length === 0) return localList;
    if (localList.length === 0) return firebaseList;

    const firebaseLatest = Math.max(...firebaseList.map((e) => new Date(e.updatedAt || e.createdAt).getTime()));
    const localLatest = Math.max(...localList.map((e) => new Date(e.updatedAt || e.createdAt).getTime()));

    return firebaseLatest >= localLatest ? firebaseList : localList;
  };

  const fetchExpenses = useCallback(async () => {
    if (!user) return;

    try {
      const snapshot = await getDocs(collection(db, "users", user.uid, "expenses"));
      const firebaseList = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      const localList = getExpensesFromLocal();
      const latestData = getLatestExpenses(firebaseList, localList);

      setExpenses(latestData);
      saveExpensesToLocal(latestData);
    } catch {
      setExpenses(getExpensesFromLocal());
    }
  }, [getExpensesFromLocal, saveExpensesToLocal, user]);

  useEffect(() => {
    if (!user) return;

    const timer = setTimeout(() => {
      fetchExpenses();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchExpenses, user]);

  const addExpense = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");
    if (!title || !amount || !category) {
      alert("Please fill all fields");
      return;
    }

    const newExpense = {
      id: crypto.randomUUID(),
      title,
      amount: Number(amount),
      type,
      category,
      date,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedExpenses = [...expenses, newExpense];
    setExpenses(updatedExpenses);
    saveExpensesToLocal(updatedExpenses);

    try {
      await setDoc(doc(db, "users", currentUser.uid, "expenses", newExpense.id), newExpense);
    } catch {
      await addDoc(collection(db, "users", currentUser.uid, "expenses"), newExpense);
    }

    setTitle("");
    setAmount("");
    setCategory("");
    setType("expense");
  };

  const deleteExpense = async (id) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return navigate("/login");
    if (!id) return;

    const updated = expenses.filter((e) => e.id !== id);
    setExpenses(updated);
    saveExpensesToLocal(updated);

    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "expenses", id));
    } catch {
      // noop: local copy already updated
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

  const getMonthlyExpenses = () => {
    const now = new Date();
    return expenses.filter((e) => {
      const d = new Date(e.date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  };

  const getMonthlyTotal = () =>
    getMonthlyExpenses().reduce((sum, e) => (e.type === "income" ? sum + e.amount : sum - e.amount), 0);

  const getCategorySummary = () => {
    const summary = {};
    expenses
      .filter((e) => e.type === "expense")
      .forEach((item) => {
        if (!item.category) return;
        summary[item.category] = (summary[item.category] || 0) + Number(item.amount);
      });

    return summary;
  };

  const chartData = Object.entries(getCategorySummary()).map(([name, value]) => ({
    category: name,
    amount: value,
  }));

  const getTotalIncome = () => expenses.filter((e) => e.type === "income").reduce((sum, e) => sum + e.amount, 0);
  const getTotalExpenses = () => expenses.filter((e) => e.type === "expense").reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="finance-page">
      <header className="finance-header">
        <div className="page-title-pill">
          <h2>Finance</h2>
        </div>
      </header>

      <section className="finance-summary">
        <div className="summary-card">
          <span>Balance</span>
          <h3>₹{getMonthlyTotal()}</h3>
        </div>

        <div className="summary-card">
          <span>Income</span>
          <h3>₹{getTotalIncome()}</h3>
        </div>

        <div className="summary-card">
          <span>Expenses</span>
          <h3>₹{getTotalExpenses()}</h3>
        </div>
      </section>

      <section className="finance-grid">
        <div className="finance-left">
          <div className="card add-transaction">
            <h3>Add Transaction</h3>
            <div className="transaction-type-toggle">
              <button className={type === "expense" ? "active" : ""} onClick={() => setType("expense")}>Expense</button>
              <button className={type === "income" ? "active" : ""} onClick={() => setType("income")}>Income</button>
            </div>

            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Select Category</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            <input placeholder="Enter title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <input type="number" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

            <button onClick={addExpense}>{type === "income" ? "Add Income" : "Add Expense"}</button>
            <button onClick={downloadFinanceCSV}>Export CSV</button>
          </div>

          <div className="card category-breakdown">
            <h3>Category Breakdown</h3>
            <ul>
              {Object.entries(getCategorySummary()).map(([cat, total]) => (
                <li key={cat} className="category-row">
                  <span>{cat}</span>
                  <span>₹{total}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="finance-right">
          <div className="card recent-transactions">
            <h3>Recent Transactions</h3>
            <ul>
              {getMonthlyExpenses().map((exp) => (
                <li key={exp.id} className="transaction-item">
                  <div>
                    <strong>{exp.title}</strong>
                    <span className="text-muted">{exp.category}</span>
                  </div>

                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <span>₹{exp.amount}</span>
                    <button
                      onClick={() => deleteExpense(exp.id)}
                      style={{ background: "transparent", border: "none", color: "#888", cursor: "pointer" }}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card chart-card">
            <h3>Spending by Category</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="amount" fill="rgba(255,255,255,0.35)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Finance;
