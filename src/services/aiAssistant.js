import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = "AIzaSyC8sHi30aQWvZ7x7YFlyHZ6tE3RHF8CaL8";
const MODEL_NAME = "gemini-1.5-flash";

function getModel() {
  if (!API_KEY) {
    throw new Error("Gemini API key missing. Set VITE_GEMINI_API in your environment.");
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  return genAI.getGenerativeModel({ model: MODEL_NAME });
}

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
    const model = getModel();
    const result = await model.generateContent({
      contents: buildAssistantPrompt({ question: cleanedQuestion, context }),
      generationConfig: {
        responseMimeType: "application/json",
      },
    });

    const text = result.response.text();
    const parsed = JSON.parse(text);

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
      error: !API_KEY
        ? "Gemini API key not found. Add VITE_GEMINI_API to your .env file and restart the app."
        : "U.Do Assistant is temporarily unavailable. Please try again in a moment.",
    };
  }
}
