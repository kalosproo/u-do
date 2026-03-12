import axios from "axios";

const API_URL = "https://api.deepseek.com/v1/chat/completions";
const API_KEY = import.meta.env.VITE_DEEPSEEK_API;

export async function askDeepSeek(prompt) {
  if (!API_KEY) {
    throw new Error("DeepSeek API key missing. Set VITE_DEEPSEEK_API in your environment.");
  }

  const response = await axios.post(
    API_URL,
    {
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
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
