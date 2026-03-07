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

const toTitleCase = (value) =>
  value
    .split(" ")
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");

const normalizePhrase = (value) => value.replace(/\s+/g, " ").trim();

const removeCommandTokens = (text, tokens) => {
  if (!tokens.length) return normalizePhrase(text);
  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi");
  return normalizePhrase(text.replace(pattern, " "));
};

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
  const categoryList =
    type === "income"
      ? ["salary", "freelance", "gift", "other"]
      : [
          "food",
          "travel",
          "fuel",
          "transaction",
          "shopping",
          "needs",
          "rent",
          "bills",
          "investment",
          "education",
          "entertainment",
        ];

  const category = categoryList.find((item) => text.includes(item)) || "";
  const titleRaw = removeCommandTokens(text, [
    "i",
    "make",
    "add",
    "create",
    "record",
    "spent",
    "pay",
    "paid",
    "expense",
    "income",
    "earned",
    "receive",
    "received",
    "rs",
    "rupee",
    "rupees",
    "inr",
    "on",
    "for",
    "towards",
    "today",
    "tomorrow",
    "a",
    "an",
    "the",
    ...categoryList,
  ]).replace(/\b\d+(?:\.\d+)?\b/g, "");

  const title = normalizePhrase(titleRaw);

  return {
    targetRoute: "/finance",
    event: "udo-assistant-finance",
    payload: {
      amount,
      type,
      category: category ? toTitleCase(category) : "",
      title: title ? toTitleCase(title) : category ? toTitleCase(category) : "Voice Transaction",
      date: parseDateHint(text),
      autoAdd: /(add now|save|submit|confirm)/.test(text),
    },
  };
};

const parseTask = (text) => {
  const title = removeCommandTokens(text, [
    "please",
    "make",
    "add",
    "create",
    "new",
    "task",
    "tasks",
    "for",
    "on",
    "today",
    "tomorrow",
    "a",
    "an",
    "the",
    "high",
    "low",
    "priority",
  ]);

  return {
    targetRoute: "/tasks",
    event: "udo-assistant-task",
    payload: {
      title: title ? toTitleCase(title) : "New Task",
      dueDate: parseDateHint(text),
      priority: text.includes("high") ? "high" : text.includes("low") ? "low" : "medium",
      autoAdd: true,
    },
  };
};

const parsePlan = (text) => {
  const title = removeCommandTokens(text, [
    "please",
    "make",
    "add",
    "create",
    "new",
    "plan",
    "planner",
    "on",
    "for",
    "today",
    "tomorrow",
    "a",
    "an",
    "the",
  ]);

  return {
    targetRoute: "/planner",
    event: "udo-assistant-plan",
    payload: {
      title: title ? toTitleCase(title) : "New Plan",
      date: parseDateHint(text),
      autoAdd: true,
    },
  };
};

const parseHabit = (text) => {
  const frequency = text.includes("weekly") ? "weekly" : "daily";
  const explicitMatch = text.match(/habit(?:s)?(?:\s+(?:on|for))?\s+(?:daily|weekly)?\s*(.*)$/i);
  const candidate = explicitMatch?.[1] || text;
  const title = removeCommandTokens(candidate, [
    "please",
    "make",
    "add",
    "create",
    "new",
    "habit",
    "habits",
    "on",
    "for",
    "daily",
    "weekly",
    "a",
    "an",
    "the",
  ]);

  return {
    targetRoute: "/habits",
    event: "udo-assistant-habit",
    payload: {
      title: title ? toTitleCase(title) : "New Habit",
      frequency,
      autoAdd: true,
    },
  };
};

const parseAssistantCommand = (rawText) => {
  const text = rawText.toLowerCase().trim();

  const pageMatch = PAGE_COMMANDS.find((page) =>
    page.keys.some(
      (key) => text.includes(`go to ${key}`) || text === key || text.includes(`open ${key}`)
    )
  );
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
