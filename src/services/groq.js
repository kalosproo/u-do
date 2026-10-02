import { httpsCallable } from "firebase/functions";

import { functions } from "./firebase";

/**
 * The assistant's model call, now made by the server.
 *
 * This file used to hold the Groq API key and talk to api.groq.com straight
 * from the browser. Vite inlines `import.meta.env.VITE_*` into the bundle, so
 * that key shipped to every visitor and anyone could read it out of the
 * JavaScript and spend the quota. It also meant a signed-out visitor could
 * drive the model for free.
 *
 * The key lives in a Firebase secret now and the browser never sees it. The
 * signature is unchanged on purpose — aiAssistant, ai/assistant, quickCapture
 * and autoPlanner all call askGroq(prompt) and none of them had to change.
 */
/**
 * Built on first use, not at import time.
 *
 * Four modules import askGroq, and several pages import those. Constructing
 * the callable at module scope would mean a bad Functions instance takes the
 * whole Planner down on load rather than failing the one button that needed
 * it.
 */
let callAssistant;

const assistant = () => {
  if (!callAssistant) {
    callAssistant = httpsCallable(functions, "askAssistant", { timeout: 120_000 });
  }
  return callAssistant;
};

/** Callable errors arrive with a code; turn the ones worth explaining into words. */
const readableError = (error) => {
  switch (error?.code) {
    case "functions/unauthenticated":
      return "Sign in to use the assistant.";
    case "functions/resource-exhausted":
      return "The assistant is busy or you've used it a lot recently. Try again shortly.";
    case "functions/failed-precondition":
      return "The assistant isn't set up on this deployment yet.";
    case "functions/invalid-argument":
      return "That request was too large for the assistant.";
    default:
      return "The assistant could not be reached. Try again in a moment.";
  }
};

export async function askGroq(prompt) {
  try {
    const result = await assistant()({ prompt });
    return result?.data?.text ?? "";
  } catch (error) {
    // Tagged so each feature can pass this straight through while keeping its
    // own wording for the failures it raises itself — a reply it could not
    // parse is not the same as the assistant being unreachable.
    const readable = new Error(readableError(error));
    readable.assistant = true;
    throw readable;
  }
}
