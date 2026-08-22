import { askGroq } from "./groq";

function extractJson(content) {
  const cleaned = (content || "").trim();
  const fencedMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fencedMatch ? fencedMatch[1].trim() : cleaned;
}

function normalizeAssignments(raw, { pendingTasks, validDates, scheduledByDate }) {
  const titleLookup = new Map(pendingTasks.map((task) => [task.title.trim().toLowerCase(), task.title]));
  const assignedTitles = new Set();
  const countByDate = Object.fromEntries(validDates.map((date) => [date, scheduledByDate[date]?.length || 0]));
  return (Array.isArray(raw?.assignments) ? raw.assignments : []).flatMap((item) => {
    const title = titleLookup.get((item?.taskTitle || "").trim().toLowerCase());
    const date = typeof item?.date === "string" ? item.date.trim() : "";
    if (!title || !validDates.includes(date) || assignedTitles.has(title.toLowerCase()) || countByDate[date] >= 4) return [];
    assignedTitles.add(title.toLowerCase());
    countByDate[date] += 1;
    return [{ title, date, priority: ["low", "medium", "high"].includes(item?.priority) ? item.priority : "medium" }];
  });
}

function formatPlannerError(error) {
  const status = error?.response?.status || error?.status;
  const message = (error?.response?.data?.error?.message || error?.message || "").toLowerCase();
  if (message.includes("groq api key missing") || !import.meta.env.VITE_GROQ_API_KEY) return "Groq API key not found. Add VITE_GROQ_API_KEY to your .env file and restart the app.";
  if (status === 401 || status === 403 || message.includes("api key")) return "Assistant access is blocked. Check your Groq API key at console.groq.com/keys.";
  if (status === 429 || message.includes("quota") || message.includes("rate")) return "Assistant usage limit reached. Please wait a moment and try again.";
  return "Couldn't generate a plan right now. Please try again.";
}

export async function generateWeeklyPlan({ weekDates, pendingTasks, scheduledByDate }) {
  if (!pendingTasks.length) return { summary: "No pending tasks to schedule — your Tasks board is clear.", assignments: [], error: null };
  const validDates = weekDates.map((item) => item.date);
  const prompt = `You are U.Do's weekly auto-planner. TODAY: ${new Date().toISOString().slice(0, 10)}. WEEK: ${weekDates.map((item) => `${item.date} (${item.weekday})`).join(", ")}.
PENDING TASKS:\n${pendingTasks.map((item) => `- "${item.title}" | due: ${item.dueDate || "none"} | priority: ${item.priority}`).join("\n")}
SCHEDULED:\n${Object.entries(scheduledByDate).map(([date, titles]) => `${date}: ${titles.join(", ") || "(empty)"}`).join("\n")}
Assign pending tasks to one valid week date. Schedule due tasks on or before their due date; prefer lighter days; max 4 total items/day; do not duplicate scheduled titles; don't invent tasks. Return JSON only: {"summary":"short sentence","assignments":[{"taskTitle":"exact pending title","date":"YYYY-MM-DD","priority":"low" | "medium" | "high"}]}.`;
  try {
    const parsed = JSON.parse(extractJson(await askGroq(prompt)));
    return { summary: typeof parsed?.summary === "string" ? parsed.summary.trim() : "Plan ready.", assignments: normalizeAssignments(parsed, { pendingTasks, validDates, scheduledByDate }), error: null };
  } catch (error) {
    console.error("Auto planner error:", error);
    return { summary: "", assignments: [], error: formatPlannerError(error) };
  }
}
