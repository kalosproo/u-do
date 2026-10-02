import { askGroq } from "../groq";
import { todayKey } from "../../utils/dateKeys";
import { TOOLS, describeTools, isRead } from "./tools";
import { runReads } from "./runtime";

/** How many read rounds before we stop and answer with what we have. */
const MAX_READ_ROUNDS = 3;

const extractJson = (content) => {
  const cleaned = (content || "").trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : cleaned;

  // Models sometimes prepend a sentence; fall back to the outermost braces.
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    if (start === -1 || end <= start) throw new Error("The assistant replied in an unreadable format.");
    return JSON.parse(body.slice(start, end + 1));
  }
};

const buildPrompt = ({ question, observations, round }) => `You are U.Do Assistant, working inside a personal productivity app.

You act only through the tools below. You never invent data: if you need to know
something, call a read tool and wait for the result.

TODAY: ${todayKey()}

TOOLS
${describeTools()}

RULES
- Reply with JSON only. No prose outside the JSON.
- Shape: {"reads":[{"tool":"...","args":{}}],"actions":[{"tool":"...","args":{}}],"reply":"what you'd tell the user"}
- "reads" runs immediately and comes back to you. Use it before answering anything about the user's data.
- "actions" are proposed changes. They are shown to the user and only run once they confirm. Never say an action is done — say what you will do.
- A task with no date the user mentioned must OMIT dueDate entirely. Never guess today or tomorrow.
- Deleting anything is destructive and always needs the user's confirmation.
- If nothing needs doing, return empty arrays and answer in "reply".
- Keep "reply" short and specific, referring to the real numbers you read.

${observations ? `DATA YOU ALREADY READ (round ${round}):\n${JSON.stringify(observations, null, 1)}\n` : ""}
USER: """${question}"""`;

const normalizeCalls = (raw) =>
  (Array.isArray(raw) ? raw : [])
    .map((entry) => ({ tool: String(entry?.tool || ""), args: entry?.args && typeof entry.args === "object" ? entry.args : {} }))
    .filter((entry) => TOOLS[entry.tool]);

export const formatAssistantError = (error) => {
  // askGroq already turned anything the assistant itself reported into words
  // a person can act on. Repeating the old checks here would be worse than
  // useless now: they tested a browser env var that no longer exists, so every
  // failure told users to edit a .env file — and pointed them at the Groq
  // console, which is our plumbing, not theirs.
  if (error?.assistant && error.message) return error.message;

  return "The assistant couldn't answer that. Try rephrasing it.";
};

/**
 * Answers a question, reading real data first and proposing (never applying)
 * any changes. Returns the staged actions for the caller to confirm.
 */
export const ask = async (context, question) => {
  let observations = null;

  for (let round = 1; round <= MAX_READ_ROUNDS; round += 1) {
    const parsed = extractJson(await askGroq(buildPrompt({ question, observations, round })));

    const reads = normalizeCalls(parsed.reads).filter((call) => isRead(call.tool));
    const actions = normalizeCalls(parsed.actions).filter((call) => !isRead(call.tool));
    const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";

    // Nothing more to look up: this is the answer.
    if (!reads.length) return { reply, actions, observations };

    observations = { ...(observations || {}), ...(await runReads(context, reads)) };

    // Last round: answer with whatever we gathered rather than looping forever.
    if (round === MAX_READ_ROUNDS) return { reply, actions, observations };
  }

  return { reply: "", actions: [], observations };
};
