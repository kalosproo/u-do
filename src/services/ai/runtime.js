import { TOOLS, isDestructive } from "./tools";

/**
 * Runs one tool call and reports honestly what happened.
 *
 * Nothing here ever reports success it did not observe: a rejected promise
 * becomes ok:false with the real message, so the UI can only claim an action
 * worked when the underlying service actually returned.
 */
export const runTool = async (context, call) => {
  const tool = TOOLS[call?.tool];

  if (!tool) {
    return { ok: false, tool: call?.tool, error: `No such action "${call?.tool}".` };
  }

  try {
    const result = await tool.run(context, call.args || {});
    return { ok: true, tool: call.tool, kind: tool.kind, result };
  } catch (error) {
    return {
      ok: false,
      tool: call.tool,
      kind: tool.kind,
      // permission-denied here means the rules refused it, which is the system
      // working — surface it rather than dressing it up as a generic failure.
      error:
        error?.code === "permission-denied"
          ? "Firestore rejected that — you may not have permission, or the rules are not deployed."
          : error?.message || "That action failed.",
    };
  }
};

/** Read tools only: safe to run without asking, so the model can see real data. */
export const runReads = async (context, calls) => {
  const results = {};

  for (const call of calls) {
    const outcome = await runTool(context, call);
    results[call.tool] = outcome.ok ? outcome.result : { error: outcome.error };
  }

  return results;
};

/**
 * Applies staged writes in order, stopping at nothing — one failure must not
 * hide the rest. Destructive calls are only reachable here once the caller has
 * confirmed them; runtime re-checks rather than trusting that.
 */
export const applyCalls = async (context, calls, { confirmedDestructive = false } = {}) => {
  const applied = [];

  for (const call of calls) {
    if (isDestructive(call.tool) && !confirmedDestructive) {
      applied.push({ ok: false, tool: call.tool, error: "Needs confirmation before running." });
      continue;
    }

    applied.push(await runTool(context, call));
  }

  return {
    applied,
    succeeded: applied.filter((entry) => entry.ok).length,
    failed: applied.filter((entry) => !entry.ok),
  };
};
