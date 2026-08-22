import axios from "axios";

// Groq gives a free API key (no credit card) at https://console.groq.com/keys
// Its chat completions endpoint is OpenAI-compatible, so this mirrors openai.js.
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const API_KEY = import.meta.env.VITE_GROQ_API_KEY;
const MODEL = import.meta.env.VITE_GROQ_MODEL || "openai/gpt-oss-120b";

// Free tier is rate-limited (~30 req/min). Retry with backoff instead of
// failing the whole request the moment a burst of calls trips the limit.
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(error, attempt) {
  const retryAfterHeader = error?.response?.headers?.["retry-after"];
  const retryAfterSeconds = Number(retryAfterHeader);

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return BASE_DELAY_MS * 2 ** attempt;
}

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status < 600);
}

export async function askGroq(prompt) {
  if (!API_KEY) {
    throw new Error("Groq API key missing. Set VITE_GROQ_API_KEY in your environment.");
  }

  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await axios.post(
        API_URL,
        {
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response?.data?.choices?.[0]?.message?.content ?? "";
    } catch (error) {
      lastError = error;
      const status = error?.response?.status;

      if (isRetryableStatus(status) && attempt < MAX_RETRIES) {
        await wait(getRetryDelayMs(error, attempt));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}
