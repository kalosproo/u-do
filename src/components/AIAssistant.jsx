import { useMemo, useState } from "react";
import { addDoc, collection } from "firebase/firestore";
import { auth, db } from "../services/firebase";
import { generateAssistantPlan } from "../services/aiAssistant";

const QUICK_ACTIONS = [
  "Plan my day with auto-created actions",
  "Recover my weekly habits and reduce distractions",
  "Balance tasks and spending for this week",
];

function AIAssistant({ context }) {
  const [question, setQuestion] = useState("");
  const [plan, setPlan] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const fallbackQuestion = useMemo(() => {
    const pending = context?.tasks?.pendingTasks ?? 0;
    return `I have ${pending} pending tasks. Build an automation plan and actions I can apply.`;
  }, [context]);

  const handleAsk = async (prompt = question) => {
    setLoading(true);
    setStatus("");

    const response = await generateAssistantPlan(prompt || fallbackQuestion, context);
    setPlan(response.plan);

    if (response.error) {
      setStatus(response.error);
    }

    setLoading(false);
  };

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
    }
  };

  const handleApplyAll = async () => {
    if (!plan?.actions?.length) return;

    setApplying(true);
    setStatus("");

    try {
      for (const action of plan.actions) {
        await applySingleAction(action);
      }
      setStatus(`Applied ${plan.actions.length} automation actions to your workspace.`);
    } catch {
      setStatus("Could not apply all actions. Please try again.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <article className="wire-card assistant-card">
      <div className="assistant-header-row">
        <h3>U.Do Assistant</h3>
        <small>Gemini powered</small>
      </div>

      <p className="muted-line">
        Generate and apply automation actions directly into Tasks, Planner, and Habits.
      </p>

      <div className="assistant-quick-actions">
        {QUICK_ACTIONS.map((prompt) => (
          <button key={prompt} type="button" className="assistant-chip" onClick={() => handleAsk(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <textarea
        placeholder="Ex: Create a realistic next 2-day productivity plan and automate it"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        rows={3}
      />

      <div className="assistant-cta-row">
        <button type="button" onClick={() => handleAsk()} disabled={loading}>
          {loading ? "Thinking..." : "Generate Automation"}
        </button>

        <button
          type="button"
          className="assistant-apply-btn"
          onClick={handleApplyAll}
          disabled={applying || !plan?.actions?.length}
        >
          {applying ? "Applying..." : "Apply All"}
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
                <span>{action.type.toUpperCase()} {action.date ? `• ${action.date}` : ""}</span>
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
