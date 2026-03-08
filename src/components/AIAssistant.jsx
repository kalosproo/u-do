import { useMemo, useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { generateAssistantPlan } from "../services/aiAssistant";

const QUICK_ACTIONS = [
  "Na repati day mottam auto-ga plan chesi add cheyyi",
  "Study + habits + spending balance plan create chesi add cheyyi",
  "Naku urgent tasks ni prioritize chesi workspace lo pettu",
];

function AIAssistant({ context }) {
  const [question, setQuestion] = useState("");
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const fallbackQuestion = useMemo(() => {
    const pending = context?.tasks?.pendingTasks ?? 0;
    return `I have ${pending} pending tasks. Create actions and auto-add them to my workspace.`;
  }, [context]);

  const applySingleAction = async (action) => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Please login first.");
    }

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
        // continue remaining actions
      }
    }

    return successCount;
  };

  const handleAsk = async (prompt = question, autoApply = false) => {
    setLoading(true);
    setStatus("");

    const response = await generateAssistantPlan(prompt || fallbackQuestion, context);
    setPlan(response.plan);

    if (response.error) {
      setStatus(response.error);
      setLoading(false);
      return;
    }

    if (autoApply && response.plan?.actions?.length) {
      setApplying(true);
      const applied = await applyActions(response.plan.actions);
      setApplying(false);

      setStatus(
        applied
          ? `Done ✅ ${applied} items automatically added to your workspace.`
          : "Could not add items automatically. Try again."
      );
    }

    setLoading(false);
  };

  const handleApplyAll = async () => {
    if (!plan?.actions?.length) return;

    setApplying(true);
    setStatus("");

    const applied = await applyActions(plan.actions);
    setApplying(false);

    setStatus(
      applied
        ? `Applied ${applied} automation actions to your workspace.`
        : "Could not apply actions. Please try again."
    );
  };

  return (
    <article className="wire-card assistant-card">
      <div className="assistant-header-row">
        <h3>U.Do Assistant</h3>
        <small>Gemini powered</small>
      </div>

      <p className="muted-line">
        Just tell your plan. Assistant can auto-enter data into Tasks, Planner, Habits, and Finance.
      </p>

      <div className="assistant-quick-actions">
        {QUICK_ACTIONS.map((prompt) => (
          <button key={prompt} type="button" className="assistant-chip" onClick={() => handleAsk(prompt, true)}>
            {prompt}
          </button>
        ))}
      </div>

      <textarea
        placeholder="Ex: Repu na day plan cheyyi and tasks/plans/habits auto add cheyyi"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        rows={3}
      />

      <div className="assistant-cta-row">
        <button type="button" onClick={() => handleAsk(question, true)} disabled={loading || applying}>
          {loading || applying ? "Working..." : "Generate + Auto Add"}
        </button>

        <button type="button" className="assistant-apply-btn" onClick={() => handleAsk(question, false)} disabled={loading || applying}>
          {loading ? "Thinking..." : "Generate Only"}
        </button>

        <button
          type="button"
          className="assistant-apply-btn"
          onClick={handleApplyAll}
          disabled={applying || !plan?.actions?.length}
        >
          {applying ? "Applying..." : "Apply Suggested"}
        </button>
      </div>

      {status ? <p className="assistant-status">{status}</p> : null}

      <div className="assistant-response">
        <p className="assistant-summary">{plan?.summary || "Your automation plan appears here."}</p>

        {plan?.actions?.length ? (
          <ul className="assistant-action-list">
            {plan.actions.map((action, index) => (
              <li key={`${action.type}-${action.title}-${index}`}>
                <strong>{action.title}</strong>
                <span>
                  {action.type.toUpperCase()}
                  {action.date ? ` • ${action.date}` : ""}
                  {action.type === "finance" ? ` • ₹${action.amount} ${action.transactionType}` : ""}
                </span>
                <small>{action.why}</small>
              </li>
            ))}
          </ul>
        ) : null}

        {plan?.motivation ? <em className="assistant-motivation">{plan.motivation}</em> : null}
      </div>
    </article>
  );
}

export default AIAssistant;
