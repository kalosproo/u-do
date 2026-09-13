import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../config/financeCategories";
import { useAuth } from "../hooks/useAuth";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { todayKey } from "../utils/dateKeys";
import {
  deleteExpense as deleteExpenseDoc,
  fetchExpenses,
  saveExpense,
  writeCachedExpenses,
} from "../services/finance";

const convertExpensesToCSV = (expenses) => {
  if (!expenses.length) return "";

  const headers = ["Title", "Amount", "Category", "Type", "Date"];
  const rows = expenses.map((exp) => [exp.title, exp.amount, exp.category, exp.type, `"${exp.date}"`]);

  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
};

function Finance() {
  const { user } = useAuth();
  const requireUser = useAuthGuard();

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(todayKey());
  const [expenses, setExpenses] = useState([]);
  const [type, setType] = useState("expense");
  const [status, setStatus] = useState("");

  const categories = useMemo(
    () => (type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES),
    [type]
  );

  const loadExpenses = useCallback(async () => {
    if (!user) return;
    setExpenses(await fetchExpenses(user.uid));
  }, [user]);

  // Deferred a tick: loading sets state, and React warns about doing that
  // synchronously inside an effect. Every page in the app loads this way.
  useEffect(() => {
    const timer = setTimeout(loadExpenses, 0);
    return () => clearTimeout(timer);
  }, [loadExpenses]);

  const addExpense = async () => {
    const currentUser = requireUser();
    if (!currentUser) return;
    if (!title || !amount || !category) {
      setStatus("Please fill all fields.");
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
    writeCachedExpenses(currentUser.uid, updatedExpenses);

    try {
      await saveExpense(currentUser.uid, newExpense);
      setStatus("");
    } catch (saveError) {
      setStatus(saveError?.message || "Saved locally, but syncing failed.");
    }

    setTitle("");
    setAmount("");
    setCategory("");
    setType("expense");
  };

  const deleteExpense = async (id) => {
    const currentUser = requireUser();
    if (!currentUser || !id) return;

    const updated = expenses.filter((e) => e.id !== id);
    setExpenses(updated);
    writeCachedExpenses(currentUser.uid, updated);

    await deleteExpenseDoc(currentUser.uid, id);
  };

  const downloadFinanceCSV = () => {
    const csv = convertExpensesToCSV(expenses);
    if (!csv) {
      setStatus("No data to export.");
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
        {status ? <p className="page-error">{status}</p> : null}
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

            <button className="button-primary" onClick={addExpense}>{type === "income" ? "Add Income" : "Add Expense"}</button>
            <button className="button-secondary" onClick={downloadFinanceCSV}>Export CSV</button>
          </div>

          <div className="card category-breakdown">
            <h3>Category Breakdown</h3>
            {Object.keys(getCategorySummary()).length ? <ul>
              {Object.entries(getCategorySummary()).map(([cat, total]) => (
                <li key={cat} className="category-row">
                  <span>{cat}</span>
                  <span>₹{total}</span>
                </li>
              ))}
            </ul> : <p className="finance-empty-state">No spending data yet.</p>}
          </div>
        </div>

        <div className="finance-right">
          <div className="card recent-transactions">
            <h3>Recent Transactions</h3>
            {getMonthlyExpenses().length ? <ul>
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
            </ul> : <p className="finance-empty-state">No transactions yet — add one to see it here.</p>}
          </div>

          <div className="card chart-card">
            <h3>Spending by Category</h3>
            {chartData.length ? <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <XAxis dataKey="category" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="amount" fill="rgba(255,255,255,0.35)" />
              </BarChart>
            </ResponsiveContainer> : <p className="finance-empty-state">No spending data yet.</p>}
          </div>
        </div>
      </section>
    </div>
  );
}

export default Finance;
