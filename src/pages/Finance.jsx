import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { FiDownload, FiEdit2, FiTrash2 } from "react-icons/fi";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../config/financeCategories";
import { useAuth } from "../hooks/useAuth";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { todayKey } from "../utils/dateKeys";
import {
  buildExpense,
  expensesToCSV,
  inMonth,
  monthPrefix,
  monthlyTotals,
  netBalance,
  sortByDateDesc,
  spendByCategory,
  toAmount,
  totalIncome,
  totalSpend,
} from "../utils/financeReport";
import {
  deleteExpense as deleteExpenseDoc,
  fetchExpenses,
  saveExpense,
  updateExpense,
  writeCachedExpenses,
} from "../services/finance";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

const RANGES = [
  ["month", "This month"],
  ["all", "All time"],
];

const CHART_MODES = [
  ["pie", "Category split"],
  ["bars", "Income vs spend"],
];

const money = (value) => `₹${Math.round(value).toLocaleString("en-IN")}`;

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="chart-tooltip">
      {label ? <p className="chart-tooltip-label">{label}</p> : null}
      {payload.map((row) => (
        <p key={row.name} className="chart-tooltip-row">
          <span className="legend-swatch" style={{ background: row.color || row.payload?.fill }} />
          {row.name}: <strong>{money(row.value)}</strong>
        </p>
      ))}
    </div>
  );
}

