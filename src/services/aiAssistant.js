import { askGroq } from "./groq";

function buildAssistantPrompt({ question, context }) {
  return `You are U.Do Assistant, an automation copilot for a student productivity workspace.

USER QUESTION:
${question}

LIVE WORKSPACE SNAPSHOT:
${JSON.stringify(context, null, 2)}

Return valid JSON only with this exact shape:
{
  "summary": "short plan summary",
  "actions": [
    {
      "type": "task" | "plan" | "habit" | "finance",
      "title": "specific action title",
      "date": "YYYY-MM-DD or empty string",
      "priority": "low" | "medium" | "high",
      "frequency": "daily" | "weekly",
      "amount": 0,
      "category": "category name",
      "transactionType": "income" | "expense",
      "why": "one line reason"
    }
  ],
  "motivation": "one-line motivation"
}

Rules:
- Keep actions between 3 and 6.
- Include at least one task or plan action.
- Include at least one habit or finance action.
- Keep title practical and actionable.
- For type task, use due date when possible.
- For type plan, include date when possible.
- For type habit, include frequency.
- For type finance, include amount, category and transactionType.
- No markdown. JSON only.`;
}

function normalizePlan(raw) {
  const actions = Array.isArray(raw?.actions) ? raw.actions : [];

  return {
    summary: typeof raw?.summary === "string" ? raw.summary.trim() : "Automation plan ready.",
    motivation: typeof raw?.motivation === "string" ? raw.motivation.trim() : "You are closer than you think.",
    actions: actions
      .map((action) => ({
        type: ["task", "plan", "habit", "finance"].includes(action?.type) ? action.type : "task",
        title: typeof action?.title === "string" ? action.title.trim() : "Untitled action",
        date: typeof action?.date === "string" ? action.date.trim() : "",
        priority: ["low", "medium", "high"].includes(action?.priority) ? action.priority : "medium",
        frequency: action?.frequency === "weekly" ? "weekly" : "daily",
        amount: Number(action?.amount) || 0,
        category: typeof action?.category === "string" && action.category.trim() ? action.category.trim() : "General",
        transactionType: action?.transactionType === "income" ? "income" : "expense",
        why: typeof action?.why === "string" ? action.why.trim() : "Recommended by assistant.",
      }))
      .filter((action) => action.title)
      .slice(0, 6),
  };
}

function extractJson(content) {
  const cleaned = (content || "").trim();
  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fencedMatch ? fencedMatch[1].trim() : cleaned;
}

function formatAssistantError(error) {
  // askGroq already turned anything the assistant itself reported into words
  // a person can act on. Repeating the old checks here would be worse than
  // useless now: they tested a browser env var that no longer exists, so every
  // failure told users to edit a .env file — and pointed them at the Groq
  // console, which is our plumbing, not theirs.
  if (error?.assistant && error.message) return error.message;

  return "The assistant couldn't answer that. Try rephrasing it.";
}

function buildFallbackPlan() {
  return {
    summary: "Assistant is currently unavailable.",
    actions: [
      {
        type: "task",
        title: "Choose one high-impact task to complete today",
        date: "",
        priority: "high",
        frequency: "daily",
        amount: 0,
        category: "General",
        transactionType: "expense",
        why: "A single clear priority prevents overwhelm and builds momentum.",
      },
    ],
    motivation: "Keep going — consistency compounds.",
  };
}

export async function generateAssistantPlan(question, context = {}) {
  const cleanedQuestion = question?.trim();

  if (!cleanedQuestion) {
    return {
      plan: {
        summary: "Ask me for a plan and I will create actionable automations.",
        actions: [],
        motivation: "Let's build momentum today.",
      },
      error: null,
    };
  }

  try {
    const prompt = buildAssistantPrompt({ question: cleanedQuestion, context });
    const text = await askGroq(prompt);
    const parsed = JSON.parse(extractJson(text));

    return {
      plan: normalizePlan(parsed),
      error: null,
    };
  } catch (error) {
    console.error("AI Error:", error);

    return {
      plan: buildFallbackPlan(),
      error: formatAssistantError(error),
    };
  }
}
