import axios from "axios";

const API_URL = "https://api.openai.com/v1/chat/completions";
const API_KEY = import.meta.env.VITE_OPENAI_API_KEY;
const MODEL = import.meta.env.VITE_OPENAI_MODEL || "gpt-4o-mini";

export async function askOpenAI(prompt) {
  if (!API_KEY) {
    throw new Error("OpenAI API key missing. Set VITE_OPENAI_API_KEY in your environment.");
  }

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
}
