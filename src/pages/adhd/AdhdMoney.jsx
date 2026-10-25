import { useCallback, useEffect, useMemo, useState } from "react";

import { AdhdPage, Chips, FullView, Toast } from "../../components/adhd/AdhdUI";
import { useToast } from "../../components/adhd/useToast";
import { useWarm } from "../../components/adhd/useWarm";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../../config/financeCategories";
import { useAuth } from "../../hooks/useAuth";
import { addExpense, fetchExpenses } from "../../services/finance";
import { formatRelativeDay, todayKey } from "../../utils/dateKeys";
import { amountMinorOf, buildExpense, inMonth, isIncome, monthPrefix, totalSpend } from "../../utils/financeReport";
import { formatMoney, readCurrency } from "../../utils/money";

const KINDS = [
  ["expense", "Money out"],
  ["income", "Money in"],
];

/** The categories you use most, so the right one is usually already there. */
const topCategories = (entries, kind) => {
  const base = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const counts = new Map();
  entries
    .filter((entry) => (kind === "income") === isIncome(entry))
    .forEach((entry) => counts.set(entry.category, (counts.get(entry.category) || 0) + 1));
  const used = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name).filter((name) => base.includes(name));
  return [...new Set([...used, ...base])];
};

/**
 * Money in ADHD mode: one number for the month, one way to add, the last few
 * entries. Budgets, charts and exports live in the full view.
 */
function AdhdMoney() {
  const { user } = useAuth();
  const [entries, setEntries] = useWarm(user ? `${user.uid}:money` : "");
  const [kind, setKind] = useState("expense");
  const [amount, setAmount] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [allCategories, setAllCategories] = useState(false);
  const [error, setError] = useState("");
  const [toast, showToast] = useToast(3000);

  const load = useCallback(async () => {
    if (!user) return;
    setEntries(await fetchExpenses(user.uid));
  }, [user, setEntries]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const list = useMemo(() => entries || [], [entries]);
  const month = useMemo(() => inMonth(list, monthPrefix()), [list]);
  const spent = totalSpend(month);
  const categories = useMemo(() => topCategories(list, kind), [list, kind]);
  const picked = categories.includes(category) ? category : categories[0];
  // Four at a time; one picked from the long list keeps its place in the short one.
  const shown = allCategories ? categories : [...new Set([...categories.slice(0, picked && categories.indexOf(picked) > 3 ? 3 : 4), picked])].filter(Boolean);
  const recent = useMemo(
    () => [...list].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, 5),
    [list]
  );
  const monthName = new Date().toLocaleDateString(undefined, { month: "long" });

  const add = async (event) => {
    event.preventDefault();
    if (!user) return;
    let expense;
    try {
      expense = buildExpense({ title: title.trim() || picked, amount, type: kind, category: picked, date: todayKey() });
    } catch (buildError) {
      setError(buildError.message);
      return;
    }
    setError("");
    setAmount("");
    setTitle("");
    setAllCategories(false);
    const { list: next, error: saveError } = await addExpense(user.uid, expense, list);
    setEntries(next);
    showToast(saveError ? "Saved on this phone. It'll sync when you're online." : kind === "income" ? "Added. Nice." : "Added.");
  };

  return (
    <AdhdPage
      title="Money"
      sub={entries === null ? " " : `Spent in ${monthName}`}
      action={<FullView to="/finance?full=1" />}
    >
      <div className="adhd-card adhd-money-total">
        <strong>{entries === null ? "…" : formatMoney(spent)}</strong>
        <small>so far this month</small>
      </div>

      <form className="adhd-card adhd-money-add" onSubmit={add}>
        <Chips options={KINDS} value={kind} onChange={(value) => { setKind(value); setCategory(""); }} label="In or out" size="sm" />
        <label className="adhd-money-amount">
          <span aria-hidden="true">₹</span>
          <input
            value={amount}
            inputMode="decimal"
            placeholder="0"
            aria-label="Amount"
            onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))}
          />
        </label>
        <input className="adhd-quick-input" value={title} maxLength={120} placeholder="What for? (optional)" aria-label="What for?" onChange={(event) => setTitle(event.target.value)} />
        <div className="adhd-pills" role="radiogroup" aria-label="Category">
          {shown.map((name) => (
            <button key={name} type="button" role="radio" aria-checked={picked === name} className={picked === name ? "is-on" : ""} onClick={() => setCategory(name)}>
              {name}
            </button>
          ))}
          {categories.length > 4 ? (
            <button type="button" className="adhd-pills-more" onClick={() => setAllCategories((value) => !value)}>
              {allCategories ? "Fewer" : "More…"}
            </button>
          ) : null}
        </div>
        <button type="submit" className="adhd-btn adhd-btn-primary" disabled={!amount}>
          Add {kind === "income" ? "money in" : "spend"}
        </button>
        {error ? (
          <p className="adhd-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>

      {recent.length ? (
        <section className="adhd-list-block">
          <p className="adhd-eyebrow">Lately</p>
          <ul className="adhd-money-list adhd-card adhd-group">
            {recent.map((entry) => (
              <li key={entry.id}>
                <span>
                  <strong>{entry.title}</strong>
                  <small>
                    {entry.category} · {formatRelativeDay(entry.date) || entry.date}
                  </small>
                </span>
                <b>
                  {isIncome(entry) ? "+" : "−"}
                  {formatMoney(amountMinorOf(entry), readCurrency(entry))}
                </b>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Toast message={toast?.message} />
    </AdhdPage>
  );
}

export default AdhdMoney;
