import { askGroq } from "./groq";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../config/financeCategories";
import { todayKey } from "../utils/dateKeys";

const TYPES = ["expense", "income", "task", "habit"];

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
  // askGroq already turned anything the assistant itself reported into words
  // a person can act on. Repeating the old checks here would be worse than
  // useless now: they tested a browser env var that no longer exists, so every
  // failure told users to edit a .env file — and pointed them at the Groq
  // console, which is our plumbing, not theirs.
  if (error?.assistant && error.message) return error.message;

  return "Couldn't understand that note. Try rephrasing it.";
}

function buildQuickCapturePrompt(text) {
  return `You are the quick-capture parser for a productivity app called U.Do. Today's date is ${todayKey()} (YYYY-MM-DD).
Read the user's one-line note and turn it into EXACTLY ONE structured entry. Return valid JSON only, no markdown:
{"type":"expense" | "income" | "task" | "habit","title":"short specific label","amount":0,"category":"allowed category","date":"YYYY-MM-DD or empty string","priority":"low" | "medium" | "high","frequency":"daily" | "weekly","clarification":"empty string or one short question"}
USER NOTE: """${text}"""
Rules: expense means spent/bought/paid money; income means received/earned/got paid; task is one-time; habit is recurring. For expense/income use the stated amount and an allowed category: expense (${EXPENSE_CATEGORIES.join(", ")}), income (${INCOME_CATEGORIES.join(", ")}). For task/habit use amount 0 and category General. Resolve relative dates using today's date. Habit frequency defaults daily; task priority defaults medium.`;
}

function parseDeterministicTask(text) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dueTomorrow = /\btomorrow\b/i.test(text);
  const priority = /\b(urgent|asap|high priority)\b/i.test(text) ? "high" : "medium";
  const title = text.replace(/\btomorrow\b/gi, "").replace(/\s{2,}/g, " ").trim();

  if (!title || /\b(spent|paid|bought|earned|received|daily|weekly|every day|each day)\b/i.test(text)) return null;
  return { entry: normalizeEntry({ type: "task", title, date: dueTomorrow ? toDateKey(tomorrow) : "", priority }, text), error: null };
}

function toDateKey(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export async function parseQuickCapture(text) {
  const cleanedText = text?.trim();
  if (!cleanedText) return { entry: null, error: "Type something to capture first." };
  const deterministicTask = parseDeterministicTask(cleanedText);
  if (deterministicTask) return deterministicTask;

  try {
    const parsed = JSON.parse(extractJson(await askGroq(buildQuickCapturePrompt(cleanedText))));
    return { entry: normalizeEntry(parsed, cleanedText), error: null };
  } catch (error) {
    console.error("Quick capture error:", error);
    return { entry: null, error: formatCaptureError(error) };
  }
}
