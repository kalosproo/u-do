import { todayKey } from "../../utils/dateKeys";
import { taskStats, habitStats, financeStats, plannerStats, activityByDay } from "../../utils/dashboard";
import { inMonth, monthPrefix, sortByDateDesc, spendByCategory } from "../../utils/financeReport";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../../config/financeCategories";
import * as tasks from "../tasks";
import * as habits from "../habits";
import * as planner from "../planner";
import * as finance from "../finance";
import * as friends from "../friends";
import { buildExpense } from "../../utils/financeReport";

/**
 * The assistant's capabilities, one entry per tool.
 *
 * Every tool runs through the same services the pages use, so it inherits the
 * signed-in user's Firestore permissions exactly — there is no privileged path
 * and nothing here can reach another account's data. Tools are tagged by kind:
 *
 *   read        — safe, run automatically so the model can answer questions
 *   write       — creates or edits; staged and applied on the user's confirm
 *   destructive — deletes; staged and always needs an explicit confirm
 */

export const TOOL_KINDS = { READ: "read", WRITE: "write", DESTRUCTIVE: "destructive" };

const str = (value, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/**
 * A date the user did not give is left empty, never guessed. "No due date" is
 * a real state and the assistant must not invent today or tomorrow for it.
 */
const optionalDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(str(value)) ? str(value) : "");

const findByTitle = (list, title) => {
  const needle = str(title).toLowerCase();
  if (!needle) return null;

  return (
    list.find((item) => (item.title || "").toLowerCase() === needle) ||
    list.find((item) => (item.title || "").toLowerCase().includes(needle)) ||
    null
  );
};

