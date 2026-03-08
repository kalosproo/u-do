const API_KEY = import.meta.env.VITE_DEEPSEEK_API_KEY || "";
const MODEL_NAME = import.meta.env.VITE_DEEPSEEK_MODEL || "deepseek-chat";
const API_URL = "https://api.deepseek.com/chat/completions";

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
  const status = error?.status;
  const message = (error?.message || "").toLowerCase();

  if (!API_KEY) {
    return "DeepSeek API key not found. Add VITE_DEEPSEEK_API_KEY to your .env file and restart the app.";
  }

  if (status === 401 || status === 403 || message.includes("api key") || message.includes("permission")) {
    return "Assistant access is blocked. Check your DeepSeek API key and API restrictions.";
  }

  if (status === 429 || message.includes("quota") || message.includes("rate")) {
    return "Assistant usage limit reached. Please wait a moment and try again.";
  }

  if (message.includes("json") || message.includes("unexpected token")) {
    return "Assistant returned an invalid response. Please try again.";
  }

  return "U.Do Assistant is temporarily unavailable. Please try again in a moment.";
}

async function requestAssistantPlan(prompt) {
  if (!API_KEY) {
    throw new Error("DeepSeek API key missing. Set VITE_DEEPSEEK_API_KEY in your environment.");
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const apiError = new Error(payload?.error?.message || "DeepSeek request failed.");
    apiError.status = response.status;
    throw apiError;
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "{}";
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
    const text = await requestAssistantPlan(prompt);
    const parsed = JSON.parse(extractJson(text));

    return {
      plan: normalizePlan(parsed),
      error: null,
    };
  } catch (error) {
    console.error("AI Error:", error);

    return {
      plan: {
        summary: "Assistant is currently unavailable.",
        actions: [],
        motivation: "Keep going — consistency compounds.",
      },
      error: formatAssistantError(error),
    };
  }
}
