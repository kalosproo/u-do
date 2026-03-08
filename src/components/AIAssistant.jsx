import { useCallback, useMemo, useState } from "react";
import { addDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { generateAssistantPlan } from "../services/aiAssistant";

const QUICK_ACTIONS = [
  "Build a focused plan for today",
  "Create a balanced study and habit routine",
  "Prioritize urgent tasks and schedule them",
];

function summarizeWorkspace({ tasks, plans, expenses, habits }) {
  const today = new Date().toISOString().slice(0, 10);
  const completedTasks = tasks.filter((task) => task.status === "done" || task.completed).length;
  const todayPlans = plans.filter((plan) => plan.date === today).length;
  const todayBalanceChange = expenses
    .filter((entry) => entry.date === today)
    .reduce((sum, entry) => sum + (entry.type === "income" ? Number(entry.amount || 0) : -Number(entry.amount || 0)), 0);

  return {
    tasks: {
      totalTasks: tasks.length,
      completedTasks,
      pendingTasks: Math.max(0, tasks.length - completedTasks),
    },
    planner: {
      todaysPlans: todayPlans,
      upcoming: plans
        .filter((plan) => !plan.completed)
        .sort((a, b) => (a.date || "").localeCompare(b.date || ""))
        .slice(0, 3)
        .map((plan) => ({
          title: plan.title,
          date: plan.date || "",
        })),
    },
    finance: {
      todayBalanceChange,
      spendRatio: expenses.length
        ? Math.min(
            100,
            Math.round(
              (expenses.filter((entry) => entry.type === "expense").reduce((a, b) => a + Number(b.amount || 0), 0) /
                (expenses.reduce((a, b) => a + Math.abs(Number(b.amount || 0)), 0) || 1)) *
                100
            )
          )
        : 0,
    },
    habits: habits.slice(0, 4).map((habit) => ({
      title: habit.title,
      frequency: habit.frequency || "daily",
    })),
  };
}

function AIAssistant() {
  const [question, setQuestion] = useState("");
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const fallbackQuestion = useMemo(
    () => "Create a high-impact plan for my day and add it to my workspace.",
    []
  );

  const fetchWorkspaceContext = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Please login first.");
    }

    const [taskSnap, planSnap, expenseSnap, habitSnap] = await Promise.all([
      getDocs(collection(db, "users", user.uid, "tasks")),
      getDocs(collection(db, "users", user.uid, "planner")),
      getDocs(collection(db, "users", user.uid, "expenses")),
      getDocs(collection(db, "users", user.uid, "habits")),
    ]);

    return summarizeWorkspace({
      tasks: taskSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })),
      plans: planSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })),
      expenses: expenseSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })),
      habits: habitSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })),
    });
  }, []);

  const applySingleAction = async (action) => {
    const user = auth.currentUser;
    if (!user) throw new Error("Please login first.");

    if (action.type === "task") {
      await addDoc(collection(db, "users", user.uid, "tasks"), {
        title: action.title,
        dueDate: action.date || "",
        priority: action.priority || "medium",
        status: "todo",
        completed: false,
        createdAt: new Date(),
      });
      return;
    }

    if (action.type === "plan") {
      await addDoc(collection(db, "users", user.uid, "planner"), {
        title: action.title,
        date: action.date || new Date().toISOString().slice(0, 10),
        priority: action.priority || "medium",
        completed: false,
        order: 0,
        createdAt: new Date(),
      });
      return;
    }

    if (action.type === "habit") {
      await addDoc(collection(db, "users", user.uid, "habits"), {
        title: action.title,
        frequency: action.frequency || "daily",
        createdAt: new Date(),
        logs: {},
      });
      return;
    }

    if (action.type === "finance") {
      await addDoc(collection(db, "users", user.uid, "expenses"), {
        title: action.title,
        amount: Number(action.amount) || 0,
        category: action.category || "General",
        type: action.transactionType === "income" ? "income" : "expense",
        date: action.date || new Date().toISOString().slice(0, 10),
        createdAt: new Date(),
      });
    }
  };

  const applyActions = async (actions) => {
    if (!actions?.length) return 0;

    let successCount = 0;
    for (const action of actions) {
      try {
        await applySingleAction(action);
        successCount += 1;
      } catch {
        // continue with remaining actions
      }
    }
    return successCount;
  };

  const handleAsk = async (prompt = question, autoApply = false) => {
    setLoading(true);
    setStatus("");

    try {
      const context = await fetchWorkspaceContext();
      const response = await generateAssistantPlan(prompt || fallbackQuestion, context);
      setPlan(response.plan);

      if (response.error) {
        setStatus(response.error);
        return;
      }

      if (autoApply && response.plan?.actions?.length) {
        setApplying(true);
        const applied = await applyActions(response.plan.actions);
        setApplying(false);

        setStatus(
          applied
            ? `Completed: ${applied} actions were added to your workspace.`
            : "No actions could be applied. Please retry."
        );
      }
    } catch (error) {
      setStatus(error?.message || "Unable to generate your plan right now.");
    } finally {
      setLoading(false);
      setApplying(false);
    }
  };

  return (
    <section className="sidebar-assistant" aria-label="U.Do assistant panel">
      <div className="assistant-header-row">
        <h4>U.Do Assistant</h4>
        <small>Premium AI</small>
      </div>

      <p className="assistant-muted">
        Describe your goal once. I will generate and apply optimized actions to your workspace.
      </p>

      <div className="assistant-quick-actions">
        {QUICK_ACTIONS.map((prompt) => (
          <button key={prompt} type="button" className="assistant-chip" onClick={() => handleAsk(prompt, true)}>
            {prompt}
          </button>
        ))}
      </div>

      <textarea
        className="assistant-input"
        placeholder="Example: Plan my day with top priorities and auto add everything"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        rows={3}
      />

      <div className="assistant-cta-row">
        <button type="button" onClick={() => handleAsk(question, true)} disabled={loading || applying}>
          {loading || applying ? "Processing..." : "Generate + Apply"}
        </button>

        <button
          type="button"
          className="assistant-apply-btn"
          onClick={() => handleAsk(question, false)}
          disabled={loading || applying}
        >
          Generate Only
        </button>
      </div>

      {status ? <p className="assistant-status">{status}</p> : null}

      <div className="assistant-response">
        <p className="assistant-summary">{plan?.summary || "Your assistant output appears here."}</p>

        {plan?.actions?.length ? (
          <ul className="assistant-action-list">
            {plan.actions.map((action, index) => (
              <li key={`${action.type}-${action.title}-${index}`}>
                <strong>{action.title}</strong>
                <span>
                  {action.type.toUpperCase()}
                  {action.date ? ` • ${action.date}` : ""}
                </span>
                <small>{action.why}</small>
              </li>
            ))}
          </ul>
        ) : null}

        {plan?.motivation ? <em className="assistant-motivation">{plan.motivation}</em> : null}
      </div>
    </section>
  );
}

export default AIAssistant;