export const TOOLS = {
  /* ------------------------------------------------------------------ read */

  get_tasks: {
    kind: TOOL_KINDS.READ,
    describe: "List the user's tasks. No arguments.",
    run: async ({ uid }) => {
      const list = await tasks.fetchTasks(uid);
      return {
        count: list.length,
        stats: taskStats(list),
        tasks: list.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate || null,
        })),
      };
    },
  },

  get_habits: {
    kind: TOOL_KINDS.READ,
    describe: "List the user's habits with streaks. No arguments.",
    run: async ({ user }) => {
      const list = await habits.fetchHabits(user);
      const summary = habitStats(list);
      return { count: list.length, doneNow: summary.doneNow, habits: summary.rows };
    },
  },

  get_finance: {
    kind: TOOL_KINDS.READ,
    describe:
      'Read transactions. Args: {"scope":"month"|"all"} (default month). Returns totals and recent entries.',
    run: async ({ uid }, args) => {
      const all = await finance.fetchExpenses(uid);
      const scoped = oneOf(args?.scope, ["month", "all"], "month") === "all" ? all : inMonth(all, monthPrefix());

      return {
        scope: args?.scope || "month",
        stats: financeStats(all),
        byCategory: spendByCategory(scoped),
        entries: sortByDateDesc(scoped).slice(0, 40).map((entry) => ({
          id: entry.id,
          title: entry.title,
          amount: entry.amount,
          type: entry.type,
          category: entry.category,
          date: entry.date,
        })),
      };
    },
  },

  get_planner: {
    kind: TOOL_KINDS.READ,
    describe: "List planner entries. No arguments.",
    run: async ({ uid }) => {
      const list = await planner.fetchPlans(uid);
      return {
        count: list.length,
        stats: plannerStats(list),
        plans: list.map((plan) => ({
          id: plan.id,
          title: plan.title,
          date: plan.date || null,
          completed: Boolean(plan.completed),
        })),
      };
    },
  },

  get_dashboard: {
    kind: TOOL_KINDS.READ,
    describe: "A combined snapshot across tasks, habits, finance, planner and activity. No arguments.",
    run: async ({ uid, user }) => {
      const [taskList, habitList, expenseList, planList] = await Promise.all([
        tasks.fetchTasks(uid),
        habits.fetchHabits(user),
        finance.fetchExpenses(uid),
        planner.fetchPlans(uid),
      ]);

      return {
        today: todayKey(),
        tasks: taskStats(taskList),
        habits: habitStats(habitList),
        finance: financeStats(expenseList),
        planner: plannerStats(planList),
        activity: activityByDay({ habits: habitList, expenses: expenseList, plans: planList }),
      };
    },
  },

  get_friends: {
    kind: TOOL_KINDS.READ,
    describe: "List friends and pending requests. No arguments.",
    run: async ({ uid }) => {
      const [list, requests] = await Promise.all([
        friends.listFriends(uid),
        friends.listIncomingRequests(uid),
      ]);

      return {
        friends: list.map((friend) => ({
          username: friend.username,
          displayName: friend.displayName,
          longestStreak: friend.summary?.longestStreak ?? null,
        })),
        pendingRequests: requests.map((request) => request.username || request.uid),
      };
    },
  },

  get_profile: {
    kind: TOOL_KINDS.READ,
    describe: "The user's own profile: handle and invite code. No arguments.",
    run: async ({ uid, user }) => {
      const profile = await friends.getMyProfile(uid);
      return {
        displayName: user.displayName || user.email || "",
        email: user.email || "",
        username: profile?.username || null,
        inviteCode: profile?.inviteCode || null,
      };
    },
  },

  get_categories: {
    kind: TOOL_KINDS.READ,
    describe: "The finance categories the app supports. No arguments.",
    run: async () => ({ expense: EXPENSE_CATEGORIES, income: INCOME_CATEGORIES }),
  },

  /* ----------------------------------------------------------------- write */

  create_task: {
    kind: TOOL_KINDS.WRITE,
    describe:
      'Create a task. Args: {"title":"...","dueDate":"YYYY-MM-DD" (omit entirely if the user gave no date),"priority":"low"|"medium"|"high"}',
    summarize: (args) =>
      `Add task "${str(args?.title)}"${optionalDate(args?.dueDate) ? ` due ${optionalDate(args.dueDate)}` : " with no due date"}`,
    run: async ({ uid }, args) => {
      const title = str(args?.title);
      if (!title) throw new Error("A task needs a title.");

      await tasks.createTask(uid, {
        title,
        dueDate: optionalDate(args?.dueDate),
        priority: oneOf(args?.priority, ["low", "medium", "high"], "medium"),
      });

      return { created: title, dueDate: optionalDate(args?.dueDate) || null };
    },
  },

  update_task: {
    kind: TOOL_KINDS.WRITE,
    describe:
      'Edit a task found by title. Args: {"title":"existing title","newTitle":"...","dueDate":"YYYY-MM-DD or empty string to clear","priority":"...","status":"todo"|"progress"|"done"}',
    summarize: (args) => `Update task "${str(args?.title)}"`,
    run: async ({ uid }, args) => {
      const list = await tasks.fetchTasks(uid);
      const match = findByTitle(list, args?.title);
      if (!match) throw new Error(`No task matching "${str(args?.title)}".`);

      const changes = {};
      if (args?.newTitle !== undefined) changes.title = str(args.newTitle, match.title);
      if (args?.dueDate !== undefined) changes.dueDate = optionalDate(args.dueDate);
      if (args?.priority !== undefined) changes.priority = oneOf(args.priority, ["low", "medium", "high"], match.priority);
      if (args?.status !== undefined) changes.status = oneOf(args.status, ["todo", "progress", "done"], match.status);

      if (!Object.keys(changes).length) throw new Error("Nothing to change on that task.");

      await tasks.updateTask(uid, match.id, changes);
      return { updated: match.title, changes };
    },
  },

  create_habit: {
    kind: TOOL_KINDS.WRITE,
    describe: 'Create a habit. Args: {"title":"...","frequency":"daily"|"weekly"}',
    summarize: (args) => `Add ${oneOf(args?.frequency, ["daily", "weekly"], "daily")} habit "${str(args?.title)}"`,
    run: async ({ uid }, args) => {
      const title = str(args?.title);
      if (!title) throw new Error("A habit needs a title.");

      await habits.createHabit(uid, {
        title,
        frequency: oneOf(args?.frequency, ["daily", "weekly"], "daily"),
      });

      return { created: title };
    },
  },

  update_habit: {
    kind: TOOL_KINDS.WRITE,
    describe: 'Rename a habit or change its frequency. Args: {"title":"existing","newTitle":"...","frequency":"daily"|"weekly"}',
    summarize: (args) => `Update habit "${str(args?.title)}"`,
    run: async ({ uid, user }, args) => {
      const list = await habits.fetchHabits(user);
      const match = findByTitle(list, args?.title);
      if (!match) throw new Error(`No habit matching "${str(args?.title)}".`);

      const changes = {};
      if (args?.newTitle !== undefined) changes.title = str(args.newTitle, match.title);
      if (args?.frequency !== undefined) changes.frequency = oneOf(args.frequency, ["daily", "weekly"], match.frequency);

      if (!Object.keys(changes).length) throw new Error("Nothing to change on that habit.");

      await habits.updateHabit(uid, match.id, changes);
      return { updated: match.title, changes };
    },
  },

  create_plan: {
    kind: TOOL_KINDS.WRITE,
    describe: 'Add a planner entry on a specific day. Args: {"title":"...","date":"YYYY-MM-DD"}',
    summarize: (args) => `Plan "${str(args?.title)}" on ${optionalDate(args?.date) || "today"}`,
    run: async ({ uid }, args) => {
      const title = str(args?.title);
      if (!title) throw new Error("A planner entry needs a title.");

      // The planner is a calendar: an entry without a day has nowhere to sit.
      const date = optionalDate(args?.date) || todayKey();

      await planner.createPlan(uid, { title, date });
      return { created: title, date };
    },
  },

  add_transaction: {
    kind: TOOL_KINDS.WRITE,
    describe:
      'Record money in or out. Args: {"title":"...","amount":123,"type":"expense"|"income","category":"...","date":"YYYY-MM-DD"}',
    summarize: (args) =>
      `${oneOf(args?.type, ["expense", "income"], "expense") === "income" ? "Income" : "Expense"} "${str(args?.title)}" ₹${Number(args?.amount) || 0}`,
    run: async ({ uid }, args) => {
      const title = str(args?.title);
      const amount = Number(args?.amount);

      if (!title) throw new Error("A transaction needs a title.");
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("A transaction needs an amount above zero.");

      const type = oneOf(args?.type, ["expense", "income"], "expense");
      const allowed = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
      const category = allowed.includes(str(args?.category)) ? str(args.category) : allowed[0];

      const expense = buildExpense({ title, amount, type, category, date: optionalDate(args?.date) || todayKey() });
      const current = await finance.fetchExpenses(uid);
      const { error } = await finance.addExpense(uid, expense, current);

      if (error) throw error;
      return { created: title, amount, type, category, date: expense.date };
    },
  },

  update_transaction: {
    kind: TOOL_KINDS.WRITE,
    describe: 'Edit a transaction found by title. Args: {"title":"existing","newTitle":"...","amount":123,"category":"...","date":"YYYY-MM-DD"}',
    summarize: (args) => `Update transaction "${str(args?.title)}"`,
    run: async ({ uid }, args) => {
      const current = await finance.fetchExpenses(uid);
      const match = findByTitle(current, args?.title);
      if (!match) throw new Error(`No transaction matching "${str(args?.title)}".`);

      const changes = {};
      if (args?.newTitle !== undefined) changes.title = str(args.newTitle, match.title);
      if (args?.amount !== undefined) changes.amount = Number(args.amount);
      if (args?.category !== undefined) changes.category = str(args.category, match.category);
      if (args?.date !== undefined) changes.date = optionalDate(args.date) || match.date;

      if (!Object.keys(changes).length) throw new Error("Nothing to change on that transaction.");

      await finance.editExpense(uid, match.id, changes, current);
      return { updated: match.title, changes };
    },
  },

  /* ------------------------------------------------------------ destructive */

  delete_task: {
    kind: TOOL_KINDS.DESTRUCTIVE,
    describe: 'Delete one task by title. Args: {"title":"..."}',
    summarize: (args) => `Delete task "${str(args?.title)}"`,
    run: async ({ uid }, args) => {
      const list = await tasks.fetchTasks(uid);
      const match = findByTitle(list, args?.title);
      if (!match) throw new Error(`No task matching "${str(args?.title)}".`);

      await tasks.deleteTask(uid, match.id);
      return { deleted: match.title };
    },
  },

  delete_habit: {
    kind: TOOL_KINDS.DESTRUCTIVE,
    describe: 'Delete one habit by title, including its history. Args: {"title":"..."}',
    summarize: (args) => `Delete habit "${str(args?.title)}" and its history`,
    run: async ({ uid, user }, args) => {
      const list = await habits.fetchHabits(user);
      const match = findByTitle(list, args?.title);
      if (!match) throw new Error(`No habit matching "${str(args?.title)}".`);

      await habits.deleteHabit(uid, match.id);
      return { deleted: match.title };
    },
  },

  delete_transaction: {
    kind: TOOL_KINDS.DESTRUCTIVE,
    describe: 'Delete one transaction by title. Args: {"title":"..."}',
    summarize: (args) => `Delete transaction "${str(args?.title)}"`,
    run: async ({ uid }, args) => {
      const current = await finance.fetchExpenses(uid);
      const match = findByTitle(current, args?.title);
      if (!match) throw new Error(`No transaction matching "${str(args?.title)}".`);

      await finance.removeExpense(uid, match.id, current);
      return { deleted: match.title };
    },
  },

  clear_collection: {
    kind: TOOL_KINDS.DESTRUCTIVE,
    describe: 'Delete everything in one area. Args: {"area":"tasks"|"habits"|"finance"} — never touches the others.',
    summarize: (args) => `Delete ALL ${oneOf(args?.area, ["tasks", "habits", "finance"], "tasks")}`,
    run: async ({ uid }, args) => {
      const area = oneOf(args?.area, ["tasks", "habits", "finance"], null);
      if (!area) throw new Error('Area must be "tasks", "habits" or "finance".');

      const removed =
        area === "tasks"
          ? await tasks.clearTasks(uid)
          : area === "habits"
            ? await habits.clearHabits(uid)
            : await finance.clearExpenses(uid);

      return { area, removed };
    },
  },
};

export const isDestructive = (name) => TOOLS[name]?.kind === TOOL_KINDS.DESTRUCTIVE;
export const isRead = (name) => TOOLS[name]?.kind === TOOL_KINDS.READ;

/** The catalog as the model sees it. */
export const describeTools = () =>
  Object.entries(TOOLS)
    .map(([name, tool]) => `- ${name} [${tool.kind}]: ${tool.describe}`)
    .join("\n");

/** A human-readable line for a staged action, used in the confirm list. */
export const summarizeCall = (call) => {
  const tool = TOOLS[call?.tool];
  if (!tool) return `Unknown action "${call?.tool}"`;
  return tool.summarize ? tool.summarize(call.args || {}) : call.tool;
};
