import { askGroq } from "./groq";
import { todayKey } from "../utils/dateKeys";

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
  // askGroq already turned anything the assistant itself reported into words
  // a person can act on. Repeating the old checks here would be worse than
  // useless now: they tested a browser env var that no longer exists, so every
  // failure told users to edit a .env file — and pointed them at the Groq
  // console, which is our plumbing, not theirs.
  if (error?.assistant && error.message) return error.message;

  return "Couldn't generate a plan right now. Please try again.";
}

export async function generateWeeklyPlan({ weekDates, pendingTasks, scheduledByDate }) {
  if (!pendingTasks.length) return { summary: "No pending tasks to schedule — your Tasks board is clear.", assignments: [], error: null };
  const validDates = weekDates.map((item) => item.date);
  const prompt = `You are U.Do's weekly auto-planner. TODAY: ${todayKey()}. WEEK: ${weekDates.map((item) => `${item.date} (${item.weekday})`).join(", ")}.
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
