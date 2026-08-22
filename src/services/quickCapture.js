import { askGroq } from "./groq";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../config/financeCategories";

const TYPES = ["expense", "income", "task", "habit"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function extractJson(content) {
  const cleaned = (content || "").trim();
  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fencedMatch ? fencedMatch[1].trim() : cleaned;
}

function normalizeAmount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeCategory(category, type) {
  const clean = typeof category === "string" ? category.trim() : "";
  const categories = type === "expense" ? EXPENSE_CATEGORIES : type === "income" ? INCOME_CATEGORIES : [];
  return categories.find((item) => item.toLowerCase() === clean.toLowerCase()) || (type === "expense" ? "Needs" : type === "income" ? "Other" : "General");
}

function normalizeEntry(raw, originalText) {
  const type = TYPES.includes(raw?.type) ? raw.type : "expense";
  return {
    type,
    title: typeof raw?.title === "string" && raw.title.trim() ? raw.title.trim() : originalText.slice(0, 40),
    amount: ["expense", "income"].includes(type) ? normalizeAmount(raw?.amount) : 0,
    category: normalizeCategory(raw?.category, type),
    date: typeof raw?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date.trim()) ? raw.date.trim() : "",
    priority: ["low", "medium", "high"].includes(raw?.priority) ? raw.priority : "medium",
    frequency: raw?.frequency === "weekly" ? "weekly" : "daily",
    clarification: typeof raw?.clarification === "string" ? raw.clarification.trim() : "",
  };
}

function formatCaptureError(error) {
  const status = error?.response?.status || error?.status;
  const message = (error?.response?.data?.error?.message || error?.message || "").toLowerCase();
  if (message.includes("groq api key missing") || !import.meta.env.VITE_GROQ_API_KEY) return "Groq API key not found. Add VITE_GROQ_API_KEY to your .env file and restart the app.";
  if (status === 401 || status === 403 || message.includes("api key")) return "Assistant access is blocked. Check your Groq API key at console.groq.com/keys.";
  if (status === 429 || message.includes("quota") || message.includes("rate")) return "Assistant usage limit reached. Please wait a moment and try again.";
  return "Couldn't understand that note. Try rephrasing it.";
}

function buildQuickCapturePrompt(text) {
  return `You are the quick-capture parser for a productivity app called U.Do. Today's date is ${todayISO()} (YYYY-MM-DD).
Read the user's one-line note and turn it into EXACTLY ONE structured entry. Return valid JSON only, no markdown:
{"type":"expense" | "income" | "task" | "habit","title":"short specific label","amount":0,"category":"allowed category","date":"YYYY-MM-DD or empty string","priority":"low" | "medium" | "high","frequency":"daily" | "weekly","clarification":"empty string or one short question"}
USER NOTE: """${text}"""
Rules: expense means spent/bought/paid money; income means received/earned/got paid; task is one-time; habit is recurring. For expense/income use the stated amount and an allowed category: expense (${EXPENSE_CATEGORIES.join(", ")}), income (${INCOME_CATEGORIES.join(", ")}). For task/habit use amount 0 and category General. Resolve relative dates using today's date. Habit frequency defaults daily; task priority defaults medium.`;
}

export async function parseQuickCapture(text) {
  const cleanedText = text?.trim();
  if (!cleanedText) return { entry: null, error: "Type something to capture first." };
  try {
    const parsed = JSON.parse(extractJson(await askGroq(buildQuickCapturePrompt(cleanedText))));
    return { entry: normalizeEntry(parsed, cleanedText), error: null };
  } catch (error) {
    console.error("Quick capture error:", error);
    return { entry: null, error: formatCaptureError(error) };
  }
}
