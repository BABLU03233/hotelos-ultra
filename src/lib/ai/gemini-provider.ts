import { GoogleGenAI } from "@google/genai";
import { AIProvider } from "./provider";

/**
 * Free-tier alternative to anthropicProvider — same AIProvider contract.
 * A factory (not a single fixed provider) so a second Gemini account/key
 * can sit right behind the first in the fallback chain — independent
 * quota, so it's real redundancy rather than hitting the same cap twice.
 * Each instance gets its own lazily-created client, keyed by its own env var.
 */
export function createGeminiProvider(apiKeyEnvVar: string, label: string): AIProvider {
  let client: GoogleGenAI | null = null;

  function getClient(): GoogleGenAI {
    if (!client) {
      const apiKey = process.env[apiKeyEnvVar];
      if (!apiKey) throw new Error(`${apiKeyEnvVar} is not set`);
      client = new GoogleGenAI({ apiKey });
    }
    return client;
  }

  return {
    name: label,
    async chat({ systemPrompt, messages }) {
      const response = await getClient().models.generateContent({
        // "-latest" alias tracks Google's current flash-tier model — pinned
        // versions (e.g. gemini-2.5-flash) get retired from new accounts
        // over time (confirmed: 2.5-flash already 404s "no longer available
        // to new users" as of Aug 2026), so an alias avoids repeating that.
        model: process.env.GEMINI_MODEL || "gemini-flash-latest",
        contents: messages.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        config: {
          systemInstruction: systemPrompt,
          maxOutputTokens: 1024,
          // No retries: our own fallback chain (pipeline.ts) already moves to
          // the next provider on failure. The SDK's default (5 attempts,
          // exponential backoff up to 60s between tries) was silently adding
          // up to a minute of latency per guest reply on free-tier rate limits.
          httpOptions: { timeout: 15_000, retryOptions: { attempts: 1 } },
        },
      });
      const text = response.text ?? "";
      if (!text.trim()) throw new Error(`Gemini returned empty content (${label})`);
      return text;
    },
  };
}

export const geminiProvider = createGeminiProvider("GEMINI_API_KEY", "gemini");