function Finance() {
  const { user } = useAuth();
  const requireUser = useAuthGuard();

  const [expenses, setExpenses] = useState([]);
  const [status, setStatus] = useState("");

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("expense");
  const [date, setDate] = useState(todayKey());

  const [range, setRange] = useState("month");
  const [chartMode, setChartMode] = useState("pie");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);

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

  /* ----------------------------------------------------------- derived data */

  const scoped = useMemo(
    () => (range === "month" ? inMonth(expenses, monthPrefix()) : expenses),
    [expenses, range]
  );

  const history = useMemo(() => {
    const term = search.trim().toLowerCase();

    return sortByDateDesc(
      scoped.filter((entry) => {
        if (categoryFilter !== "all" && entry.category !== categoryFilter) return false;
        if (!term) return true;
        return `${entry.title} ${entry.category}`.toLowerCase().includes(term);
      })
    );
  }, [categoryFilter, scoped, search]);

  const categoryRows = useMemo(() => spendByCategory(scoped), [scoped]);
  const monthlySeries = useMemo(() => monthlyTotals(expenses, 6), [expenses]);

  const knownCategories = useMemo(
    () => [...new Set(expenses.map((entry) => entry.category).filter(Boolean))].sort(),
    [expenses]
  );

  const pieData = useMemo(
    () => categoryRows.map((row) => ({ name: row.category, value: row.amount })),
    [categoryRows]
  );

  /* ---------------------------------------------------------------- writes */

  const resetForm = () => {
    setTitle("");
    setAmount("");
    setCategory("");
    setType("expense");
    setDate(todayKey());
  };

  const addExpense = async () => {
    const currentUser = requireUser();
    if (!currentUser) return;

    if (!title.trim() || !amount || !category) {
      setStatus("Add a title, an amount and a category first.");
      return;
    }

    if (toAmount(amount) <= 0) {
      setStatus("Amount has to be more than zero.");
      return;
    }

    const expense = buildExpense({ title, amount, type, category, date });
    const next = [...expenses, expense];

    setExpenses(next);
    writeCachedExpenses(currentUser.uid, next);
    resetForm();

    try {
      await saveExpense(currentUser.uid, expense);
      setStatus("");
    } catch (error) {
      setStatus(error?.message || "Saved on this device, but syncing failed.");
    }
  };

  const saveEdit = async () => {
    const currentUser = requireUser();
    if (!currentUser || !editing) return;

    if (!editing.title.trim() || toAmount(editing.amount) <= 0) {
      setStatus("A transaction needs a title and an amount above zero.");
      return;
    }

    const changes = {
      title: editing.title.trim(),
      amount: toAmount(editing.amount),
      type: editing.type,
      category: editing.category,
      date: editing.date,
    };

    try {
      const patch = await updateExpense(currentUser.uid, editing.id, changes);
      const next = expenses.map((entry) =>
        entry.id === editing.id ? { ...entry, ...patch } : entry
      );

      setExpenses(next);
      writeCachedExpenses(currentUser.uid, next);
      setEditing(null);
      setStatus("");
    } catch (error) {
      setStatus(error?.message || "Couldn't save that change.");
    }
  };

  const removeExpense = async (entry) => {
    const currentUser = requireUser();
    if (!currentUser) return;

    if (!window.confirm(`Delete "${entry.title}"? This can't be undone.`)) return;

    const next = expenses.filter((item) => item.id !== entry.id);
    setExpenses(next);
    writeCachedExpenses(currentUser.uid, next);

    try {
      await deleteExpenseDoc(currentUser.uid, entry.id);
      setStatus("");
    } catch (error) {
      setStatus(error?.message || "Removed here, but the server still has it.");
    }
  };

  const downloadCSV = () => {
    const csv = expensesToCSV(history);

    if (!csv) {
      setStatus("Nothing to export in this view.");
      return;
    }

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `u-do-finance-${todayKey()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /* ------------------------------------------------------------------- view */

  const rangeLabel = range === "month" ? "this month" : "all time";

  return (
    <section className="finance-page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Finance</h1>
          <p className="page-sub">Income, spending and where it goes.</p>
        </div>

        <div className="toolbar">
          {RANGES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`chip ${range === value ? "active" : ""}`}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
          <button type="button" className="btn btn-sm" onClick={downloadCSV}>
            <FiDownload /> Export
          </button>
        </div>
      </header>

      {status ? <p className="page-error">{status}</p> : null}

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">Balance</span>
          <strong className={`stat-value ${netBalance(scoped) < 0 ? "is-negative" : "is-positive"}`}>
            {money(netBalance(scoped))}
          </strong>
          <span className="stat-note">Income minus spending, {rangeLabel}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Income</span>
          <strong className="stat-value">{money(totalIncome(scoped))}</strong>
          <span className="stat-note">{scoped.filter((e) => e.type === "income").length} entries</span>
        </div>
        <div className="stat">
          <span className="stat-label">Spent</span>
          <strong className="stat-value">{money(totalSpend(scoped))}</strong>
          <span className="stat-note">{scoped.filter((e) => e.type !== "income").length} entries</span>
        </div>
        <div className="stat">
          <span className="stat-label">Top category</span>
          <strong className="stat-value">{categoryRows[0]?.category || "—"}</strong>
          <span className="stat-note">
            {categoryRows[0] ? money(categoryRows[0].amount) : "No spending yet"}
          </span>
        </div>
      </div>

      <div className="finance-grid">
        <div className="finance-left">
          <div className="panel add-transaction">
            <h3 className="panel-title">Add transaction</h3>

            <div className="transaction-type-toggle">
              <button
                type="button"
                className={type === "expense" ? "active" : ""}
                onClick={() => {
                  setType("expense");
                  setCategory("");
                }}
              >
                Expense
              </button>
              <button
                type="button"
                className={type === "income" ? "active" : ""}
                onClick={() => {
                  setType("income");
                  setCategory("");
                }}
              >
                Income
              </button>
            </div>

            <label className="field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Groceries" />
            </label>

            <label className="field">
              <span>Amount</span>
              <input
                type="number"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </label>

            <label className="field">
              <span>Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Select category</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>

            <button type="button" className="btn btn-primary" onClick={addExpense}>
              {type === "income" ? "Add income" : "Add expense"}
            </button>
          </div>

          <div className="panel category-breakdown">
            <div className="panel-head">
              <h3 className="panel-title">Spending by category</h3>
              <span className="panel-note">{rangeLabel}</span>
            </div>

            {categoryRows.length ? (
              <ul>
                {categoryRows.map((row, index) => (
                  <li key={row.category} className="category-row">
                    <span className="legend-item">
                      <span
                        className="legend-swatch"
                        style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      {row.category}
                    </span>
                    <span className="num">{money(row.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">No spending recorded {rangeLabel}.</p>
            )}
          </div>
        </div>

        <div className="finance-right">
          <div className="panel chart-card">
            <div className="panel-head">
              <h3 className="panel-title">
                {chartMode === "pie" ? `Category split — ${rangeLabel}` : "Last 6 months"}
              </h3>
              <div className="chart-toggle">
                {CHART_MODES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`chip ${chartMode === value ? "active" : ""}`}
                    onClick={() => setChartMode(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {chartMode === "pie" ? (
              pieData.length ? (
                <div className="chart-shell">
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={95}
                        paddingAngle={2}
                        stroke="var(--surface)"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="chart-legend">
                    {pieData.map((entry, index) => (
                      <span key={entry.name} className="legend-item">
                        <span
                          className="legend-swatch"
                          style={{ background: CHART_COLORS[index % CHART_COLORS.length] }}
                        />
                        {entry.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="empty">No spending to chart {rangeLabel}.</p>
              )
            ) : monthlySeries.some((row) => row.income || row.spend) ? (
              <div className="chart-shell">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={monthlySeries} barGap={4}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} />
                    <YAxis tickLine={false} axisLine={false} width={48} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--accent-soft)" }} />
                    <Legend iconType="circle" iconSize={8} />
                    <Bar dataKey="income" name="Income" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="spend" name="Spend" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="empty">No transactions in the last 6 months.</p>
            )}
          </div>

          <div className="panel recent-transactions">
            <div className="panel-head">
              <h3 className="panel-title">History</h3>
              <span className="panel-note">
                {history.length} of {scoped.length} shown
              </span>
            </div>

            <div className="history-filters">
              <input
                placeholder="Search title or category"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="all">All categories</option>
                {knownCategories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            {history.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Title</th>
                      <th>Category</th>
                      <th className="num">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry) => (
                      <tr key={entry.id}>
                        <td className="text-muted">{entry.date}</td>
                        <td>{entry.title}</td>
                        <td className="text-muted">{entry.category}</td>
                        <td className={`num ${entry.type === "income" ? "amount-in" : "amount-out"}`}>
                          {entry.type === "income" ? "+" : "−"}
                          {money(entry.amount)}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label={`Edit ${entry.title}`}
                              onClick={() => setEditing({ ...entry, amount: String(entry.amount) })}
                            >
                              <FiEdit2 />
                            </button>
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label={`Delete ${entry.title}`}
                              onClick={() => removeExpense(entry)}
                            >
                              <FiTrash2 />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty">
                {scoped.length ? "Nothing matches those filters." : `No transactions ${rangeLabel}.`}
              </p>
            )}
          </div>
        </div>
      </div>

      {editing ? (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Edit transaction">
          <section className="modal-card">
            <div className="modal-head">
              <h3 className="panel-title">Edit transaction</h3>
              <button type="button" className="modal-close" onClick={() => setEditing(null)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="transaction-type-toggle">
              <button
                type="button"
                className={editing.type === "expense" ? "active" : ""}
                onClick={() => setEditing({ ...editing, type: "expense" })}
              >
                Expense
              </button>
              <button
                type="button"
                className={editing.type === "income" ? "active" : ""}
                onClick={() => setEditing({ ...editing, type: "income" })}
              >
                Income
              </button>
            </div>

            <label className="field">
              <span>Title</span>
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </label>

            <label className="field">
              <span>Amount</span>
              <input
                type="number"
                min="0"
                value={editing.amount}
                onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
              />
            </label>

            <label className="field">
              <span>Category</span>
              <select
                value={editing.category}
                onChange={(e) => setEditing({ ...editing, category: e.target.value })}
              >
                {(editing.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={editing.date}
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
              />
            </label>

            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={saveEdit}>
                Save changes
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

export default Finance;
