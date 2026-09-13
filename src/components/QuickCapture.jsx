import { useState } from "react";
import { createPortal } from "react-dom";
import { FiCheck, FiX, FiZap } from "react-icons/fi";
import { getDocs, updateDoc } from "firebase/firestore";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../config/financeCategories";
import { parseQuickCapture } from "../services/quickCapture";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { todayKey } from "../utils/dateKeys";
import { habitDoc, habitsCollection } from "../services/paths";
import { createHabit } from "../services/habits";
import { createTask } from "../services/tasks";
import { readCachedExpenses, saveExpense, writeCachedExpenses } from "../services/finance";

const TYPE_OPTIONS = ["expense", "income", "task", "habit"];

async function saveEntry(entry, user) {
  if (["expense", "income"].includes(entry.type)) {
    const expense = {
      id: crypto.randomUUID(),
      title: entry.title,
      amount: Number(entry.amount) || 0,
      type: entry.type,
      category: entry.category,
      date: entry.date || todayKey(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveExpense(user.uid, expense);
    writeCachedExpenses(user.uid, [...readCachedExpenses(user.uid), expense]);
    return "Finance";
  }

  if (entry.type === "task") {
    await createTask(user.uid, {
      title: entry.title,
      dueDate: entry.date || "",
      priority: entry.priority || "medium",
    });
    return "Tasks";
  }

  // Capturing a habit you already track updates it rather than duplicating it.
  const habits = await getDocs(habitsCollection(user.uid));
  const existing = habits.docs.find(
    (item) => (item.data()?.title || "").trim().toLowerCase() === entry.title.trim().toLowerCase()
  );

  if (existing) {
    await updateDoc(habitDoc(user.uid, existing.id), { frequency: entry.frequency || "daily" });
  } else {
    await createHabit(user.uid, { title: entry.title, frequency: entry.frequency || "daily" });
  }

  return "Habits";
}

export default function QuickCapture() {
  const requireUser = useAuthGuard();
  const [isOpen, setIsOpen] = useState(false); const [note, setNote] = useState(""); const [entry, setEntry] = useState(null); const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false); const [status, setStatus] = useState("");
  const reset = () => { setNote(""); setEntry(null); setStatus(""); };
  const close = () => { setIsOpen(false); reset(); };
  const capture = async () => { if (!note.trim()) return; setLoading(true); setStatus(""); const parsed = await parseQuickCapture(note); setEntry(parsed.entry); setStatus(parsed.error || ""); setLoading(false); };
  const confirm = async () => { const user = requireUser(); if (!user || !entry) return; setSaving(true); setStatus(""); try { const destination = await saveEntry(entry, user); setStatus(`Saved to ${destination}${entry.type === "income" ? " (income)" : ""}.`); setEntry(null); setNote(""); } catch (error) { setStatus(error?.message || "Couldn't save that. Please try again."); } finally { setSaving(false); } };
  const money = ["expense", "income"].includes(entry?.type);
  return <>
    <button type="button" className="quickcap-fab" onClick={() => setIsOpen(true)} aria-label="Quick capture" title="Open Quick Capture"><FiZap /></button>
    {isOpen && createPortal(<div className="quickcap-overlay" role="dialog" aria-modal="true" aria-label="Quick capture"><section className="quickcap-popup"><div className="quickcap-header"><h4>Quick Capture</h4><button type="button" className="quickcap-close" onClick={close} aria-label="Close"><FiX /></button></div><p className="quickcap-muted">Type it like you'd say it — “spent 20 on juice”, “call mom tomorrow”, “meditate daily”.</p>
      {!entry ? <><input autoFocus className="quickcap-input" placeholder="e.g. spent 20rs on juice" value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => event.key === "Enter" && capture()} /><button type="button" className="quickcap-primary" onClick={capture} disabled={loading || !note.trim()}>{loading ? "Reading..." : "Capture"}</button></> : <div className="quickcap-confirm"><div className="quickcap-type-row">{TYPE_OPTIONS.map((type) => <button key={type} type="button" className={`quickcap-type-pill ${entry.type === type ? "active" : ""}`} onClick={() => setEntry((current) => ({ ...current, type }))}>{type}</button>)}</div><input className="quickcap-input" placeholder="Title" value={entry.title} onChange={(event) => setEntry((current) => ({ ...current, title: event.target.value }))} />
      {money && <div className="quickcap-field-row"><input type="number" className="quickcap-input quickcap-amount" placeholder="Amount" value={entry.amount} onChange={(event) => setEntry((current) => ({ ...current, amount: event.target.value }))} /><select className="quickcap-input" value={entry.category} onChange={(event) => setEntry((current) => ({ ...current, category: event.target.value }))}>{(entry.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((category) => <option key={category}>{category}</option>)}</select></div>}
      {entry.type === "task" && <div className="quickcap-field-row"><input type="date" className="quickcap-input" value={entry.date} onChange={(event) => setEntry((current) => ({ ...current, date: event.target.value }))} /><select className="quickcap-input" value={entry.priority} onChange={(event) => setEntry((current) => ({ ...current, priority: event.target.value }))}>{["low", "medium", "high"].map((priority) => <option key={priority}>{priority}</option>)}</select></div>}
      {entry.type === "habit" && <select className="quickcap-input" value={entry.frequency} onChange={(event) => setEntry((current) => ({ ...current, frequency: event.target.value }))}><option value="daily">Daily</option><option value="weekly">Weekly</option></select>}{entry.clarification && <p className="quickcap-clarify">{entry.clarification}</p>}<div className="quickcap-cta-row"><button type="button" className="quickcap-primary" onClick={confirm} disabled={saving}><FiCheck /> {saving ? "Saving..." : "Confirm & Save"}</button><button type="button" className="quickcap-secondary" onClick={reset} disabled={saving}>Cancel</button></div></div>}
      {status && <p className="quickcap-status">{status}</p>}</section></div>, document.body)}
  </>;
}
