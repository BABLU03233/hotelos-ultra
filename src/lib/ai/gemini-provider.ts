import { GoogleGenAI } from "@google/genai";
import { AIProvider } from "./provider";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/** Free-tier alternative to anthropicProvider — same AIProvider contract, swap via AI_PROVIDER=gemini. */
export const geminiProvider: AIProvider = {
  async chat({ systemPrompt, messages }) {
    const response = await getClient().models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      config: { systemInstruction: systemPrompt, maxOutputTokens: 1024 },
    });
    return response.text ?? "";
  },
};
