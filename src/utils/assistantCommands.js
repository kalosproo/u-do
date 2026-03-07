const SPEECH_RECOGNITION_SUPPORTED =
  typeof window !== "undefined" &&
  ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

const PAGE_COMMANDS = [
  { route: "/", keys: ["home", "dashboard"] },
  { route: "/finance", keys: ["finance", "expense", "income"] },
  { route: "/tasks", keys: ["tasks", "task board", "kanban"] },
  { route: "/planner", keys: ["planner", "plan", "calendar"] },
  { route: "/habits", keys: ["habit", "habits", "tracker"] },
];

const parseDateHint = (text) => {
  const now = new Date();
  if (text.includes("tomorrow")) {
    now.setDate(now.getDate() + 1);
  }

  return now.toISOString().split("T")[0];
};

const parseFinance = (text) => {
  const amount = text.match(/(?:rs\.?|rupees?|inr)?\s*(\d+(?:\.\d+)?)/i)?.[1] || "";
  const type = /(income|earned|salary|received|credit)/.test(text) ? "income" : "expense";
  const categoryList = type === "income"
    ? ["salary", "freelance", "gift", "other"]
    : ["food", "travel", "fuel", "transaction", "shopping", "needs", "rent", "bills", "investment", "education", "entertainment"];

  const category = categoryList.find((item) => text.includes(item)) || "";
  const title = text
    .replace(/(add|record|spent|paid|earned|received|rs\.?|rupees?|inr|\d+(?:\.\d+)?|on|for|towards|today|tomorrow)/gi, "")
    .trim();

  return {
    targetRoute: "/finance",
    event: "udo-assistant-finance",
    payload: {
      amount,
      type,
      category: category ? category.charAt(0).toUpperCase() + category.slice(1) : "",
      title: title || "Voice Transaction",
      date: parseDateHint(text),
      autoAdd: /(add now|save|submit|confirm)/.test(text),
    },
  };
};

const parseTask = (text) => ({
  targetRoute: "/tasks",
  event: "udo-assistant-task",
  payload: {
    title: text
      .replace(/(add|create|new|task|today|tomorrow)/gi, "")
      .trim() || "New Task",
    dueDate: parseDateHint(text),
    priority: text.includes("high") ? "high" : text.includes("low") ? "low" : "medium",
    autoAdd: true,
  },
});

const parsePlan = (text) => ({
  targetRoute: "/planner",
  event: "udo-assistant-plan",
  payload: {
    title: text.replace(/(add|create|plan|today|tomorrow)/gi, "").trim() || "New Plan",
    date: parseDateHint(text),
    autoAdd: true,
  },
});

const parseHabit = (text) => ({
  targetRoute: "/habits",
  event: "udo-assistant-habit",
  payload: {
    title: text.replace(/(add|create|habit|daily|weekly)/gi, "").trim() || "New Habit",
    frequency: text.includes("weekly") ? "weekly" : "daily",
    autoAdd: true,
  },
});

const parseAssistantCommand = (rawText) => {
  const text = rawText.toLowerCase().trim();

  const pageMatch = PAGE_COMMANDS.find((page) => page.keys.some((key) => text.includes(`go to ${key}`) || text === key || text.includes(`open ${key}`)));
  if (pageMatch) {
    return { type: "navigation", targetRoute: pageMatch.route };
  }

  if (/(spent|paid|expense|income|earned|received)/.test(text)) {
    return { type: "action", ...parseFinance(text) };
  }

  if (text.includes("task")) {
    return { type: "action", ...parseTask(text) };
  }

  if (text.includes("habit")) {
    return { type: "action", ...parseHabit(text) };
  }

  if (text.includes("plan") || text.includes("planner")) {
    return { type: "action", ...parsePlan(text) };
  }

  return { type: "unknown" };
};

export { SPEECH_RECOGNITION_SUPPORTED, parseAssistantCommand };
